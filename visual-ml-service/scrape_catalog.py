"""
ShaadiSahulat catalog scraper
=============================
Pulls live product listings from Pakistani storefronts into seller_products,
grouped as major_category → subcategory → item_type, then rebuilds market
price stats used by dowry estimation.

Run from visual-ml-service/:
    python scrape_catalog.py
"""

from __future__ import annotations

import html as html_lib
import json
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

# Load repo-root .env before config.py reads MONGODB_URI
_root_env = Path(__file__).resolve().parents[1] / ".env"
if _root_env.is_file():
    for _line in _root_env.read_text(encoding="utf-8").splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))

import requests
from pymongo import MongoClient

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import MONGO_DB, MONGO_URI, PRODUCTS_COLLECTION, RETIRED_CAT_RE, SELLERS_COLLECTION
from price_stats import rebuild_price_stats

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
TIMEOUT = 25
GBP_PKR_FALLBACK = 370
SESSION = requests.Session()
SESSION.headers.update(HEADERS)

NOW = datetime.now(timezone.utc)
CATALOG_SELLER_ID = "SELLER_001"

# How many products to keep per source (small categories stay smaller)
DEFAULT_LIMIT = 6
MAIN_LIMIT = 8
DRESS_LIMIT = 24

SOURCES = [
    # ── 1. Wedding dress (bridal + groom) — higher limits ─────────────────
    {"kind": "shopify", "url": "https://www.zenia.pk/collections/bridal-lehenga-choli/products.json",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_lehenga", "limit": DRESS_LIMIT},
    {"kind": "shopify", "url": "https://www.zenia.pk/collections/bridal-lehenga/products.json",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_lehenga", "limit": DRESS_LIMIT},
    {"kind": "shopify", "url": "https://www.zenia.pk/collections/lehenga/products.json",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_lehenga", "limit": 18},
    {"kind": "shopify", "url": "https://www.zenia.pk/collections/bridal-maxi/products.json",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_maxi", "limit": DRESS_LIMIT},
    {"kind": "shopify", "url": "https://www.zenia.pk/collections/maxi-dresses/products.json",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_maxi", "limit": 18},
    {"kind": "shopify", "url": "https://www.zenia.pk/collections/sharara-dresses/products.json",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_sharara", "limit": DRESS_LIMIT},
    {"kind": "shopify", "url": "https://www.zenia.pk/collections/sharara/products.json",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_sharara", "limit": 18},
    {"kind": "shopify", "url": "https://www.zenia.pk/collections/saree/products.json",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_saree", "limit": 18},
    {"kind": "html_json", "url": "https://laam.com/nodes/women-saree-407",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_saree", "limit": DRESS_LIMIT, "currency": "PKR"},
    {"kind": "html_json", "url": "https://laam.com/nodes/women-lehenga-296",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_lehenga", "limit": DRESS_LIMIT, "currency": "PKR"},
    {"kind": "html_json", "url": "https://haseensofficial.com/nodes/women-lehenga-296",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_lehenga", "limit": DRESS_LIMIT, "currency": "GBP"},
    {"kind": "html_json", "url": "https://haseensofficial.com/nodes/women-sharara",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_sharara", "limit": 18, "currency": "GBP"},
    {"kind": "wc", "base": "https://naushemian.com", "category_slug": "sherwani",
     "major": "wedding_dress", "sub": "groom", "item": "groom_sherwani", "limit": DRESS_LIMIT},
    {"kind": "wc", "base": "https://naushemian.com", "category_slug": "shalwar-kameez",
     "major": "wedding_dress", "sub": "groom", "item": "groom_shalwar_kameez", "limit": 18},
    {"kind": "wc", "base": "https://naushemian.com", "category_slug": "prince-coat",
     "major": "wedding_dress", "sub": "groom", "item": "groom_prince_coat", "limit": 18},
    {"kind": "wc", "base": "https://naushemian.com", "search": "sherwani",
     "major": "wedding_dress", "sub": "groom", "item": "groom_sherwani", "limit": 18},
    {"kind": "wc", "base": "https://naushemian.com", "search": "prince coat",
     "major": "wedding_dress", "sub": "groom", "item": "groom_prince_coat", "limit": 12},

    # ── 2. Furniture ────────────────────────────────────────────────────
    {"kind": "shopify", "url": "https://furniturecity.com.pk/collections/sofas/products.json",
     "major": "furniture", "sub": "sofa_set", "item": "sofa_set", "limit": 5},
    {"kind": "shopify", "url": "https://furniturecity.com.pk/collections/all-dining-table-sets/products.json",
     "major": "furniture", "sub": "dining_table", "item": "dining_table", "limit": 5},
    {"kind": "shopify", "url": "https://furniturecity.com.pk/collections/wardrobes/products.json",
     "major": "furniture", "sub": "wardrobe", "item": "wardrobe", "limit": 5},
    {"kind": "wc", "base": "https://paktameer.com", "search": "bedroom set",
     "major": "furniture", "sub": "bed_set", "item": "bed_set", "limit": 5},
    {"kind": "wc", "base": "https://renome.pk", "search": "bed set",
     "major": "furniture", "sub": "bed_set", "item": "bed_set", "limit": 4},
    {"kind": "wc", "base": "https://furniturehub.pk", "search": "dressing table",
     "major": "furniture", "sub": "dressing_table", "item": "dressing_table", "limit": 5},

    # ── 3. Electronics ──────────────────────────────────────────────────
    {"kind": "wc", "base": "https://electrogallery.com.pk", "search": "led tv",
     "major": "electronics", "sub": "led_tv", "item": "led_tv", "limit": 6},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/washing-machines/products.json",
     "major": "electronics", "sub": "washing_machine", "item": "washing_machine", "limit": 6},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/air-conditioners/products.json",
     "major": "electronics", "sub": "ac", "item": "ac", "limit": 6},
    {"kind": "priceoye", "url": "https://priceoye.pk/refrigerators",
     "major": "electronics", "sub": "refrigerator", "item": "refrigerator", "limit": 6},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/refrigerator/products.json",
     "major": "electronics", "sub": "refrigerator", "item": "refrigerator", "limit": 6},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/haier-refrigerator-price-in-pakistan/products.json",
     "major": "electronics", "sub": "refrigerator", "item": "refrigerator", "limit": 4},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/microwave-oven/products.json",
     "major": "kitchen_items", "sub": "large_appliances", "item": "microwave", "limit": 5},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/dawlance-microwave-oven/products.json",
     "major": "kitchen_items", "sub": "large_appliances", "item": "microwave", "limit": 4},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/juicer/products.json",
     "major": "kitchen_items", "sub": "large_appliances", "item": "juicer_blender", "limit": 4},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/citrus-juicer/products.json",
     "major": "kitchen_items", "sub": "large_appliances", "item": "juicer_blender", "limit": 3},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/kitchen-hob/products.json",
     "major": "kitchen_items", "sub": "large_appliances", "item": "built_in_hob", "limit": 4},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/dawlance-kitchen-hob/products.json",
     "major": "kitchen_items", "sub": "large_appliances", "item": "built_in_hob", "limit": 3},

    # ── 4. Kitchen ──────────────────────────────────────────────────────
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/microwave-ovens/products.json",
     "major": "kitchen_items", "sub": "large_appliances", "item": "microwave", "limit": 5},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/juicers/products.json",
     "major": "kitchen_items", "sub": "large_appliances", "item": "juicer_blender", "limit": 4},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/toasters/products.json",
     "major": "kitchen_items", "sub": "large_appliances", "item": "toaster", "limit": 3},
    {"kind": "shopify", "url": "https://habitt.com/collections/dinnerware-sets/products.json",
     "major": "kitchen_items", "sub": "general_kitchen", "item": "crockery_set", "limit": 8},
    {"kind": "shopify", "url": "https://japanelectronics.com.pk/collections/kitchen-appliances/products.json",
     "major": "kitchen_items", "sub": "large_appliances", "item": "breakfast_beverages", "limit": 5},
    {"kind": "html", "url": "https://www.dawlance.com.pk/microwave-ovens",
     "major": "kitchen_items", "sub": "large_appliances", "item": "microwave", "limit": 4},
    {"kind": "html", "url": "https://www.dawlance.com.pk/juicer",
     "major": "kitchen_items", "sub": "large_appliances", "item": "juicer_blender", "limit": 3},
    {"kind": "html", "url": "https://www.dawlance.com.pk/toaster",
     "major": "kitchen_items", "sub": "large_appliances", "item": "toaster", "limit": 3},
    {"kind": "html", "url": "https://www.dawlance.com.pk/breakfast-beverages",
     "major": "kitchen_items", "sub": "large_appliances", "item": "breakfast_beverages", "limit": 3},
    {"kind": "html", "url": "https://www.dawlance.com.pk/built-in-hob",
     "major": "kitchen_items", "sub": "large_appliances", "item": "built_in_hob", "limit": 3},

    # ── 5. Decoration ───────────────────────────────────────────────────
    {"kind": "html", "url": "https://www.homeshopping.pk/categories/Home-Decor/Fairy-Lights",
     "major": "decoration", "sub": "lights", "item": "lights", "limit": 6},
    {"kind": "shopify", "url": "https://habitt.com/collections/lighting/products.json",
     "major": "decoration", "sub": "lights", "item": "lights", "limit": 5},
    {"kind": "shopify", "url": "https://habitt.com/collections/decor/products.json",
     "major": "decoration", "sub": "wall_decor", "item": "wall_decor", "limit": 6},
    {"kind": "html", "url": "https://www.homeshopping.pk/search?q=artificial+flowers",
     "major": "decoration", "sub": "artificial_flowers", "item": "artificial_flowers", "limit": 5},
    {"kind": "html", "url": "https://www.homeshopping.pk/search?q=wall+decor",
     "major": "decoration", "sub": "wall_decor", "item": "wall_decor", "limit": 4},
    {"kind": "html", "url": "https://www.homeshopping.pk/search?q=stage+decoration",
     "major": "decoration", "sub": "stage_setup", "item": "stage_setup", "limit": 4},
]

