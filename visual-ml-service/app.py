"""
ShaadiSahulat Visual Recommendation - Flask API
=================================================
REST API for the hybrid image+text recommendation pipeline.
"""

import os
from pathlib import Path

# Load root .env (TRYON_PROVIDER, KLING_API_KEY, MONGODB_URI, …)
try:
    from dotenv import load_dotenv
    root_env = Path(__file__).resolve().parents[1] / ".env"
    load_dotenv(root_env)
    load_dotenv()  # also local visual-ml-service/.env if present
except Exception:
    pass

import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

from config import (
    CATEGORY_IDS, CATEGORY_LABELS, CATEGORIES,
    MAX_UPLOAD_SIZE_MB, MAX_RESULTS_DEFAULT,
    FLASK_HOST, FLASK_PORT,
    MODEL_DIR, BACKBONE, FINE_TUNED_MODEL_PATH,
    CATALOG_DIR, UPLOADS_DIR, DESCRIPTIONS_FILE, TRAINING_DATA_DIR,
)
from seller_routes import seller_bp
from dowry_routes import dowry_bp
from review_ai import review_ai_bp
from tryon_routes import tryon_bp

_HAS_VISUAL_MODEL = False
_IMPORT_ERR = None

try:
    from predictor import get_predictor
    from embedding_index import build_index, add_single_product, get_index_stats
    _HAS_VISUAL_MODEL = True
except ImportError as _exc:
    _IMPORT_ERR = str(_exc)
    print(f"[app] Visual model import failed: {_IMPORT_ERR}")
    print("[app] Tip: start with  .venv\\Scripts\\python.exe app.py  (or npm run dev:visual)")

    def get_predictor():
        raise RuntimeError(
            "Visual ML deps missing — use visual-ml-service\\.venv\\Scripts\\python.exe app.py. "
            f"Detail: {_IMPORT_ERR}"
        )

    def get_index_stats():
        return {
            "index_exists": False,
            "total_products": 0,
            "tfidf_fitted": False,
            "seller_products": 0,
        }

    def build_index(*_a, **_k):
        return 0, {}

    def add_single_product(*_a, **_k):
        return False

try:
    from data_loader import validate_dataset, print_dataset_report
except ImportError:
    def validate_dataset(*_a, **_k):
        return False, {}, ["PyTorch/torchvision not available in this Python"]

    def print_dataset_report(*_a, **_k):
        pass

from internal_auth import install_internal_guard, frontend_origins, debug_enabled

app = Flask(__name__)
# Browser access is limited to the configured frontend; everything except /images
# and /health additionally requires the Node backend's X-Internal-Secret.
CORS(app, origins=frontend_origins())
install_internal_guard(app)

# Register blueprints
app.register_blueprint(seller_bp)
app.register_blueprint(dowry_bp)
app.register_blueprint(review_ai_bp)
app.register_blueprint(tryon_bp)


# ── Catalog image serving ─────────────────────────────────────────────────

@app.route("/images/<path:image_path>")
def serve_catalog_image(image_path):
    """Serve product images. Checks uploads/ first, then catalog/ fallback."""
    # uploads/ is the primary store for seller product images
    uploads_full = os.path.join(UPLOADS_DIR, image_path)
    if os.path.exists(uploads_full):
        return send_from_directory(UPLOADS_DIR, image_path)
    # catalog/ fallback for legacy seed data
    return send_from_directory(CATALOG_DIR, image_path)


# ── Health ─────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    if not _HAS_VISUAL_MODEL:
        return jsonify({
            "status":               "ok",
            "service":              "shaadi-sahulat-visual-ml",
            "backbone":             BACKBONE,
            "model_trained":        False,
            "model_loaded":         False,
            "model_source":         "unavailable_no_torch",
            "embedding_dim":        0,
            "index_built":          False,
            "total_indexed":        0,
            "seller_products":      0,
            "tfidf_fitted":         False,
            "categories_supported": len(CATEGORIES),
        })
    from model import is_model_fine_tuned
    fine_tuned   = is_model_fine_tuned()
    stats        = get_index_stats()
    emb_dim      = 1280 if BACKBONE == "efficientnet_b0" else 2048
    return jsonify({
        "status":               "ok",
        "service":              "shaadi-sahulat-visual-ml",
        "backbone":             BACKBONE,
        "model_trained":        fine_tuned,
        "model_loaded":         True,          # always True — pretrained fallback
        "model_source":         "fine_tuned" if fine_tuned else "pretrained_imagenet",
        "embedding_dim":        emb_dim,
        "index_built":          stats["index_exists"],
        "total_indexed":        stats["total_products"],
        "seller_products":      stats.get("seller_products", 0),
        "tfidf_fitted":         stats["tfidf_fitted"],
        "categories_supported": len(CATEGORIES),
    })


