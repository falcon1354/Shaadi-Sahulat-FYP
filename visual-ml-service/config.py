"""
ShaadiSahulat Visual Recommendation - Configuration
=====================================================
Central config for categories, image settings, model paths,
MongoDB connection, TF-IDF, and hybrid search weights.
"""

import os
import re

# ── ML Model Category Definitions (used by classifier & embedding search) ──
# Do NOT change CATEGORIES without retraining the CNN — these map to model output indices.
CATEGORIES = [
    {"id": "bridal_lehenga",  "label": "Bridal Lehenga",  "type": "bridal"},
    {"id": "bridal_sharara",  "label": "Bridal Sharara",  "type": "bridal"},
    {"id": "bridal_saree",    "label": "Bridal Saree",    "type": "bridal"},
]

CATEGORY_IDS    = [c["id"]    for c in CATEGORIES]
CATEGORY_LABELS = {c["id"]: c["label"] for c in CATEGORIES}
NUM_CLASSES     = len(CATEGORIES)

# ── Full Seller Category Tree (all 6 major categories) ─────────────────────
# Used by the seller upload form and buyer marketplace.
# wedding_dress products get EfficientNet embeddings; all others get TF-IDF only.
SELLER_CATEGORY_TREE = [
    {
        "id": "wedding_dress",
        "label": "Wedding Dress",
        "icon": "👗",
        "requires_embedding": True,
        "subcategories": [
            {
                "id": "bridal",
                "label": "Bridal",
                "items": [
                    {"id": "bridal_lehenga", "label": "Lehenga"},
                    {"id": "bridal_sharara", "label": "Sharara"},
                    {"id": "bridal_saree",   "label": "Saree"},
                    {"id": "bridal_gharara", "label": "Gharara"},
                    {"id": "bridal_gown",    "label": "Bridal Gown"},
                    {"id": "bridal_maxi",    "label": "Maxi"},
                ],
            },
            {
                "id": "groom",
                "label": "Groom",
                "items": [
                    {"id": "groom_sherwani",        "label": "Sherwani"},
                    {"id": "groom_shalwar_kameez",  "label": "Shalwar Kameez"},
                    {"id": "groom_prince_coat",     "label": "Prince Coat"},
                ],
            },
        ],
    },
    {
        "id": "furniture",
        "label": "Furniture",
        "icon": "🛋️",
        "requires_embedding": False,
        "subcategories": [
            {"id": "sofa_set",       "label": "Sofa Set",        "items": None},
            {"id": "bed_set",        "label": "Bed Set",         "items": None},
            {"id": "dressing_table", "label": "Dressing Table",  "items": None},
            {"id": "dining_table",   "label": "Dining Table",    "items": None},
            {"id": "wardrobe",       "label": "Wardrobe",        "items": None},
        ],
    },
    {
        "id": "electronics",
        "label": "Electronics",
        "icon": "📺",
        "requires_embedding": False,
        "subcategories": [
            {"id": "led_tv",          "label": "LED TV",           "items": None},
            {"id": "refrigerator",    "label": "Refrigerator",     "items": None},
            {"id": "washing_machine", "label": "Washing Machine",  "items": None},
            {"id": "ac",              "label": "Air Conditioner",  "items": None},
        ],
    },
    {
        "id": "kitchen_items",
        "label": "Kitchen Items",
        "icon": "🍳",
        "requires_embedding": False,
        "subcategories": [
            {"id": "large_appliances", "label": "Large Appliances", "items": [
                {"id": "microwave",             "label": "Microwave"},
                {"id": "juicer_blender",        "label": "Juicer / Blender Set"},
                {"id": "toaster",               "label": "Toaster"},
                {"id": "breakfast_beverages",   "label": "Breakfast / Beverages"},
                {"id": "built_in_hob",          "label": "Built-in Hob"},
                {"id": "dishwasher",            "label": "Dishwasher"},
            ]},
            {"id": "general_kitchen", "label": "General Kitchen Items", "items": [
                {"id": "crockery_set",    "label": "Crockery Set"},
                {"id": "cooking_set",     "label": "Cooking Set"},
                {"id": "pressure_cooker", "label": "Pressure Cooker"},
                {"id": "kettle_tea_set",  "label": "Kettle + Tea Set"},
                {"id": "casserole_set",   "label": "Casserole Set"},
            ]},
        ],
    },
    {
        "id": "decoration",
        "label": "Decoration",
        "icon": "✨",
        "requires_embedding": False,
        "subcategories": [
            {"id": "lights",          "label": "Lights / Fairy Lights",  "items": None},
            {"id": "artificial_flowers", "label": "Artificial Flowers",  "items": None},
            {"id": "stage_setup",     "label": "Stage Setup Materials",  "items": None},
            {"id": "wall_decor",      "label": "Wall Decor",             "items": None},
            {"id": "table_centerpieces", "label": "Table Centerpieces",  "items": None},
        ],
    },
    {
        "id": "miscellaneous",
        "label": "Miscellaneous",
        "icon": "🎁",
        "requires_embedding": False,
        "subcategories": [
            {"id": "small_appliances", "label": "Small Appliances", "items": [
                {"id": "iron",          "label": "Iron"},
                {"id": "vacuum_cleaner","label": "Vacuum Cleaner"},
                {"id": "pedestal_fan",  "label": "Pedestal Fan"},
                {"id": "hair_dryer",    "label": "Hair Dryer"},
            ]},
            {"id": "wedding_services", "label": "Wedding Services", "items": [
                {"id": "invitations",           "label": "Wedding Invitations"},
                {"id": "photography_packages",  "label": "Photography Packages"},
                {"id": "favour_gift_items",     "label": "Favour / Gift Items"},
                {"id": "mehendi_supplies",      "label": "Mehendi Supplies"},
            ]},
        ],
    },
]

