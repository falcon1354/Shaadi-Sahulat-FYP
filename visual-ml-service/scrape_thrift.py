"""
ShaadiSahulat thrift catalog scraper
====================================
Deletes incorrect dummy thrift listings, then pulls real pre-loved ads
from OLX Pakistan into seller_products (marketplace_type=thrift).

Run from visual-ml-service/:
    python scrape_thrift.py
"""

from __future__ import annotations

import html as html_lib
import os
import random
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

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
from config import MONGO_DB, MONGO_URI, PRODUCTS_COLLECTION, SELLERS_COLLECTION
from price_stats import rebuild_price_stats

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-PK,en;q=0.9",
}
TIMEOUT = 28
SESSION = requests.Session()
SESSION.headers.update(HEADERS)
NOW = datetime.now(timezone.utc)
THRIFT_SELLER_ID = "SELLER_THRIFT_001"

# Skip jewellery / fabric-only / unrelated classifieds
SKIP_RE = re.compile(
    r"\b(necklace|choker|bangle|earrings?|jhumka|tikka|matha\s*patti|"
    r"chura|gajra|nosepin|ring\b|kundan set|unstitched|cancan|petticoat|"
    r"5\s*yards?|net cloth|fabric only|cloth for lehenga|car\b|bike\b|"
    r"mobile\b|iphone|plot\b|house for sale)\b",
    re.I,
)