# Used only when a subcategory still has too few live rows after scraping
FALLBACK_PRODUCTS = [
    {"major": "decoration", "sub": "artificial_flowers", "item": "artificial_flowers",
     "title": "Silk Rose Bouquet 24 Stems Bridal Red",
     "description": "Lifelike silk rose bouquet for stage and table décor.",
     "price": 3200, "image": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800",
     "source": "https://www.homeshopping.pk/search?q=artificial+flowers"},
    {"major": "decoration", "sub": "artificial_flowers", "item": "artificial_flowers",
     "title": "Peony Hydrangea Mix Arrangement Ivory",
     "description": "Premium artificial peony and hydrangea mix for centrepieces.",
     "price": 4500, "image": "https://images.unsplash.com/photo-1490750967868-88aa4c00db5b?w=800",
     "source": "https://www.homeshopping.pk/search?q=artificial+flowers"},
    {"major": "decoration", "sub": "artificial_flowers", "item": "artificial_flowers",
     "title": "Marigold Garland Set 4 Pieces Golden",
     "description": "Traditional marigold garlands for mehndi and stage backdrop.",
     "price": 2800, "image": "https://images.unsplash.com/photo-1501004318641-b39e6451bec6?w=800",
     "source": "https://www.homeshopping.pk/search?q=marigold"},
    {"major": "decoration", "sub": "stage_setup", "item": "stage_setup",
     "title": "Wedding Stage Backdrop Frame with Drapes",
     "description": "Adjustable metal backdrop with ivory and gold drapes.",
     "price": 28000, "image": "https://images.unsplash.com/photo-1519741497674-611481863552?w=800",
     "source": "https://www.homeshopping.pk/search?q=stage+decoration"},
    {"major": "decoration", "sub": "stage_setup", "item": "stage_setup",
     "title": "Crystal Pillar Stand Pair for Stage",
     "description": "Pair of crystal-look pillar stands for bridal stage.",
     "price": 18500, "image": "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800",
     "source": "https://www.homeshopping.pk/search?q=stage+decoration"},
    {"major": "decoration", "sub": "stage_setup", "item": "stage_setup",
     "title": "Floral Arch Gate Gold Finish",
     "description": "Gold-finish floral arch for entry and stage framing.",
     "price": 22000, "image": "https://images.unsplash.com/photo-1478144592103-25e218a0486d?w=800",
     "source": "https://www.homeshopping.pk/search?q=wedding+arch"},
    {"major": "decoration", "sub": "wall_decor", "item": "wall_decor",
     "title": "Islamic Calligraphy Wall Set 3 Panels",
     "description": "Three-panel calligraphy wall art for the bridal room.",
     "price": 6500, "image": "https://images.unsplash.com/photo-1513519245088-0e12902e35a0?w=800",
     "source": "https://www.homeshopping.pk/search?q=wall+decor"},
    {"major": "decoration", "sub": "wall_decor", "item": "wall_decor",
     "title": "Mirror Wall Decor Hexagon Gold",
     "description": "Gold hexagon mirror cluster for dressing-area walls.",
     "price": 8900, "image": "https://images.unsplash.com/photo-1618220179428-22790b461013?w=800",
     "source": "https://www.homeshopping.pk/search?q=wall+mirror"},
    {"major": "decoration", "sub": "lights", "item": "lights",
     "title": "Warm White Fairy Lights 20 Meter LED",
     "description": "20-metre warm white fairy lights with 8 lighting modes.",
     "price": 2200, "image": "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800",
     "source": "https://www.homeshopping.pk/categories/Home-Decor/Fairy-Lights"},
    {"major": "decoration", "sub": "lights", "item": "lights",
     "title": "Curtain Drop Lights 3x3 Meter Warm",
     "description": "Curtain-style drop lights for stage and window décor.",
     "price": 4800, "image": "https://images.unsplash.com/photo-1482517967863-00e15c9b44be?w=800",
     "source": "https://www.homeshopping.pk/categories/Home-Decor/Fairy-Lights"},
    {"major": "decoration", "sub": "lights", "item": "lights",
     "title": "Net Mesh Fairy Lights 2x3 Meter Cool White",
     "description": "Mesh net fairy lights for backdrop walls.",
     "price": 3500, "image": "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800",
     "source": "https://www.homeshopping.pk/categories/Home-Decor/Fairy-Lights"},
    {"major": "decoration", "sub": "lights", "item": "lights",
     "title": "LED Strip Light 5 Meter RGB Remote",
     "description": "RGB LED strip with remote for stage and wall wash.",
     "price": 2900, "image": "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
     "source": "https://www.homeshopping.pk/categories/Home-Decor/Fairy-Lights"},
    {"major": "decoration", "sub": "table_centerpieces", "item": "table_centerpieces",
     "title": "Crystal Candle Holder Centrepiece Set of 3",
     "description": "Mirrored crystal candle holders for the reception table.",
     "price": 5400, "image": "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800",
     "source": "https://www.homeshopping.pk/search?q=centerpiece"},
    {"major": "decoration", "sub": "artificial_flowers", "item": "artificial_flowers",
     "title": "Orchid Stem Bunch White 12 Pieces",
     "description": "Tall white orchid stems for stage corners and vases.",
     "price": 3900, "image": "https://images.unsplash.com/photo-1468327768560-75b60c6f5e9c?w=800",
     "source": "https://www.homeshopping.pk/search?q=artificial+orchid"},
    {"major": "decoration", "sub": "artificial_flowers", "item": "artificial_flowers",
     "title": "Baby Breath Filler Bunch Ivory",
     "description": "Ivory filler bunch for bridal table arrangements.",
     "price": 1800, "image": "https://images.unsplash.com/photo-1455659817273-f968077e6a60?w=800",
     "source": "https://www.homeshopping.pk/search?q=babys+breath"},
    {"major": "decoration", "sub": "stage_setup", "item": "stage_setup",
     "title": "LED Up-light Par Can Set of 4",
     "description": "Four LED par cans for washing the bridal stage.",
     "price": 16500, "image": "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800",
     "source": "https://www.homeshopping.pk/search?q=stage+lights"},
    {"major": "decoration", "sub": "stage_setup", "item": "stage_setup",
     "title": "Red Carpet Aisle Runner 10 Meter",
     "description": "Velvet-look aisle runner for baraat and stage entry.",
     "price": 7500, "image": "https://images.unsplash.com/photo-1519741497674-611481863552?w=800",
     "source": "https://www.homeshopping.pk/search?q=red+carpet"},
    {"major": "decoration", "sub": "wall_decor", "item": "wall_decor",
     "title": "Wooden Mashrabiya Wall Panel Pair",
     "description": "Carved wooden panels for the bridal lounge wall.",
     "price": 14200, "image": "https://images.unsplash.com/photo-1618220179428-22790b461013?w=800",
     "source": "https://www.homeshopping.pk/search?q=wall+panel"},
    {"major": "decoration", "sub": "lights", "item": "lights",
     "title": "Chandelier Fairy Light Cascade Gold",
     "description": "Hanging cascade lights for mandap and dining.",
     "price": 6200, "image": "https://images.unsplash.com/photo-1513151233558-d860c5398176?w=800",
     "source": "https://www.homeshopping.pk/categories/Home-Decor/Fairy-Lights"},
    {"major": "kitchen_items", "sub": "general_kitchen", "item": "cooking_set",
     "title": "Non-Stick Cookware Set 10 Piece Granite",
     "description": "Granite-look non-stick pots and pans with lids.",
     "price": 12500, "image": "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800",
     "source": "https://habitt.com/collections/dinnerware-sets"},
    {"major": "kitchen_items", "sub": "general_kitchen", "item": "pressure_cooker",
     "title": "Stainless Steel Pressure Cooker 8 Litre",
     "description": "Heavy-gauge pressure cooker for family cooking.",
     "price": 7800, "image": "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=800",
     "source": "https://habitt.com/collections/dinnerware-sets"},
    {"major": "kitchen_items", "sub": "large_appliances", "item": "built_in_hob",
     "title": "Dawlance 4-Burner Built-in Hob Stainless",
     "description": "Four-burner built-in hob with auto ignition.",
     "price": 42000, "image": "https://images.unsplash.com/photo-1556912173-46c336c7fd55?w=800",
     "source": "https://www.dawlance.com.pk/built-in-hob"},
    {"major": "kitchen_items", "sub": "large_appliances", "item": "breakfast_beverages",
     "title": "Dawlance Electric Kettle 1.7L",
     "description": "Cordless electric kettle with auto shut-off.",
     "price": 6500, "image": "https://images.unsplash.com/photo-1564890369478-c89ca6d9cde9?w=800",
     "source": "https://www.dawlance.com.pk/breakfast-beverages"},
    {"major": "kitchen_items", "sub": "large_appliances", "item": "toaster",
     "title": "Dawlance 2-Slice Pop-up Toaster",
     "description": "Two-slice toaster with browning control and crumb tray.",
     "price": 4800, "image": "https://images.unsplash.com/photo-1509440159596-0249088772ff?w=800",
     "source": "https://www.dawlance.com.pk/toaster"},
    {"major": "kitchen_items", "sub": "large_appliances", "item": "toaster",
     "title": "Westpoint 4-Slice Stainless Toaster",
     "description": "Four-slice stainless toaster for family breakfast.",
     "price": 7200, "image": "https://images.unsplash.com/photo-1482049016687-2d3ff1b37d78?w=800",
     "source": "https://www.dawlance.com.pk/toaster"},
    {"major": "electronics", "sub": "refrigerator", "item": "refrigerator",
     "title": "Dawlance 12 Cu Ft Inverter Refrigerator",
     "description": "Energy-saving inverter refrigerator with glass door shelves.",
     "price": 98000, "image": "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=800",
     "source": "https://priceoye.pk/refrigerators"},
    {"major": "electronics", "sub": "refrigerator", "item": "refrigerator",
     "title": "Haier 14 Cu Ft Frost Free Refrigerator",
     "description": "Double-door frost-free refrigerator in silver finish.",
     "price": 115000, "image": "https://images.unsplash.com/photo-1584568694244-14fbdf83c267?w=800",
     "source": "https://priceoye.pk/refrigerators"},
    {"major": "electronics", "sub": "refrigerator", "item": "refrigerator",
     "title": "PEL 18 Cu Ft Side by Side Refrigerator",
     "description": "Large family refrigerator with water dispenser.",
     "price": 185000, "image": "https://images.unsplash.com/photo-1610701596007-11502861dcfa?w=800",
     "source": "https://priceoye.pk/refrigerators"},
]


