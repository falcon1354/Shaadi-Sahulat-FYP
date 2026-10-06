"""
ShaadiSahulat - Hybrid Embedding Index
=======================================
Builds and queries a hybrid index that combines:
  • Image similarity   — cosine distance in 1280-dim EfficientNet-B0 BACKBONE space
  • Text similarity    — TF-IDF cosine similarity on auto-generated descriptions

IMPORTANT — why 1280-dim backbone features (not 128-dim custom head):
  The custom 128-dim head (Linear→ReLU→Dropout→Linear) has random weights
  without fine-tuning → all cosine similarities collapse to ~0.
  The 1280-dim backbone output from pretrained ImageNet weights already captures
  colour, texture and pattern — gives real visual similarity immediately.

Build flow (call build_index once after seeding catalog):
  1. For every image in catalog/{category}/
     a. Extract 1280-dim backbone embedding via EfficientNet-B0
     b. Generate text description  (colour + category + embroidery density)
     c. Store both in MongoDB
  2. TF-IDF vectorizer: load existing pkl if available (do NOT re-fit if already fitted
     by fit_corpus_vectorizer.py).  Only fit from catalog descs as a last resort.
  3. Write all products to MongoDB (dress_catalog collection).

Query flow (hybrid_search — called per recommendation request):
  1. Products loaded from MongoDB (seller_products) into RAM
  2. Score every product by image cosine similarity (primary)
  3. Shortlist top IMAGE_CANDIDATE_POOL by image_sim; drop weak visuals
  4. Lightly blend color + TF-IDF as tie-breakers only (~6–12%)
  5. Return top-K sorted by vision-first hybrid score
"""

from __future__ import annotations

import os
import numpy as np
import torch
import torchvision.transforms as transforms
from PIL import Image

from config import (
    IMAGE_SIZE, CATEGORY_IDS, CATEGORY_LABELS,
    HYBRID_WEIGHTS, MAX_RESULTS_DEFAULT, DRESS_TO_ML_CLASS,
    MIN_IMAGE_SIM_FOR_RESULTS, IMAGE_CANDIDATE_POOL,
)
from description_generator import generate_description
from tfidf_engine import (
    fit_vectorizer, description_to_tfidf_dict, tfidf_cosine_similarity,
    vectorizer_is_fitted,
)
from mongo_catalog import (
    upsert_product, get_all_products, get_products_by_category,
    get_all_descriptions, count_total, count_by_category,
    ensure_indexes, clear_catalog,
)

_TRANSFORM = transforms.Compose([
    transforms.Resize((IMAGE_SIZE, IMAGE_SIZE)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406],
                         std=[0.229, 0.224, 0.225]),
])

# ── In-memory cache ────────────────────────────────────────────────────────
# Avoids a MongoDB round-trip on every recommendation request.

_cache: dict[str, list | None] = {"products": None}


def _load_cache(force: bool = False):
    """Populate the in-memory product cache from seller_products only."""
    if _cache["products"] is None or force:
        try:
            from mongo_seller import get_seller_products_for_search
            seller_prods = get_seller_products_for_search()
        except Exception as e:
            print(f"[Index] Could not load seller products: {e}")
            seller_prods = []
        _cache["products"] = seller_prods
        print(f"[Index] Cache loaded: {len(seller_prods)} seller products")
    return _cache["products"]


def invalidate_cache():
    """Call after index rebuild so the next query reloads fresh data."""
    _cache["products"] = None


# ── Build ──────────────────────────────────────────────────────────────────

