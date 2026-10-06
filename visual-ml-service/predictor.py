"""
ShaadiSahulat Visual Recommendation - Predictor
=================================================
3-Stage Hybrid Pipeline:

  Stage 1 — Safety Check
    • Image dimensions / colour variance check
    • Rejects blank / solid-colour / too-small images

  Stage 2 — Category Validation
    • EfficientNet-B0 predicts dress category + confidence
    • Uses user-supplied category hint when model confidence is borderline
    • Rejects if confidence < CATEGORY_CONFIDENCE_THRESHOLD

  Stage 3 — Hybrid Similarity Search
    • Generates a text description of the query image
      (colour name + embroidery density via description_generator)
    • Converts description → TF-IDF vector
    • Runs hybrid_search: 70% image-similarity + 30% TF-IDF similarity
    • Returns exactly 2 results

Returns exactly MAX_RESULTS_DEFAULT (2) recommendations on success.
"""

from __future__ import annotations

import io
import time
import numpy as np
from PIL import Image
import torch
import torch.nn.functional as F
import torchvision.transforms as transforms

from config import (
    IMAGE_SIZE, CATEGORY_IDS, CATEGORY_LABELS, NUM_CLASSES,
    CATEGORY_CONFIDENCE_THRESHOLD, MAX_RESULTS_DEFAULT,
    MODEL_DIR, BACKBONE,
)
from model import load_model_for_inference, is_model_fine_tuned
from description_generator import generate_description
from tfidf_engine import description_to_tfidf_dict, preprocess_text
from embedding_index import hybrid_search

# Minimum quality gate: if even the best result scores below this in ALL
# similarity dimensions, we consider the uploaded image non-matching.
_GATE_THRESHOLD = 0.40

# Map free-text dress words → catalog category ids
_DESC_CATEGORY_KEYWORDS = (
    ("bridal_lehenga", ("lehenga", "lengha", "lehanga", "ghagra", "gagra")),
    ("bridal_sharara", ("sharara", "gharara", "garara")),
    ("bridal_saree",   ("saree", "sari", "sarree")),
)


def _infer_category_from_text(text: str) -> str | None:
    """Pick a dress category from the buyer's typed description, if any."""
    if not text:
        return None
    t = text.lower()
    for cat_id, words in _DESC_CATEGORY_KEYWORDS:
        if any(w in t for w in words):
            return cat_id
    return None