# ── Categories ─────────────────────────────────────────────────────────────

@app.route("/visual/categories", methods=["GET"])
def get_categories():
    return jsonify({"categories": CATEGORIES, "total": len(CATEGORIES)})


# ── Main recommendation ────────────────────────────────────────────────────

@app.route("/visual/recommend", methods=["POST"])
def recommend():
    """
    Upload a dress image and get 2 similar dress recommendations.

    Form fields (multipart/form-data):
      image              — image file (JPG/PNG/WebP, max 5 MB)
      preferred_category — optional category hint string
      limit              — integer (ignored — always returns 2)
    """
    if "image" not in request.files:
        return jsonify({
            "status": "error",
            "reason": "No image uploaded. Send field 'image' as multipart/form-data.",
        }), 400

    image_file = request.files["image"]

    allowed_types = {"image/jpeg", "image/png", "image/jpg", "image/webp"}
    if image_file.content_type not in allowed_types:
        return jsonify({
            "status": "error",
            "reason": f"Unsupported file type: {image_file.content_type}. Use JPG, PNG, or WebP.",
        }), 400

    image_bytes = image_file.read()
    if len(image_bytes) > MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        return jsonify({
            "status": "error",
            "reason": (
                f"Image too large ({len(image_bytes)/1024/1024:.1f} MB). "
                f"Maximum is {MAX_UPLOAD_SIZE_MB} MB."
            ),
        }), 400

    preferred_category = request.form.get("preferred_category") or None
    user_description   = (request.form.get("description") or "").strip()

    if preferred_category and preferred_category not in CATEGORY_IDS:
        return jsonify({
            "status": "error",
            "reason": f"Unknown category: {preferred_category!r}",
            "valid_categories": CATEGORY_IDS,
        }), 400

    try:
        limit = int(request.form.get("limit") or MAX_RESULTS_DEFAULT)
    except (TypeError, ValueError):
        limit = MAX_RESULTS_DEFAULT
    limit = max(1, min(limit, 12))

    if not _HAS_VISUAL_MODEL:
        return jsonify({
            "status": "error",
            "stage": "service",
            "reason": (
                "Visual ML model is unavailable (PyTorch/torchvision missing). "
                "Start the service with: npm run dev:visual "
                "(uses visual-ml-service\\.venv)."
            ),
            "suggestion": (
                "Stop the current python visual-ml-service process, create/activate "
                "visual-ml-service\\.venv, install requirements, then run npm run dev:visual."
            ),
            "detail": _IMPORT_ERR,
        }), 503

    try:
        predictor = get_predictor()
        result = predictor.predict(
            image_bytes,
            preferred_category,
            limit,
            user_description=user_description,
        )
    except Exception as exc:
        return jsonify({
            "status": "error",
            "stage": "service",
            "reason": f"Visual recommendation failed: {exc}",
            "suggestion": "Confirm the ML service was started with npm run dev:visual and the index is built.",
        }), 500

    status_code = 200 if result.get("status") == "success" else 400
    return jsonify(result), status_code


# ── Build hybrid index ─────────────────────────────────────────────────────