def build_index(
    model,
    catalog_dir: str,
    device: str = "cpu",
    descriptions_dict: dict | None = None,
) -> tuple[int, dict]:
    """
    Full index rebuild from catalog images.

    Parameters
    ----------
    model             : DressEmbeddingModel (pretrained or fine-tuned)
    catalog_dir       : path to catalog/ directory (contains sub-folders per category)
    device            : "cpu" or "cuda"
    descriptions_dict : optional manual descriptions loaded from descriptions.json
                        format: {category_id: {filename: "description text"}}
                        If provided, manual text overrides auto-generated descriptions.

    Steps
    -----
    1. Extract embeddings + generate descriptions for every catalog image.
    2. If descriptions_dict provided, override auto-descriptions with manual ones.
    3. Fit TF-IDF on all collected descriptions.
    4. Upsert every product into MongoDB (includes TF-IDF vector).
    5. Invalidate in-memory cache.

    Returns
    -------
    (total_indexed, per_category_counts)
    """
    ensure_indexes()
    clear_catalog()           # full rebuild — start fresh
    model.eval()

    raw_entries   = []        # collected before TF-IDF fit
    all_descs     = []
    product_count = 0

    print("[Index] Phase 1 — extracting embeddings + descriptions …")
    for cat_id in CATEGORY_IDS:
        cat_dir = os.path.join(catalog_dir, cat_id)
        if not os.path.exists(cat_dir):
            print(f"  [Index] {cat_id}: directory not found — skipping")
            continue

        valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
        files = sorted(
            f for f in os.listdir(cat_dir)
            if os.path.splitext(f)[1].lower() in valid_exts
        )

        if not files:
            print(f"  [Index] {cat_id}: no images found")
            continue

        cat_label     = CATEGORY_LABELS.get(cat_id, cat_id)
        cat_descs_map = (descriptions_dict or {}).get(cat_id, {})

        for fname in files:
            product_count += 1
            product_id = f"{cat_id[:3].upper()}-{product_count:03d}"
            img_path   = os.path.join(cat_dir, fname)

            try:
                image  = Image.open(img_path).convert("RGB")
                tensor = _TRANSFORM(image).unsqueeze(0).to(device)

                with torch.no_grad():
                    # 1280-dim backbone features — real visual similarity
                    emb     = model.get_backbone_features(tensor)
                    emb_lst = emb.cpu().numpy().flatten().tolist()

                # Auto-detect colour + embroidery (always done for metadata)
                desc_data = generate_description(img_path, cat_id, cat_label)

                # Override description with manual text if provided
                manual_text = cat_descs_map.get(fname, "").strip()
                if manual_text:
                    desc_data["description"] = manual_text
                    desc_data["keywords"] = list({
                        w.strip(".,!?;:\"'")
                        for w in manual_text.lower().split()
                        if len(w.strip(".,!?;:\"'")) > 2
                    })

                all_descs.append(desc_data["description"])

                raw_entries.append({
                    "product_id": product_id,
                    "category":   cat_id,
                    "image_path": img_path,
                    "desc_data":  desc_data,
                    "embedding":  emb_lst,
                })

            except Exception as exc:
                print(f"  [Index] Skipped {img_path}: {exc}")

        print(f"  [Index] {cat_id}: {len(files)} images processed")

    if not raw_entries:
        print("[Index] No images found in catalog. Run seed_catalog.py first.")
        return 0, {}

    # Phase 2 — TF-IDF: use existing pkl if available (fit_corpus_vectorizer.py
    # should have been run once already with the representative corpus).
    # Only fall back to fitting on catalog descriptions when no pkl exists yet.
    if vectorizer_is_fitted():
        print("[Index] Phase 2 — TF-IDF vectorizer already fitted, reusing pkl")
    else:
        print("[Index] Phase 2 — fitting TF-IDF on catalog descriptions (run "
              "fit_corpus_vectorizer.py first for better vocabulary coverage)")
        fit_vectorizer(all_descs)

    # Phase 3 — write to MongoDB (vectorizer is now fitted)
    print("[Index] Phase 3 — writing to MongoDB …")
    for entry in raw_entries:
        upsert_product(
            entry["product_id"],
            entry["category"],
            entry["image_path"],
            entry["desc_data"],
            entry["embedding"],
        )

    invalidate_cache()

    total   = count_total()
    by_cat  = count_by_category()
    print(f"[Index] Build complete — {total} products in MongoDB")
    return total, by_cat


# ── Single-product add (seller upload — no retraining) ─────────────────────

def add_single_product(
    model,
    image_path: str,
    category_id: str,
    description: str,
    device: str = "cpu",
) -> dict:
    """
    Add one seller product to the catalog without rebuilding the whole index.

    The existing model and TF-IDF vectorizer are reused — no retraining needed.
    The caller must have already saved the image file to catalog/{category_id}/.

    Parameters
    ----------
    model       : loaded DressEmbeddingModel
    image_path  : absolute path to the saved image
    category_id : e.g. "bridal_lehenga"
    description : seller-written description text
    device      : "cpu" or "cuda"

    Returns
    -------
    dict  {"product_id": str, "status": "added"}
    """
    from config import CATEGORY_LABELS

    cat_label = CATEGORY_LABELS.get(category_id, category_id)

    image  = Image.open(image_path).convert("RGB")
    tensor = _TRANSFORM(image).unsqueeze(0).to(device)
    model.eval()

    with torch.no_grad():
        # 1280-dim backbone features — same space as catalog embeddings
        emb     = model.get_backbone_features(tensor)
        emb_lst = emb.cpu().numpy().flatten().tolist()

    # Auto-detect colour + embroidery metadata, then override description
    desc_data = generate_description(image_path, category_id, cat_label)
    desc_data["description"] = description.strip()
    desc_data["keywords"] = list({
        w.strip(".,!?;:\"'")
        for w in description.lower().split()
        if len(w.strip(".,!?;:\"'")) > 2
    })

    total      = count_total()
    prefix     = category_id[:3].upper()
    product_id = f"{prefix}-{total + 1:03d}"

    upsert_product(product_id, category_id, image_path, desc_data, emb_lst)
    invalidate_cache()

    return {"product_id": product_id, "status": "added"}