class VisualPredictor:
    """
    3-stage hybrid recommendation predictor.
    Single instance shared across all requests (singleton via get_predictor()).
    """

    def __init__(self, device: str = "cpu"):
        self.device = device
        self.model  = None

        self.transform = transforms.Compose([
            transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229,  0.224, 0.225],
            ),
        ])
        self._load_model()

    # ── Model loading ──────────────────────────────────────────────────────

    def _load_model(self):
        try:
            self.model = load_model_for_inference(
                model_dir=MODEL_DIR,
                backbone=BACKBONE,
                device=self.device,
            )
            print("[Predictor] Model ready.")
        except Exception as exc:
            print(f"[Predictor] Could not load model: {exc}")
            print("[Predictor] Running in demo mode — mock predictions only.")
            self.model = None

    # ── Public API ─────────────────────────────────────────────────────────

    def predict(
        self,
        image_bytes:        bytes,
        preferred_category: str | None = None,
        limit:              int        = MAX_RESULTS_DEFAULT,
        user_description:   str        = "",
    ) -> dict:
        """
        Run the full 3-stage pipeline on raw image bytes.

        Parameters
        ----------
        image_bytes         : raw bytes from HTTP upload
        preferred_category  : explicit category chosen by the user in the UI
                              (always respected for search, regardless of model confidence)
        limit               : max results (capped at MAX_RESULTS_DEFAULT=3)
        user_description    : mandatory text typed by the user, preprocessed + merged with
                              auto-generated description for TF-IDF matching
        """
        limit = max(1, min(limit, MAX_RESULTS_DEFAULT))

        start = time.time()

        # Load image
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        except Exception as exc:
            return {
                "status": "error",
                "stage":  "image_loading",
                "reason": f"Cannot open image: {exc}",
                "suggestion": "Upload a valid JPG or PNG file.",
            }

        # ── Stage 1: Safety ────────────────────────────────────────────────
        s1 = self._stage1_safety(image)
        if not s1["passed"]:
            return {
                "status":     "rejected",
                "stage":      "content_safety",
                "reason":     s1["reason"],
                "suggestion": "Upload a clear, full-dress photo.",
                "validation": {"stage1_passed": False, "stage2_passed": False},
            }

        # ── Stage 2: Category prediction ──────────────────────────────────
        s2 = self._stage2_category(image, preferred_category, user_description)
        if not s2["passed"]:
            return {
                "status":              "rejected",
                "stage":               "category_validation",
                "reason":              s2["reason"],
                "detected_confidence": s2.get("confidence", 0),
                "closest_category":    s2.get("category"),
                "suggestion": (
                    f"Upload an image of a supported dress type: "
                    f"{', '.join(CATEGORY_LABELS.values())}. "
                    f"Also name the style in your description (e.g. lehenga, sharara, saree)."
                ),
                "supported_categories": CATEGORY_IDS,
                "validation": {
                    "stage1_passed":      True,
                    "stage2_passed":      False,
                    "predicted_category": s2.get("category"),
                    "confidence":         s2.get("confidence", 0),
                },
            }

        predicted_category = s2["category"]
        confidence         = s2["confidence"]
        query_embedding    = s2["embedding"]

        # ── Stage 3: Cascade similarity search ────────────────────────────
        desc_data        = self._build_query_description(image, predicted_category)
        query_color_info = desc_data.get("color_info")

        # Merge user description lightly — visual auto-desc stays primary for TF-IDF.
        # Putting auto_desc first keeps keyword spam in the text box from dominating.
        auto_desc = desc_data["description"]
        if user_description and user_description.strip():
            clean_user = preprocess_text(user_description)
            combined_desc = f"{auto_desc} {clean_user}"
        else:
            combined_desc = auto_desc

        query_tfidf = description_to_tfidf_dict(combined_desc)

        # Category for search:
        #  - honour explicit UI / description category when provided
        #  - if the classifier is unsure (pretrained-only / low confidence),
        #    search ALL bridal categories so a good visual match is not filtered out
        if preferred_category and preferred_category in CATEGORY_IDS:
            search_category = preferred_category
        elif s2.get("from_description") and predicted_category in CATEGORY_IDS:
            search_category = predicted_category
        elif confidence < 0.45 or s2.get("soft_passed"):
            search_category = None
        else:
            search_category = predicted_category

        results = hybrid_search(
            query_embedding  = query_embedding,
            query_tfidf_vec  = query_tfidf,
            category         = search_category,
            query_color_info = query_color_info,
            top_k            = limit,
        )

        # ── Post-search similarity gate ────────────────────────────────────
        # Reject when NONE of the returned results looks visually related.
        if results:
            best = results[0]
            best_img = best.get("image_similarity", 0)
            best_any_dim = max(
                best_img,
                best.get("color_exact_sim",   0) * 0.5,  # color alone is not enough
                best.get("color_family_sim",  0) * 0.35,
                best.get("text_similarity",   0) * 0.25,  # text alone must not pass the gate
            )
            # Prefer a visual floor: weak image match → reject even if text matched
            if best_img < 0.18 or best_any_dim < _GATE_THRESHOLD:
                return {
                    "status": "rejected",
                    "stage":  "similarity_gate",
                    "reason": (
                        f"No visually similar bridal dress found. "
                        f"Best image similarity was {best_img * 100:.0f}% "
                        f"(need about {max(_GATE_THRESHOLD, 0.18) * 100:.0f}%+). "
                        f"Upload a clearer full-length dress photo."
                    ),
                    "best_score": round(best_img, 4),
                    "threshold":  max(_GATE_THRESHOLD, 0.18),
                    "suggestion": "Try: a full-length dress photo on a plain background, "
                                  "and optionally name the style (lehenga / sharara / saree).",
                    "validation": {
                        "stage1_passed": True,
                        "stage2_passed": True,
                        "stage3_passed": False,
                        "predicted_category": predicted_category,
                    },
                }

        elapsed_ms = int((time.time() - start) * 1000)

        return {
            "status": "success",
            "validation": {
                "stage1_passed":           True,
                "stage2_passed":           True,
                "predicted_category":      predicted_category,
                "predicted_label":         CATEGORY_LABELS.get(predicted_category, predicted_category),
                "confidence":              round(confidence, 4),
                "used_preferred_category": s2.get("used_preferred", False),
            },
            "query_analysis": {
                "auto_description":  auto_desc,
                "user_description":  user_description or "",
                "combined_used":     bool(user_description and user_description.strip()),
                "color":             query_color_info.get("name", "") if query_color_info else "",
                "color_hue":         query_color_info.get("hue",  0)  if query_color_info else 0,
                "embroidery":        desc_data.get("embroidery_density", ""),
                "keywords":          desc_data.get("keywords", []),
                "search_category":   search_category,
            },
            "results": results,
            "search_metadata": {
                "results_returned": len(results),
                "search_time_ms":   elapsed_ms,
                "model_backbone":   BACKBONE,
                "embedding_dim":    1280 if BACKBONE == "efficientnet_b0" else 2048,
                "cascade_levels": {
                    1: "Visual Match    — image_sim ≥ 0.65",
                    2: "Color Match     — image_sim ≥ 0.45 AND color ≥ 0.70",
                    3: "Color Family    — same hue family",
                    4: "Category Match  — tfidf ≥ 0.25",
                    5: "Closest Match   — fallback",
                },
            },
        }

    # ── Stage implementations ──────────────────────────────────────────────

    def _stage1_safety(self, image: Image.Image) -> dict:
        """
        Validate the image is a plausible dress photo.
        Rejects: too small, solid colour, completely blank.
        """
        w, h = image.size
        if w < 50 or h < 50:
            return {"passed": False, "reason": "Image is too small (minimum 50×50 px)."}

        arr    = np.array(image.resize((64, 64)))
        std_dev = float(np.std(arr))
        if std_dev < 8:
            return {
                "passed": False,
                "reason": "Image appears to be a solid colour, not a dress photo.",
            }

        return {"passed": True, "reason": ""}

    def _stage2_category(
        self,
        image:              Image.Image,
        preferred_category: str | None,
        user_description:   str = "",
    ) -> dict:
        """
        Predict dress category via EfficientNet-B0 + 128-dim embedding.

        The category head is only reliable after fine-tuning. With ImageNet-only
        weights, softmax confidence often sits near ~33% for 3 classes — so we
        soft-pass using (in order): UI hint → description keywords → top class,
        and let the similarity gate reject non-dress uploads.
        """
        if self.model is None:
            return {
                "passed":     False,
                "category":   preferred_category or CATEGORY_IDS[0],
                "confidence": 0.0,
                "reason":     "Model failed to load. Restart the service and check the logs.",
            }

        tensor = self.transform(image).unsqueeze(0).to(self.device)

        with torch.no_grad():
            logits, raw_emb = self.model(tensor)
            probs = F.softmax(logits, dim=1).cpu().numpy().flatten()

        top_idx  = int(np.argmax(probs))
        top_conf = float(probs[top_idx])

        predicted_cat = CATEGORY_IDS[top_idx] if top_idx < len(CATEGORY_IDS) else CATEGORY_IDS[0]
        used_preferred = False
        from_description = False
        soft_passed = False

        # 1) Explicit UI category always wins
        if preferred_category and preferred_category in CATEGORY_IDS:
            pref_idx  = CATEGORY_IDS.index(preferred_category)
            pref_conf = float(probs[pref_idx]) if pref_idx < len(probs) else top_conf
            predicted_cat  = preferred_category
            top_conf       = max(top_conf, pref_conf, CATEGORY_CONFIDENCE_THRESHOLD)
            used_preferred = True

        # 2) Infer from buyer description (e.g. "red bridal lehenga…")
        if not used_preferred:
            inferred = _infer_category_from_text(user_description)
            if inferred:
                predicted_cat = inferred
                top_conf = max(top_conf, CATEGORY_CONFIDENCE_THRESHOLD)
                from_description = True

        # 3) Soft-pass when classifier is not fine-tuned / confidence is middling
        fine_tuned = is_model_fine_tuned()
        if not used_preferred and not from_description:
            if (not fine_tuned) or top_conf >= CATEGORY_CONFIDENCE_THRESHOLD:
                soft_passed = not fine_tuned and top_conf < CATEGORY_CONFIDENCE_THRESHOLD
            else:
                return {
                    "passed":     False,
                    "category":   predicted_cat,
                    "confidence": top_conf,
                    "reason": (
                        f"Uploaded image does not clearly match any supported dress category "
                        f"(confidence {top_conf:.0%} < threshold {CATEGORY_CONFIDENCE_THRESHOLD:.0%})."
                    ),
                }

        # Extract 1280-dim backbone features for similarity search
        # (must match catalog embedding space — see embedding_index.py)
        with torch.no_grad():
            emb_norm = self.model.get_backbone_features(tensor)
            embedding = emb_norm.cpu().numpy().flatten().tolist()

        return {
            "passed":       True,
            "category":     predicted_cat,
            "confidence":   top_conf,
            "embedding":    embedding,
            "used_preferred": used_preferred,
            "from_description": from_description,
            "soft_passed": soft_passed,
            "all_probabilities": {
                CATEGORY_IDS[i]: round(float(probs[i]), 4)
                for i in range(min(NUM_CLASSES, len(probs)))
            },
        }

    def _build_query_description(
        self,
        image:       Image.Image,
        category_id: str,
    ) -> dict:
        """
        Generate description for the user's query image.
        Uses a temporary file path trick because description_generator
        accepts both paths and PIL Images (it checks the type).
        """
        cat_label = CATEGORY_LABELS.get(category_id, category_id)
        return generate_description(image, category_id, cat_label)


# ── Singleton ──────────────────────────────────────────────────────────────

_predictor: VisualPredictor | None = None


def get_predictor(device: str = "cpu") -> VisualPredictor:
    global _predictor
    if _predictor is None:
        _predictor = VisualPredictor(device)
    return _predictor