@app.route("/visual/build-index", methods=["POST"])
def build_embedding_index():
    """
    Rebuild the hybrid index from catalog/ images.

    Works with or without a fine-tuned model:
      - If models/fine_tuned_*.pth exists → uses fine-tuned weights (best quality)
      - Otherwise → uses pretrained ImageNet EfficientNet-B0 (good visual similarity)

    Manual descriptions from descriptions.json are loaded automatically if the
    file exists. Otherwise descriptions are auto-generated from image analysis.

    Steps performed:
      1. Load model (fine-tuned or pretrained fallback)
      2. Load descriptions.json if present
      3. Extract embeddings for all catalog/ images
      4. Fit TF-IDF vectorizer on all descriptions
      5. Write to MongoDB (dress_catalog collection)
    """
    from model import load_model_for_inference

    try:
        model = load_model_for_inference(MODEL_DIR, BACKBONE)

        # Load manual descriptions if available
        descriptions_dict = None
        if os.path.exists(DESCRIPTIONS_FILE):
            with open(DESCRIPTIONS_FILE, "r", encoding="utf-8") as fh:
                descriptions_dict = json.load(fh)
            print(f"[app] Loaded descriptions.json")

        fine_tuned = os.path.exists(FINE_TUNED_MODEL_PATH)
        total, by_cat = build_index(model, CATALOG_DIR, descriptions_dict=descriptions_dict)

        return jsonify({
            "success":        True,
            "total_indexed":  total,
            "categories":     by_cat,
            "backbone":       BACKBONE,
            "model_source":   "fine_tuned" if fine_tuned else "pretrained_imagenet",
            "descriptions_loaded": descriptions_dict is not None,
        })
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


@app.route("/visual/backfill-dress-embeddings", methods=["POST"])
def backfill_dress_embeddings_route():
    """
    Compute EfficientNet embeddings for wedding_dress products in seller_products
    (seller uploads + scraped, new + thrift) and store vectors on each MongoDB doc.
    Query/body: force=1, limit=N, type=new|thrift
    """
    try:
        from dress_embedding import backfill_dress_embeddings

        body = request.get_json(silent=True) or {}
        force = str(request.args.get("force") or body.get("force") or "").lower() in ("1", "true", "yes")
        limit = int(request.args.get("limit") or body.get("limit") or 0)
        mtype = request.args.get("type") or body.get("type") or None
        if mtype not in ("new", "thrift", None):
            mtype = None

        result = backfill_dress_embeddings(force=force, limit=limit, marketplace_type=mtype)
        status = 200 if result.get("ok") else 500
        return jsonify({"success": bool(result.get("ok")), **result}), status
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# ── Seller: add a single product ───────────────────────────────────────────

@app.route("/visual/add-product", methods=["POST"])
def add_product():
    """
    Add one seller product to the catalog without retraining.

    Form fields (multipart/form-data):
      image       — image file (JPG/PNG/WebP, max 5 MB)
      category    — category ID (e.g. "bridal_lehenga")
      description — seller's text description of the dress
    """
    if "image" not in request.files:
        return jsonify({"success": False, "error": "No image uploaded."}), 400

    image_file  = request.files["image"]
    category    = request.form.get("category", "").strip()
    description = request.form.get("description", "").strip()

    if not category or category not in CATEGORY_IDS:
        return jsonify({
            "success":          False,
            "error":            f"Invalid or missing category. Valid: {CATEGORY_IDS}",
        }), 400

    if not description:
        return jsonify({"success": False, "error": "Description is required."}), 400

    image_bytes = image_file.read()
    if len(image_bytes) > MAX_UPLOAD_SIZE_MB * 1024 * 1024:
        return jsonify({
            "success": False,
            "error": f"Image too large (max {MAX_UPLOAD_SIZE_MB} MB).",
        }), 400

    # Save image to catalog/{category}/
    cat_dir  = os.path.join(CATALOG_DIR, category)
    os.makedirs(cat_dir, exist_ok=True)

    # Use original filename or generate one
    fname      = image_file.filename or f"product_{os.urandom(4).hex()}.jpg"
    img_path   = os.path.join(cat_dir, os.path.basename(fname))
    with open(img_path, "wb") as fh:
        fh.write(image_bytes)

    try:
        from model import load_model_for_inference
        model  = load_model_for_inference(MODEL_DIR, BACKBONE)
        result = add_single_product(model, img_path, category, description)

        return jsonify({
            "success":     True,
            "product_id":  result["product_id"],
            "category":    category,
            "image_saved": img_path,
        })
    except Exception as exc:
        # Clean up saved image on failure
        if os.path.exists(img_path):
            os.remove(img_path)
        return jsonify({"success": False, "error": str(exc)}), 500


# ── Index statistics ───────────────────────────────────────────────────────

@app.route("/visual/index-stats", methods=["GET"])
def index_stats():
    stats = get_index_stats()
    return jsonify({"success": True, **stats})