def log(msg: str) -> None:
    print(msg.encode("ascii", "replace").decode("ascii"), flush=True)


def strip_html(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", str(text))
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def fetch(url: str, **kwargs) -> requests.Response | None:
    retries = 3
    for attempt in range(retries):
        try:
            resp = SESSION.get(url, timeout=TIMEOUT, **kwargs)
            if resp.status_code == 429:
                wait = 8 * (attempt + 1)
                log(f"  ! 429 rate-limit — waiting {wait}s ({attempt + 1}/{retries})")
                time.sleep(wait)
                continue
            if resp.status_code >= 400:
                log(f"  ! {resp.status_code} {url}")
                return None
            time.sleep(0.8)  # be polite between successful fetches
            return resp
        except requests.RequestException as exc:
            log(f"  ! {exc} {url}")
            if attempt + 1 < retries:
                time.sleep(2)
                continue
            return None
    return None


def gbp_to_pkr_rate() -> float:
    resp = fetch("https://open.er-api.com/v6/latest/GBP")
    if resp:
        try:
            rate = float(resp.json()["rates"]["PKR"])
            if rate > 50:
                log(f"  GBP->PKR rate {rate:.2f}")
                return rate
        except (KeyError, TypeError, ValueError):
            pass
    log(f"  Using fallback GBP->PKR {GBP_PKR_FALLBACK}")
    return float(GBP_PKR_FALLBACK)


def convert_price(value, currency: str, gbp_rate: float) -> float | None:
    if value is None:
        return None
    try:
        price = float(str(value).replace(",", "").replace("£", "").replace("Rs", "").replace("PKR", "").strip())
    except (TypeError, ValueError):
        return None
    if price <= 0:
        return None
    if (currency or "PKR").upper() in ("GBP", "UK", "POUND", "POUNDS"):
        price *= gbp_rate
    return round(price)


def wc_price(product: dict) -> float | None:
    prices = product.get("prices") or {}
    raw = prices.get("price") or prices.get("regular_price") or product.get("price")
    if raw is None:
        return None
    try:
        num = float(str(raw).replace(",", ""))
    except (TypeError, ValueError):
        return None
    minor = prices.get("currency_minor_unit")
    if minor is None:
        # Woo store API usually sends minor units as a string of digits
        if num >= 1000 and "." not in str(raw):
            # Heuristic: 8+ digit PKR strings are paisa
            if num >= 100000:
                num = num / 100.0
        return round(num) if num > 0 else None
    try:
        minor = int(minor)
    except (TypeError, ValueError):
        minor = 0
    if minor > 0:
        num = num / (10 ** minor)
    return round(num) if num > 0 else None


def shopify_image(product: dict) -> str:
    images = product.get("images") or []
    if images:
        return images[0].get("src") or ""
    image = product.get("image") or {}
    return image.get("src") or ""


def parse_shopify(src: dict, gbp_rate: float) -> list[dict]:
    """Fetch Shopify collection products with pagination until limit is met."""
    limit = src.get("limit", DEFAULT_LIMIT)
    base = src["url"]
    # Strip existing query; we'll paginate ourselves
    parsed_url = urlparse(base)
    clean_base = f"{parsed_url.scheme}://{parsed_url.netloc}{parsed_url.path}"
    out = []
    page = 1
    while len(out) < limit and page <= 8:
        url = f"{clean_base}?limit=50&page={page}"
        resp = fetch(url)
        if not resp:
            break
        try:
            products = resp.json().get("products") or []
        except ValueError:
            break
        if not products:
            break
        for p in products:
            variants = p.get("variants") or [{}]
            price = convert_price(variants[0].get("price"), src.get("currency", "PKR"), gbp_rate)
            if not price:
                continue
            handle = p.get("handle") or ""
            product_url = (
                f"{parsed_url.scheme}://{parsed_url.netloc}/products/{handle}"
                if handle else src["url"]
            )
            out.append({
                "title": strip_html(p.get("title") or ""),
                "description": strip_html(p.get("body_html") or p.get("title") or ""),
                "price": price,
                "image": shopify_image(p),
                "source_url": product_url,
                "brand": (p.get("vendor") or "").strip(),
                "color": (variants[0].get("option1") or ""),
            })
            if len(out) >= limit:
                break
        page += 1
    return out[:limit]


def wc_category_id(base: str, slug: str) -> int | None:
    resp = fetch(f"{base.rstrip('/')}/wp-json/wc/store/v1/products/categories?per_page=100")
    if not resp:
        return None
    try:
        cats = resp.json()
    except ValueError:
        return None
    if not isinstance(cats, list):
        return None
    slug = slug.lower().strip("/")
    for c in cats:
        if (c.get("slug") or "").lower() == slug:
            return c.get("id")
    for c in cats:
        if slug in (c.get("slug") or "").lower() or slug in (c.get("name") or "").lower():
            return c.get("id")
    return None


def parse_wc(src: dict, gbp_rate: float) -> list[dict]:
    base = src["base"].rstrip("/")
    params = ["per_page=20"]
    if src.get("search"):
        params.append(f"search={requests.utils.quote(src['search'])}")
    if src.get("category_slug"):
        cid = wc_category_id(base, src["category_slug"])
        if cid:
            params.append(f"category={cid}")
        else:
            params.append(f"search={requests.utils.quote(src['category_slug'].replace('-', ' '))}")
    url = f"{base}/wp-json/wc/store/v1/products?{'&'.join(params)}"
    resp = fetch(url)
    if not resp:
        return []
    try:
        products = resp.json()
    except ValueError:
        return []
    if not isinstance(products, list):
        return []
    out = []
    for p in products:
        price = convert_price(wc_price(p), src.get("currency", "PKR"), gbp_rate)
        if not price:
            continue
        images = p.get("images") or []
        img = ""
        if images:
            img = images[0].get("src") or images[0].get("thumbnail") or ""
        out.append({
            "title": strip_html(p.get("name") or p.get("title") or ""),
            "description": strip_html(p.get("description") or p.get("short_description") or p.get("name") or ""),
            "price": price,
            "image": img,
            "source_url": p.get("permalink") or src.get("url") or base,
            "brand": "",
            "color": "",
        })
    return out[: src.get("limit", DEFAULT_LIMIT)]


def _walk_json(obj, acc: list[dict]) -> None:
    if isinstance(obj, dict):
        title = obj.get("title") or obj.get("name") or obj.get("productName")
        price = (
            obj.get("price") or obj.get("sellingPrice") or obj.get("salePrice")
            or obj.get("regularPrice") or (obj.get("priceRange") or {}).get("min")
        )
        if isinstance(price, dict):
            price = price.get("value") or price.get("amount") or price.get("min")
        image = obj.get("image") or obj.get("imageUrl") or obj.get("thumbnail") or obj.get("featuredImage")
        if isinstance(image, dict):
            image = image.get("url") or image.get("src") or image.get("originalSrc")
        if isinstance(image, list) and image:
            image = image[0] if isinstance(image[0], str) else (image[0] or {}).get("url")
        slug = obj.get("slug") or obj.get("handle") or obj.get("url") or obj.get("permalink")
        if title and price:
            acc.append({
                "title": str(title),
                "price": price,
                "image": image or "",
                "source_url": slug or "",
                "description": obj.get("description") or obj.get("shortDescription") or title,
            })
        for v in obj.values():
            _walk_json(v, acc)
    elif isinstance(obj, list):
        for item in obj:
            _walk_json(item, acc)


def parse_html_json(src: dict, gbp_rate: float) -> list[dict]:
    resp = fetch(src["url"])
    if not resp:
        return []
    text = resp.text
    blobs = []
    for m in re.finditer(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', text, re.S | re.I):
        blobs.append(m.group(1))
    for m in re.finditer(r'<script[^>]*>([^<]*__NUXT__[^<]*)</script>', text, re.S):
        blobs.append(m.group(1))
    for m in re.finditer(r'<script id="__NUXT_DATA__"[^>]*>(.*?)</script>', text, re.S | re.I):
        blobs.append(m.group(1))
    # Generic JSON islands that look like product arrays
    for m in re.finditer(r'(\{[^{}]{0,80}"(?:sellingPrice|regularPrice|priceRange)"[^{}]{0,200}\})', text):
        blobs.append(m.group(1))

    found: list[dict] = []
    for blob in blobs:
        blob = blob.strip()
        if blob.startswith("window.") or blob.startswith("var "):
            eq = blob.find("[")
            brace = blob.find("{")
            idx = min(x for x in (eq, brace) if x >= 0) if (eq >= 0 or brace >= 0) else -1
            if idx < 0:
                continue
            blob = blob[idx:]
        try:
            data = json.loads(blob)
        except json.JSONDecodeError:
            continue
        _walk_json(data, found)

    # Regex fallback for visible PKR / GBP prices next to titles
    if len(found) < 3:
        for m in re.finditer(
            r'(?:product-title|product__title|card__title)[^>]*>([^<]{4,80})</[^>]+>[\s\S]{0,400}?(?:Rs\.?|PKR|£)\s*([0-9,]{3,})',
            text, re.I,
        ):
            found.append({"title": strip_html(m.group(1)), "price": m.group(2).replace(",", ""),
                          "image": "", "source_url": src["url"], "description": m.group(1)})

    out = []
    seen = set()
    for p in found:
        title = strip_html(p.get("title") or "")
        if not title or title.lower() in seen:
            continue
        price = convert_price(p.get("price"), src.get("currency", "PKR"), gbp_rate)
        if not price:
            continue
        seen.add(title.lower())
        href = p.get("source_url") or src["url"]
        if href.startswith("/"):
            href = urljoin(src["url"], href)
        img = p.get("image") or ""
        if img and img.startswith("//"):
            img = "https:" + img
        out.append({
            "title": title[:180],
            "description": strip_html(p.get("description") or title),
            "price": price,
            "image": img,
            "source_url": href,
            "brand": "",
            "color": "",
        })
        if len(out) >= src.get("limit", DEFAULT_LIMIT):
            break
    return out


def parse_html_generic(src: dict, gbp_rate: float) -> list[dict]:
    resp = fetch(src["url"])
    if not resp:
        return []
    text = resp.text
    out = []
    seen = set()

    # HomeShopping-style cards: title + Rs price
    patterns = [
        r'<a[^>]+href="([^"]+)"[^>]*>[\s\S]{0,400}?<img[^>]+src="([^"]+)"[\s\S]{0,400}?>([^<]{8,100})</a>[\s\S]{0,300}?(?:Rs\.?|PKR)\s*([0-9,]{3,})',
        r'href="([^"]+)"[^>]*>[\s\S]{0,200}?alt="([^"]{8,120})"[^>]*>[\s\S]{0,400}?(?:Rs\.?|PKR|£)\s*([0-9,]{3,})',
        r'<h[23][^>]*>([^<]{8,100})</h[23]>[\s\S]{0,300}?(?:Rs\.?|PKR|£)\s*([0-9,]{3,})',
    ]
    for pat in patterns:
        for m in re.finditer(pat, text, re.I):
            groups = m.groups()
            if len(groups) == 4:
                href, img, title, price_s = groups
            elif len(groups) == 3:
                href, title, price_s = groups[0], groups[1], groups[2]
                img = ""
            else:
                href, title, price_s, img = src["url"], groups[0], groups[1], ""
            title = strip_html(title)
            key = title.lower()
            if not title or key in seen:
                continue
            price = convert_price(price_s, src.get("currency", "PKR"), gbp_rate)
            if not price:
                continue
            seen.add(key)
            if href.startswith("/"):
                href = urljoin(src["url"], href)
            if img.startswith("//"):
                img = "https:" + img
            out.append({
                "title": title[:180],
                "description": title,
                "price": price,
                "image": img,
                "source_url": href,
                "brand": "",
                "color": "",
            })
            if len(out) >= src.get("limit", DEFAULT_LIMIT):
                break
        if len(out) >= src.get("limit", DEFAULT_LIMIT):
            break
    return out


def parse_priceoye(src: dict, gbp_rate: float) -> list[dict]:
    resp = fetch(src["url"])
    if not resp:
        return []
    text = resp.text
    out = []
    seen = set()
    for m in re.finditer(
        r'href="(https://priceoye\.pk/[^"]+)"[\s\S]{0,600}?(?:class="[^"]*(?:title|product)[^"]*"[^>]*>)([^<]{8,120})[\s\S]{0,400}?Rs\.?\s*([0-9,]{4,})',
        text, re.I,
    ):
        href, title, price_s = m.group(1), strip_html(m.group(2)), m.group(3)
        key = title.lower()
        if key in seen:
            continue
        price = convert_price(price_s, "PKR", gbp_rate)
        if not price:
            continue
        seen.add(key)
        out.append({
            "title": title[:180],
            "description": title,
            "price": price,
            "image": "",
            "source_url": href,
            "brand": "",
            "color": "",
        })
        if len(out) >= src.get("limit", DEFAULT_LIMIT):
            break
    if len(out) < 3:
        # JSON embedded in Next.js
        found = []
        for m in re.finditer(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', text, re.S):
            try:
                _walk_json(json.loads(m.group(1)), found)
            except json.JSONDecodeError:
                pass
        for p in found:
            title = strip_html(p.get("title") or "")
            if not title or title.lower() in seen:
                continue
            price = convert_price(p.get("price"), "PKR", gbp_rate)
            if not price:
                continue
            seen.add(title.lower())
            href = p.get("source_url") or src["url"]
            if href.startswith("/"):
                href = urljoin(src["url"], href)
            out.append({
                "title": title[:180],
                "description": strip_html(p.get("description") or title),
                "price": price,
                "image": p.get("image") or "",
                "source_url": href,
                "brand": "",
                "color": "",
            })
            if len(out) >= src.get("limit", DEFAULT_LIMIT):
                break
    return out


PARSERS = {
    "shopify": parse_shopify,
    "wc": parse_wc,
    "html_json": parse_html_json,
    "html": parse_html_generic,
    "priceoye": parse_priceoye,
}


def ensure_catalog_seller(db) -> dict:
    existing = db[SELLERS_COLLECTION].find_one({"seller_id": CATALOG_SELLER_ID})
    if existing:
        return existing
    doc = {
        "seller_id": CATALOG_SELLER_ID,
        "name": "Ahmed Traders",
        "email": "ahmed@shaadisahulat.com",
        "phone": "03001234567",
        "city": "Lahore",
        "seller_type": "company",
        "created_at": NOW,
        "updated_at": NOW,
    }
    db[SELLERS_COLLECTION].insert_one(doc)
    return doc


def to_product_doc(row: dict, src: dict, seller: dict) -> dict:
    major = src["major"]
    sub = src["sub"]
    item = src["item"]
    title = row["title"]
    pid = f"sc_{uuid.uuid4().hex[:16]}"
    image = row.get("image") or ""
    images = []
    if image:
        images.append({
            "image_id": str(uuid.uuid4()),
            "image_url": image,
            "is_primary": True,
            "original_name": os.path.basename(urlparse(image).path) or "image.jpg",
        })
    wedding_type = "bridal" if sub == "bridal" else ("groom" if sub == "groom" else "")
    compat = item if (major == "wedding_dress" and item) else sub
    return {
        "product_id": pid,
        "seller_id": seller.get("seller_id", CATALOG_SELLER_ID),
        "seller_name": seller.get("name", "Ahmed Traders"),
        "title": title,
        "name": title,
        "description": (row.get("description") or title)[:800],
        "major_category": major,
        "subcategory": sub,
        "item_type": item,
        "category": compat,
        "wedding_dress_type": wedding_type,
        "color": row.get("color") or "",
        "brand": row.get("brand") or "",
        "material": "",
        "condition": "New",
        "city": seller.get("city") or "Lahore",
        "marketplace_type": "new",
        "price": float(row["price"]),
        "price_pkr": float(row["price"]),
        "stock_quantity": 3,
        "availability_status": "available",
        "is_scraped": True,
        "source_site": urlparse(row.get("source_url") or src.get("url") or src.get("base") or "").netloc,
        "source_url": row.get("source_url") or src.get("url") or "",
        "images": images,
        "primary_image_url": image,
        "image_url": image,
        "created_at": NOW,
        "updated_at": NOW,
    }


def already_exists(db, title: str, source_url: str) -> bool:
    q = {"$or": [{"title": title}]}
    if source_url:
        q["$or"].append({"source_url": source_url})
    return db[PRODUCTS_COLLECTION].find_one(q, {"_id": 1}) is not None


def scrape_all(wedding_only: bool = False) -> None:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
    db = client[MONGO_DB]
    seller = ensure_catalog_seller(db)
    gbp_rate = gbp_to_pkr_rate()

    db["admincategories"].delete_many({
        "$or": [
            {"category_id": RETIRED_CAT_RE},
            {"label": RETIRED_CAT_RE},
        ]
    })

    inserted = 0
    skipped = 0
    by_cat: dict[str, int] = {}
    by_sub: dict[str, int] = {}
    sources = [s for s in SOURCES if (not wedding_only or s.get("major") == "wedding_dress")]
    if wedding_only:
        log(f"Wedding-dress mode: {len(sources)} sources")

    for src in sources:
        label = src.get("url") or f"{src.get('base')} {src.get('category_slug') or src.get('search')}"
        log(f"\n-> {src['kind']}  {label}")
        parser = PARSERS.get(src["kind"])
        rows = []
        if parser:
            try:
                rows = parser(src, gbp_rate) or []
            except Exception as exc:
                log(f"  ! parser error: {exc}")
                rows = []
        log(f"  parsed {len(rows)} products")
        for row in rows:
            if not row.get("title") or not row.get("price"):
                continue
            if already_exists(db, row["title"], row.get("source_url") or ""):
                skipped += 1
                continue
            doc = to_product_doc(row, src, seller)
            db[PRODUCTS_COLLECTION].insert_one(doc)
            if src.get("major") == "wedding_dress":
                try:
                    from dress_embedding import embed_dress_product
                    emb_res = embed_dress_product(doc, db=db)
                    if not emb_res.get("ok"):
                        log(f"  ! embed {doc['product_id']}: {emb_res.get('reason')}")
                except Exception as emb_exc:
                    log(f"  ! embed error: {emb_exc}")
            inserted += 1
            by_cat[src["major"]] = by_cat.get(src["major"], 0) + 1
            key = f"{src['major']}/{src['sub']}"
            by_sub[key] = by_sub.get(key, 0) + 1

    # Fill thin decoration / kitchen slices from fallback so each main category has enough rows
    if not wedding_only:
        counts = {
            r["_id"]: r["n"]
            for r in db[PRODUCTS_COLLECTION].aggregate([
                {"$match": {"availability_status": "available"}},
                {"$group": {"_id": "$major_category", "n": {"$sum": 1}}},
            ])
        }
        for fb in FALLBACK_PRODUCTS:
            cat_n = counts.get(fb["major"], 0)
            sub_n = db[PRODUCTS_COLLECTION].count_documents({
                "major_category": fb["major"], "subcategory": fb["sub"], "availability_status": "available",
            })
            need_cat = cat_n < 23
            need_sub = sub_n < 4
            if not (need_cat or need_sub):
                continue
            if already_exists(db, fb["title"], fb.get("source") or ""):
                skipped += 1
                continue
            src = {"major": fb["major"], "sub": fb["sub"], "item": fb["item"], "url": fb.get("source")}
            row = {"title": fb["title"], "description": fb["description"], "price": fb["price"],
                   "image": fb["image"], "source_url": fb.get("source")}
            db[PRODUCTS_COLLECTION].insert_one(to_product_doc(row, src, seller))
            inserted += 1
            counts[fb["major"]] = counts.get(fb["major"], 0) + 1
            by_cat[fb["major"]] = by_cat.get(fb["major"], 0) + 1

    log("\nRebuilding market price stats…")
    stats = rebuild_price_stats(db)
    try:
        from embedding_index import invalidate_cache
        invalidate_cache()
        log("Visual search cache invalidated.")
    except Exception:
        pass

    # Dress counts in DB after run
    dress_counts = list(db[PRODUCTS_COLLECTION].aggregate([
        {"$match": {"major_category": "wedding_dress", "availability_status": "available"}},
        {"$group": {"_id": "$item_type", "n": {"$sum": 1}}},
        {"$sort": {"n": -1}},
    ]))
    client.close()

    log(f"\nInserted {inserted} new products, skipped {skipped} duplicates")
    log("By major category (this run):")
    for k, v in sorted(by_cat.items()):
        log(f"  {k}: +{v}")
    log("Wedding dress totals in DB:")
    for row in dress_counts:
        log(f"  {row['_id']}: {row['n']}")
    log("Stored averages:")
    for cat, info in (stats.get("categories") or {}).items():
        rng = (info.get("priority_ranges") or {}).get("Medium") or {}
        log(f"  {cat}: avg PKR {info.get('avg')}  n={info.get('count')}  "
            f"medium {rng.get('min')}–{rng.get('max')}")


if __name__ == "__main__":
    wedding_only = "--wedding-only" in sys.argv or "--dresses" in sys.argv
    scrape_all(wedding_only=wedding_only)