# Flat list of valid major category IDs for validation
SELLER_MAJOR_CATEGORY_IDS = [cat["id"] for cat in SELLER_CATEGORY_TREE]

RETIRED_CAT_RE = re.compile(
    r"(jewel|jwel|accessar|second[_\-\s]?(hand|life|gear))",
    re.I,
)

def is_retired_category(*parts) -> bool:
    """Jewelry, accessories, and second-hand / second-life gear are removed from the catalog."""
    text = " ".join(str(p or "") for p in parts)
    return bool(RETIRED_CAT_RE.search(text))

# All valid wedding-dress subcategory IDs (for embedding category mapping)
WEDDING_DRESS_SUBCATEGORY_IDS = [
    item["id"]
    for cat in SELLER_CATEGORY_TREE if cat["id"] == "wedding_dress"
    for sub in cat["subcategories"]
    for item in (sub["items"] or [])
]

# Map fine-grained dress subcategory → nearest ML model class (soft preference only;
# visual search no longer hard-filters on these — exact image match needs full catalog).
_DRESS_TO_ML_CLASS = {
    "bridal_lehenga":       "bridal_lehenga",
    "bridal_sharara":       "bridal_sharara",
    "bridal_saree":         "bridal_saree",
    "bridal_gharara":       "bridal_sharara",
    "bridal_gown":          "bridal_lehenga",
    "bridal_maxi":          "bridal_lehenga",
    "groom_sherwani":       "bridal_lehenga",
    "groom_shalwar_kameez": "bridal_sharara",
    "groom_prince_coat":    "bridal_lehenga",
    "groom_suit":           "bridal_lehenga",
}
DRESS_TO_ML_CLASS = _DRESS_TO_ML_CLASS

# ── Backbone Selection ─────────────────────────────────────────────────────
# "efficientnet_b0"  → lighter, faster (recommended)
# "resnet50"         → original, heavier (kept for comparison)
BACKBONE = "efficientnet_b0"

# ── Image & Training Constants ─────────────────────────────────────────────
IMAGE_SIZE               = 224
MIN_IMAGES_PER_CATEGORY  = 10
RECOMMENDED_IMAGES       = 20
AUGMENTATION_MULTIPLIER  = 10
VALIDATION_SPLIT         = 0.2
EMBEDDING_DIM            = 128

# ── Augmentation Parameters ────────────────────────────────────────────────
AUGMENTATION_PARAMS = {
    "horizontal_flip_prob": 0.5,
    "rotation_limit":       15,
    "crop_scale":           (0.8, 1.0),
    "brightness":           0.2,
    "contrast":             0.2,
    "saturation":           0.2,
}

# ── Training Hyperparameters ───────────────────────────────────────────────
TRAINING_CONFIG = {
    "backbone":                  BACKBONE,
    "pretrained":                True,
    # EfficientNet-B0: unfreeze last 3 feature blocks (6, 7, 8)
    # ResNet50:        unfreeze layer3 + layer4
    "unfreeze_layers_efficientnet": ["features.6", "features.7", "features.8"],
    "unfreeze_layers_resnet":       ["layer3", "layer4"],
    "learning_rate":             1e-4,
    "weight_decay":              1e-4,
    "batch_size":                16,
    "max_epochs":                30,
    "early_stopping_patience":   5,
    "scheduler_factor":          0.5,
    "scheduler_patience":        3,
    "classifier_dropout":        0.5,
}