# ── Dataset status ─────────────────────────────────────────────────────────

@app.route("/visual/dataset-status", methods=["GET"])
def dataset_status():
    """Scan training_data/ folders. Does not require torch/torchvision."""
    try:
        from data_loader import scan_training_data
        scan = scan_training_data()
    except ImportError as exc:
        # System Python without torchvision: still report folder counts directly
        scan = {}
        valid_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
        for cat in CATEGORIES:
            cid = cat["id"]
            cat_dir = os.path.join(TRAINING_DATA_DIR, cid)
            if not os.path.isdir(cat_dir):
                scan[cid] = {"count": 0, "label": cat["label"]}
                continue
            files = [
                f for f in os.listdir(cat_dir)
                if os.path.splitext(f)[1].lower() in valid_exts
            ]
            scan[cid] = {"count": len(files), "label": cat["label"]}
        print(f"[app] dataset-status fallback (missing ML deps): {exc}")

    result = {}
    for cat in CATEGORIES:
        cid    = cat["id"]
        count  = scan.get(cid, {}).get("count", 0)
        result[cid] = {
            "label":        cat["label"],
            "count":        count,
            "min_required": 10,
            "recommended":  20,
            "status":       "ready" if count >= 10 else "needs_images",
        }

    total = sum(r["count"] for r in result.values())
    ready = sum(1 for r in result.values() if r["status"] == "ready")

    return jsonify({
        "success":         True,
        "total_images":    total,
        "categories_ready": f"{ready}/{len(CATEGORIES)}",
        "categories":      result,
    })


# ── Train (proxy — prefer Colab) ───────────────────────────────────────────

@app.route("/visual/train", methods=["POST"])
def train():
    """
    Trigger local training.  WARNING: very slow without a GPU.
    Preferred path: run the Colab notebook with a free T4 GPU.
    """
    try:
        is_valid, scan, warnings = validate_dataset()
        if not is_valid:
            return jsonify({
                "success":  False,
                "error":    "Dataset validation failed. Add images to training_data/ first.",
                "warnings": warnings,
                "scan":     {cat: info["count"] for cat, info in scan.items()},
            }), 400

        import torch
        from trainer import train_model
        device  = "cuda" if torch.cuda.is_available() else "cpu"
        history = train_model(device)

        if history is None:
            return jsonify({"success": False, "error": "Training failed."}), 500

        return jsonify({
            "success":           True,
            "backbone":          BACKBONE,
            "best_val_accuracy": max(history.get("val_accuracy", [0])),
            "epochs_trained":    len(history.get("train_loss", [])),
        })
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# ── Full init (train + build index) ───────────────────────────────────────

@app.route("/visual/init", methods=["POST"])
def init_pipeline():
    """Train model then build index in one call (use Colab for training)."""
    try:
        is_valid, scan, warnings = validate_dataset()
        if not is_valid:
            return jsonify({
                "success":  False,
                "error":    "Dataset validation failed.",
                "warnings": warnings,
            }), 400

        import torch
        from trainer import train_model
        from model import load_model_for_inference
        from config import TRAINING_DATA_DIR

        device  = "cuda" if torch.cuda.is_available() else "cpu"
        history = train_model(device)

        if history is None:
            return jsonify({"success": False, "error": "Training failed."}), 500

        model           = load_model_for_inference(MODEL_DIR, BACKBONE, device)
        total, by_cat   = build_index(model, TRAINING_DATA_DIR, device)

        return jsonify({
            "success":           True,
            "backbone":          BACKBONE,
            "model_trained":     True,
            "index_built":       True,
            "total_indexed":     total,
            "best_val_accuracy": max(history.get("val_accuracy", [0])),
        })
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc)}), 500


# ── Main ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n" + "=" * 60)
    print("  ShaadiSahulat — Visual Recommendation ML Service")
    print("=" * 60)
    print(f"  Backbone : {BACKBONE}")
    print(f"  Port     : {FLASK_PORT}")
    print(f"  Model dir: {MODEL_DIR}")
    print("=" * 60 + "\n")

    print_dataset_report()
    print(f"[server] Starting on port {FLASK_PORT} …")
    # Localhost by default (VISUAL_ML_HOST); the Werkzeug debugger stays off unless FLASK_DEBUG=true.
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=debug_enabled())