# ── Color similarity helpers ───────────────────────────────────────────────

def _hue_family(hue_deg: float, saturation: float) -> str:
    """Map HSV values to a broad color family."""
    if saturation < 0.18:
        return "neutral"
    h = hue_deg % 360
    if h < 20 or h >= 330: return "red"
    if h < 42:             return "orange"
    if h < 68:             return "gold"
    if h < 165:            return "green"
    if h < 198:            return "teal"
    if h < 258:            return "blue"
    if h < 288:            return "purple"
    return "pink"


def _exact_color_sim(q: dict, p: dict) -> float:
    """
    HSV-space color similarity.
    Hue distance within ±28° → 1.0→0.0; saturation & brightness within ±0.30.
    Returns 0.0–1.0.
    """
    if not q or not p:
        return 0.0
    hue_dist = abs(q.get("hue", 0) - p.get("hue", 0))
    if hue_dist > 180:
        hue_dist = 360 - hue_dist
    hue_sim = max(0.0, 1.0 - hue_dist / 28.0)
    sat_sim = max(0.0, 1.0 - abs(q.get("saturation", 0) - p.get("saturation", 0)) / 0.30)
    val_sim = max(0.0, 1.0 - abs(q.get("brightness",  0) - p.get("brightness",  0)) / 0.30)
    return round(0.60 * hue_sim + 0.25 * sat_sim + 0.15 * val_sim, 4)


def _family_color_sim(q: dict, p: dict) -> float:
    """1.0 if q and p are in the same broad color family, else 0.0."""
    if not q or not p:
        return 0.0
    qf = _hue_family(q.get("hue", 0), q.get("saturation", 0))
    pf = _hue_family(p.get("hue", 0), p.get("saturation", 0))
    return 1.0 if qf == pf else 0.0


# ── 5-Level Cascade (labels + light scoring) ───────────────────────────────
#
# Ranking is VISION-FIRST: candidates are first shortlisted by image cosine,
# then lightly re-scored. Text/TF-IDF never outranks a stronger visual match.
#
# Each entry: (level, label, min_img, min_ce, min_cf, min_tf, weights)
# weights = (w_img, w_color_exact, w_color_family, w_tfidf) — must sum to 1
#
_CASCADE_LEVELS = [
    # Lv  Label              img    ce     cf     tf     weights (img-heavy)
    (1, "Visual Match",      0.50,  None,  None,  None,  (1.00, 0.00, 0.00, 0.00)),
    (2, "Color Match",       0.32,  0.55,  None,  None,  (0.70, 0.25, 0.00, 0.05)),
    (3, "Color Family",      0.28,  None,  0.65,  None,  (0.72, 0.00, 0.20, 0.08)),
    (4, "Category Match",    0.24,  None,  None,  0.10,  (0.78, 0.00, 0.00, 0.22)),
    (5, "Closest Match",     None,  None,  None,  None,  (0.88, 0.04, 0.00, 0.08)),
]


def _cascade_level(
    img_sim: float,
    color_exact: float,
    color_family: float,
    tfidf_sim: float,
) -> tuple[int, str, float]:
    """Return (level, label, score) — score is always image-dominated."""
    for lv, label, img_t, ce_t, cf_t, tf_t, w in _CASCADE_LEVELS:
        if img_t is not None and img_sim     < img_t: continue
        if ce_t  is not None and color_exact < ce_t:  continue
        if cf_t  is not None and color_family < cf_t: continue
        if tf_t  is not None and tfidf_sim   < tf_t:  continue
        score = w[0]*img_sim + w[1]*color_exact + w[2]*color_family + w[3]*tfidf_sim
        return lv, label, score
    # Fallback: almost pure visual
    score = 0.90 * img_sim + 0.05 * max(color_exact, color_family * 0.5) + 0.05 * tfidf_sim
    return 5, "Closest Match", score


def _vision_score(
    img_sim: float,
    color_exact: float,
    color_family: float,
    tfidf_sim: float,
    has_category: bool,
) -> float:
    """Primary ranking score — image cosine dominates text/color."""
    # Explicit vision-first blend regardless of older text-heavy configs
    color_boost = max(color_exact, 0.55 * color_family)
    return (
        0.82 * img_sim
        + 0.12 * color_boost
        + 0.06 * tfidf_sim
    )


# ── Cascade search ─────────────────────────────────────────────────────────

def _ml_class_for(category: str | None) -> str:
    """Map fine-grained dress item_type → nearest 3-class ML label."""
    cat = (category or "").strip()
    if not cat:
        return ""
    return DRESS_TO_ML_CLASS.get(cat, cat)