# ── Triplet Loss Phase (Optional) ──────────────────────────────────────────
TRIPLET_CONFIG = {
    "enabled":       True,
    "margin":        0.2,
    "learning_rate": 1e-5,
    "epochs":        10,
}

# ── Hybrid Search Weights ──────────────────────────────────────────────────
# Vision-first: image embeddings dominate; text/color are light tie-breakers only.
HYBRID_WEIGHTS = {
    "with_category": {"image": 0.82, "text": 0.18},
    "no_category":   {"image": 0.88, "text": 0.12},
}

# Absolute floor — candidates below this image cosine are dropped unless the
# catalog is too sparse to fill top_k (then we fall back to the best available).
MIN_IMAGE_SIM_FOR_RESULTS = 0.22
# Re-rank pool: keep the top-N by pure image similarity, then blend color/text.
IMAGE_CANDIDATE_POOL = 40

# ── Recommendation Count ───────────────────────────────────────────────────
MAX_RESULTS_DEFAULT = 3     # Return up to 3 recommendations via cascade
MAX_RESULTS_LIMIT   = 20

# ── Validation Thresholds ──────────────────────────────────────────────────
CATEGORY_CONFIDENCE_THRESHOLD = 0.28  # 3-class softmax; ImageNet-only head rarely exceeds ~40%
SAFETY_SIMILARITY_THRESHOLD   = 0.70
MAX_UPLOAD_SIZE_MB            = 5

# ── Embedding dimension (backbone output, used for similarity search) ──────
# EfficientNet-B0 → 1280-dim  |  ResNet50 → 2048-dim
CATALOG_EMBEDDING_DIM = 1280 if BACKBONE == "efficientnet_b0" else 2048

# ── MongoDB ────────────────────────────────────────────────────────────────
MONGO_URI                = os.environ.get(
    "MONGODB_URI",
    os.environ.get("MONGO_URI", "mongodb://localhost:27017/shaadi-sahulat"),
)
MONGO_DB                 = "shaadi-sahulat"
MONGO_CATALOG_COLLECTION = "dress_catalog"
SELLERS_COLLECTION       = "sellers"
PRODUCTS_COLLECTION      = "seller_products"

# ── File Paths ─────────────────────────────────────────────────────────────
BASE_DIR          = os.path.dirname(os.path.abspath(__file__))
TRAINING_DATA_DIR = os.path.join(BASE_DIR, "training_data")   # CNN training only
CATALOG_DIR       = os.path.join(BASE_DIR, "catalog")         # legacy seed data
UPLOADS_DIR       = os.path.join(BASE_DIR, "uploads")         # seller-uploaded product images
MODEL_DIR         = os.path.join(BASE_DIR, "models")
DATA_DIR          = os.path.join(BASE_DIR, "data")
DESCRIPTIONS_FILE = os.path.join(BASE_DIR, "descriptions.json")

# Model file names vary by backbone
_MODEL_FILENAME = (
    "fine_tuned_efficientnet_b0.pth"
    if BACKBONE == "efficientnet_b0"
    else "fine_tuned_resnet50.pth"
)

FINE_TUNED_MODEL_PATH      = os.path.join(MODEL_DIR, _MODEL_FILENAME)
EMBEDDING_EXTRACTOR_PATH   = os.path.join(MODEL_DIR, "embedding_extractor.pth")
CATEGORY_CLASSIFIER_PATH   = os.path.join(MODEL_DIR, "category_classifier.pth")
TRAINING_HISTORY_PATH      = os.path.join(MODEL_DIR, "training_history.json")
CLASS_NAMES_PATH           = os.path.join(MODEL_DIR, "class_names.json")

# TF-IDF vectorizer cache (pkl — small, no DB dependency)
TFIDF_PKL_PATH = os.path.join(DATA_DIR, "tfidf_vectorizer.pkl")

# ── Flask Service ──────────────────────────────────────────────────────────
# Localhost only: the browser loads images via localhost and all API traffic comes
# from the Node backend on the same machine. Override with VISUAL_ML_HOST if needed.
FLASK_HOST = os.environ.get("VISUAL_ML_HOST", "127.0.0.1")
FLASK_PORT = 5002