SOURCES = [
    # Wedding dress — denser scrape
    {"url": "https://www.olx.com.pk/items/q-used-bridal-lehenga",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_lehenga", "limit": 14, "min_price": 8000},
    {"url": "https://www.olx.com.pk/items/q-bridal-lehenga",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_lehenga", "limit": 14, "min_price": 12000},
    {"url": "https://www.olx.com.pk/items/q-red-bridal-lehenga",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_lehenga", "limit": 10, "min_price": 10000},
    {"url": "https://www.olx.com.pk/items/q-maroon-lehenga",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_lehenga", "limit": 10, "min_price": 8000},
    {"url": "https://www.olx.com.pk/items/q-used-sharara",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_sharara", "limit": 12, "min_price": 5000},
    {"url": "https://www.olx.com.pk/items/q-bridal-sharara",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_sharara", "limit": 12, "min_price": 6000},
    {"url": "https://www.olx.com.pk/items/q-bridal-maxi",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_maxi", "limit": 12, "min_price": 5000},
    {"url": "https://www.olx.com.pk/items/q-wedding-maxi",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_maxi", "limit": 10, "min_price": 5000},
    {"url": "https://www.olx.com.pk/items/q-used-saree",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_saree", "limit": 12, "min_price": 3000},
    {"url": "https://www.olx.com.pk/items/q-bridal-saree",
     "major": "wedding_dress", "sub": "bridal", "item": "bridal_saree", "limit": 12, "min_price": 4000},
    {"url": "https://www.olx.com.pk/items/q-used-sherwani",
     "major": "wedding_dress", "sub": "groom", "item": "groom_sherwani", "limit": 12, "min_price": 5000},
    {"url": "https://www.olx.com.pk/items/q-groom-sherwani",
     "major": "wedding_dress", "sub": "groom", "item": "groom_sherwani", "limit": 12, "min_price": 6000},
    {"url": "https://www.olx.com.pk/items/q-prince-coat",
     "major": "wedding_dress", "sub": "groom", "item": "groom_prince_coat", "limit": 10, "min_price": 4000},
    {"url": "https://www.olx.com.pk/items/q-groom-shalwar-kameez",
     "major": "wedding_dress", "sub": "groom", "item": "groom_shalwar_kameez", "limit": 10, "min_price": 3000},
    {"url": "https://www.olx.com.pk/items/q-wedding-suit-groom",
     "major": "wedding_dress", "sub": "groom", "item": "groom_suit", "limit": 8, "min_price": 5000},
    # Furniture
    {"url": "https://www.olx.com.pk/items/q-used-sofa-set",
     "major": "furniture", "sub": "sofa_set", "item": "sofa_set", "limit": 6, "min_price": 8000},
    {"url": "https://www.olx.com.pk/items/q-used-bed-set",
     "major": "furniture", "sub": "bed_set", "item": "bed_set", "limit": 5, "min_price": 8000},
    {"url": "https://www.olx.com.pk/items/q-used-wardrobe",
     "major": "furniture", "sub": "wardrobe", "item": "wardrobe", "limit": 4, "min_price": 5000},
    {"url": "https://www.olx.com.pk/items/q-used-dining-table",
     "major": "furniture", "sub": "dining_table", "item": "dining_table", "limit": 4, "min_price": 6000},
    {"url": "https://www.olx.com.pk/items/q-used-dressing-table",
     "major": "furniture", "sub": "dressing_table", "item": "dressing_table", "limit": 4, "min_price": 3000},
    # Electronics
    {"url": "https://www.olx.com.pk/items/q-used-led-tv",
     "major": "electronics", "sub": "led_tv", "item": "led_tv", "limit": 6, "min_price": 8000},
    {"url": "https://www.olx.com.pk/items/q-used-refrigerator",
     "major": "electronics", "sub": "refrigerator", "item": "refrigerator", "limit": 5, "min_price": 10000},
    {"url": "https://www.olx.com.pk/items/q-used-washing-machine",
     "major": "electronics", "sub": "washing_machine", "item": "washing_machine", "limit": 5, "min_price": 5000},
    {"url": "https://www.olx.com.pk/items/q-used-split-ac",
     "major": "electronics", "sub": "ac", "item": "ac", "limit": 5, "min_price": 15000},
    # Kitchen
    {"url": "https://www.olx.com.pk/items/q-used-microwave",
     "major": "kitchen_items", "sub": "large_appliances", "item": "microwave", "limit": 4, "min_price": 2000},
    {"url": "https://www.olx.com.pk/items/q-used-juicer",
     "major": "kitchen_items", "sub": "large_appliances", "item": "juicer_blender", "limit": 3, "min_price": 1500},
    {"url": "https://www.olx.com.pk/items/q-used-crockery-set",
     "major": "kitchen_items", "sub": "general_kitchen", "item": "crockery_set", "limit": 4, "min_price": 1500},
    {"url": "https://www.olx.com.pk/items/q-used-cookware",
     "major": "kitchen_items", "sub": "general_kitchen", "item": "cooking_set", "limit": 3, "min_price": 1000},
    # Decoration
    {"url": "https://www.olx.com.pk/items/q-fairy-lights",
     "major": "decoration", "sub": "lights", "item": "lights", "limit": 4, "min_price": 400},
    {"url": "https://www.olx.com.pk/items/q-artificial-flowers",
     "major": "decoration", "sub": "artificial_flowers", "item": "artificial_flowers", "limit": 4, "min_price": 400},
    {"url": "https://www.olx.com.pk/items/q-wall-decor",
     "major": "decoration", "sub": "wall_decor", "item": "wall_decor", "limit": 4, "min_price": 500},
    {"url": "https://www.olx.com.pk/items/q-wedding-stage-decoration",
     "major": "decoration", "sub": "stage_setup", "item": "stage_setup", "limit": 3, "min_price": 2000},
]


def log(msg: str) -> None:
    print(msg.encode("ascii", "replace").decode("ascii"), flush=True)


def strip_html(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", str(text or ""))
    text = html_lib.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def parse_rs(text: str) -> float | None:
    m = re.search(r"Rs\s*([0-9][0-9,]*)", text or "", re.I)
    if not m:
        return None
    try:
        val = float(m.group(1).replace(",", ""))
    except ValueError:
        return None
    return val if val > 0 else None


def condition_detail(title: str) -> str:
    t = (title or "").lower()
    if any(w in t for w in ("used once", "worn once", "like new", "almost new", "brand new")):
        return "Like New"
    if any(w in t for w in ("fair", "repair", "scratch", "old")):
        return "Fair"
    return "Good"


def parse_olx_listings(html: str, src: dict) -> list[dict]:
    out = []
    seen = set()
    chunks = re.split(r'<li[^>]*aria-label="Listing"', html)
    min_price = src.get("min_price") or 500
    for chunk in chunks[1:]:
        href_m = re.search(r'href="(/item/[^"]+)"', chunk)
        title_m = re.search(r'aria-label="Title"[^>]*>\s*<h2[^>]*>([^<]+)</h2>', chunk)
        if not title_m:
            title_m = re.search(r'<h2[^>]*class="[^"]*"[^>]*>([^<]{8,160})</h2>', chunk)
        if not title_m:
            title_m = re.search(r'title="([^"]{8,160})"', chunk)
        price = parse_rs(chunk)
        img_m = re.search(
            r'(?:src|data-src|srcSet|data-srcset)="?(https://images\.olx\.com\.pk/thumbnails/[^"\s>]+)',
            chunk, re.I,
        )
        loc_m = re.search(r'aria-label="Location">([^<]+)', chunk)
        if not href_m or not title_m or not price:
            continue
        title = strip_html(html_lib.unescape(title_m.group(1)))
        if not title or title.lower() in seen:
            continue
        if SKIP_RE.search(title):
            continue
        if price < min_price or price > 2_000_000:
            continue
        href = href_m.group(1)
        if href.startswith("/"):
            href = "https://www.olx.com.pk" + href
        img = img_m.group(1) if img_m else ""
        img = img.replace(".webp", ".jpeg")
        loc = strip_html(loc_m.group(1) if loc_m else "")
        city = loc.split(",")[-1].strip() if loc else "Pakistan"
        seen.add(title.lower())
        out.append({
            "title": title[:180],
            "description": f"Pre-loved {src['item'].replace('_', ' ')} listed on OLX. {title}",
            "price": round(price),
            "image": img,
            "source_url": href,
            "city": city or "Pakistan",
            "location": loc,
        })
        if len(out) >= src.get("limit", 6):
            break
    return out


def fetch_html(url: str) -> str:
    try:
        resp = SESSION.get(url, timeout=TIMEOUT)
        if resp.status_code >= 400:
            log(f"  ! {resp.status_code} {url}")
            return ""
        return resp.text
    except requests.RequestException as exc:
        log(f"  ! {exc} {url}")
        return ""


def ensure_thrift_seller(db) -> dict:
    existing = db[SELLERS_COLLECTION].find_one({"seller_id": THRIFT_SELLER_ID})
    if existing:
        return existing
    doc = {
        "seller_id": THRIFT_SELLER_ID,
        "name": "PreLoved PK",
        "email": "thrift@shaadisahulat.com",
        "phone": "03019876543",
        "city": "Lahore",
        "seller_type": "company",
        "created_at": NOW,
        "updated_at": NOW,
    }
    db[SELLERS_COLLECTION].insert_one(doc)
    return doc


def to_thrift_doc(row: dict, src: dict, seller: dict) -> dict:
    major, sub, item = src["major"], src["sub"], src["item"]
    title = row["title"]
    price = float(row["price"])
    original = round(price * random.uniform(1.35, 1.70))
    detail = condition_detail(title)
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
        "product_id": f"th_{uuid.uuid4().hex[:16]}",
        "seller_id": seller.get("seller_id", THRIFT_SELLER_ID),
        "seller_name": seller.get("name", "PreLoved PK"),
        "title": title,
        "name": title,
        "description": (row.get("description") or title)[:800],
        "major_category": major,
        "subcategory": sub,
        "item_type": item,
        "category": compat,
        "wedding_dress_type": wedding_type,
        "color": "",
        "brand": "",
        "material": "",
        "condition": "Thrift",
        "condition_detail": detail,
        "city": row.get("city") or "Pakistan",
        "marketplace_type": "thrift",
        "is_thrift": True,
        "is_final_sale": True,
        "original_price": float(original),
        "price": price,
        "price_pkr": price,
        "discount_price": price,
        "discount_pct": round((1 - price / original) * 100) if original else None,
        "stock_quantity": 1,
        "availability_status": "available",
        "admin_approval_status": "approved",
        "thrift_approval_status": "approved",
        "is_scraped": True,
        "source_site": "www.olx.com.pk",
        "source_url": row.get("source_url") or src["url"],
        "images": images,
        "primary_image_url": image,
        "image_url": image,
        "created_at": NOW,
        "updated_at": NOW,
    }


def already_exists(db, title: str, source_url: str) -> bool:
    q = {"marketplace_type": "thrift", "$or": [{"title": title}]}
    if source_url:
        q["$or"].append({"source_url": source_url})
    return db[PRODUCTS_COLLECTION].find_one(q, {"_id": 1}) is not None


def delete_dummy_thrift(db) -> int:
    result = db[PRODUCTS_COLLECTION].delete_many({
        "$or": [
            {"marketplace_type": "thrift"},
            {"condition": "Thrift"},
            {"is_thrift": True},
        ]
    })
    return result.deleted_count


def scrape_thrift(wedding_only: bool = False, reset: bool = True) -> None:
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=10000)
    db = client[MONGO_DB]
    seller = ensure_thrift_seller(db)

    if reset and not wedding_only:
        deleted = delete_dummy_thrift(db)
        log(f"Deleted {deleted} incorrect thrift listings")
    elif wedding_only:
        log("Dress-only thrift mode: keeping existing thrift listings, adding more dresses")

    inserted = 0
    skipped = 0
    by_cat: dict[str, int] = {}
    sources = [s for s in SOURCES if (not wedding_only or s.get("major") == "wedding_dress")]

    for src in sources:
        log(f"\n-> OLX  {src['url']}")
        html = fetch_html(src["url"])
        rows = parse_olx_listings(html, src) if html else []
        if len(rows) < 3:
            html2 = fetch_html(src["url"] + ("&page=2" if "?" in src["url"] else "?page=2"))
            extra = parse_olx_listings(html2, src) if html2 else []
            seen = {r["title"].lower() for r in rows}
            for r in extra:
                if r["title"].lower() not in seen:
                    rows.append(r)
                    seen.add(r["title"].lower())
        log(f"  parsed {len(rows)} listings")
        time.sleep(0.6)
        for row in rows[: src.get("limit", 6)]:
            if already_exists(db, row["title"], row.get("source_url") or ""):
                skipped += 1
                continue
            doc = to_thrift_doc(row, src, seller)
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

    log("\nRebuilding new-catalog price stats (thrift excluded)...")
    rebuild_price_stats(db)
    try:
        from embedding_index import invalidate_cache
        invalidate_cache()
        log("Visual search cache invalidated.")
    except Exception:
        pass
    total = db[PRODUCTS_COLLECTION].count_documents({"marketplace_type": "thrift"})
    dress_n = db[PRODUCTS_COLLECTION].count_documents({
        "marketplace_type": "thrift", "major_category": "wedding_dress",
    })
    client.close()

    log(f"\nInserted {inserted} thrift products, skipped {skipped} duplicates")
    log(f"Thrift listings now in DB: {total} (dresses: {dress_n})")
    for k, v in sorted(by_cat.items()):
        log(f"  {k}: +{v}")


if __name__ == "__main__":
    wedding_only = "--wedding-only" in sys.argv or "--dresses" in sys.argv
    scrape_thrift(wedding_only=wedding_only, reset=not wedding_only)