def hybrid_search(
    query_embedding:  list[float],
    query_tfidf_vec:  dict,
    category:         str | None,
    query_color_info: dict | None = None,
    top_k:            int = MAX_RESULTS_DEFAULT,
) -> list[dict]:
    """
    Vision-first similarity search (seller_products only).

    1. Score every dress by image cosine similarity
    2. Keep the top IMAGE_CANDIDATE_POOL by image_sim (and drop very weak visuals)
    3. Lightly blend color + TF-IDF as tie-breakers only
    4. Sort by vision_score / image_sim — never let text outrank a better visual match
    """
    products = _load_cache()
    if not products:
        return []

    search_ml = _ml_class_for(category) if category else ""
    candidates = products

    q_np   = np.array(query_embedding, dtype=float)
    q_norm = q_np / (np.linalg.norm(q_np) + 1e-8)

    scored = []
    for prod in candidates:
        emb = prod.get("image_embedding")
        if not emb:
            continue

        p_np   = np.array(emb, dtype=float)
        p_norm = p_np / (np.linalg.norm(p_np) + 1e-8)

        img_sim      = float(np.clip(np.dot(q_norm, p_norm), 0.0, 1.0))
        tfidf_sim    = tfidf_cosine_similarity(query_tfidf_vec, prod.get("tfidf_vector", {}))
        prod_color   = prod.get("color_info", {})
        color_exact  = _exact_color_sim(query_color_info,  prod_color) if query_color_info else 0.0
        color_family = _family_color_sim(query_color_info, prod_color) if query_color_info else 0.0

        level, match_label, cascade_score = _cascade_level(
            img_sim, color_exact, color_family, tfidf_sim
        )

        # Near-duplicate marketplace photo → force Visual Match
        if img_sim >= 0.78:
            level, match_label = 1, "Visual Match"

        vision = _vision_score(
            img_sim, color_exact, color_family, tfidf_sim, bool(category)
        )

        # Tiny soft category nudge — only when visual is already decent
        if search_ml and img_sim >= 0.28:
            prod_ml = _ml_class_for(prod.get("category"))
            if prod.get("category") == category or prod_ml == search_ml:
                vision = min(1.0, vision + 0.02)

        # Final score: image dominates; cascade label is informational
        score = 0.92 * vision + 0.08 * cascade_score

        img_url = prod.get("image_url") or prod.get("image_path", "")
        scored.append({
            "product_id":         prod["product_id"],
            "title":              prod.get("title", ""),
            "category":           prod["category"],
            "image_url":          img_url,
            "image_path":         prod.get("image_path", ""),
            "description":        prod.get("description", ""),
            "keywords":           prod.get("keywords", []),
            "color_info":         prod_color,
            "embroidery_density": prod.get("embroidery_density", ""),
            "price":              prod.get("price"),
            "discount_price":     prod.get("discount_price"),
            "seller_name":        prod.get("seller_name", ""),
            "seller_id":          prod.get("seller_id", ""),
            "image_similarity":   round(img_sim,      4),
            "color_exact_sim":    round(color_exact,  4),
            "color_family_sim":   round(color_family, 4),
            "text_similarity":    round(tfidf_sim,    4),
            "hybrid_score":       round(score,        4),
            "match_percentage":   round(score * 100,  1),
            "match_level":        level,
            "match_label":        match_label,
        })

    if not scored:
        return []

    # 1) Shortlist by pure visual similarity
    scored.sort(key=lambda x: x["image_similarity"], reverse=True)
    pool = scored[: max(IMAGE_CANDIDATE_POOL, top_k * 8)]

    # 2) Drop weak visuals when stronger ones exist
    strong = [r for r in pool if r["image_similarity"] >= MIN_IMAGE_SIM_FOR_RESULTS]
    if len(strong) >= top_k:
        pool = strong
    elif strong:
        # Keep strong first, then fill from next-best visuals only
        weak = [r for r in pool if r["image_similarity"] < MIN_IMAGE_SIM_FOR_RESULTS]
        pool = strong + weak[: max(0, top_k - len(strong))]

    # 3) Final rank: vision score, then raw image_sim (text cannot overtake)
    pool.sort(
        key=lambda x: (-x["hybrid_score"], -x["image_similarity"], x["match_level"])
    )
    return pool[:top_k]


# ── Stats helper ───────────────────────────────────────────────────────────

def get_index_stats() -> dict:
    try:
        from mongo_seller import get_seller_product_count
        seller_count = get_seller_product_count()
    except Exception:
        seller_count = 0
    catalog_count = count_total()
    total = catalog_count + seller_count
    return {
        "index_exists":      total > 0,
        "total_products":    total,
        "catalog_products":  catalog_count,
        "seller_products":   seller_count,
        "categories":        count_by_category(),
        "tfidf_fitted":      vectorizer_is_fitted(),
    }
