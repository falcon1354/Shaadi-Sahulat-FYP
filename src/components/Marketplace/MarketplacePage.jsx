import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Heart, MapPin, ShoppingBag, Package, Sparkles } from 'lucide-react';
import sellerApi from '../../api/sellerApi';
import { useCart } from '../../context/CartContext';
import { useCategories } from '../../hooks/useCategories';
import { toggleWishlistItem, recordRecentlyViewed, patchDowryBudgets } from '../../api/buyerApi';
import ThriftHomePage from '../Thrift/ThriftHomePage';
import heroRetailImg from '../../assets/hero/Buyer_Marketplace.jpg';
import heroThriftImg from '../../assets/hero/Hero_Thrift.jpeg';

const SORT_OPTIONS = [
  { value: 'newest',     label: 'Newest First' },
  { value: 'price_asc',  label: 'Price: Low → High' },
  { value: 'price_desc', label: 'Price: High → Low' },
];

const CONDITIONS = ['', 'New', 'Like New', 'Used', 'Thrift'];
const BIG_CATS   = ['furniture', 'electronics', 'wedding_dress'];
const SMALL_CATS = ['miscellaneous', 'decoration', 'kitchen_items'];

// ── localStorage helpers ──────────────────────────────────────────────────

function readDowry(buyerId) {
  try {
    if (buyerId) {
      // Never show another buyer's dowry — return null if no buyer-specific key
      return JSON.parse(localStorage.getItem(`ss_dowry_${buyerId}`) || 'null');
    }
    return JSON.parse(localStorage.getItem('ss_dowry_latest') || 'null');
  } catch { return null; }
}

function getBudgetForCategory(cat, buyerId) {
  try {
    const data = readDowry(buyerId);
    if (!data?.category_budgets) return null;
    return data.category_budgets[cat] || null;
  } catch { return null; }
}

function readWishlist(buyerId) {
  try {
    if (buyerId) {
      // Never fall back to global — new buyer = empty list
      return JSON.parse(localStorage.getItem(`ss_wishlist_${buyerId}`) || '[]');
    }
    return JSON.parse(localStorage.getItem('ss_wishlist') || '[]');
  } catch { return []; }
}

function saveWishlist(list, buyerId) {
  try {
    const s = JSON.stringify(list);
    if (buyerId) localStorage.setItem(`ss_wishlist_${buyerId}`, s);
    else         localStorage.setItem('ss_wishlist', s);
  } catch {}
}

function saveRecentlyViewed(product, buyerId) {
  try {
    const key     = buyerId ? `ss_recently_viewed_${buyerId}` : 'ss_recently_viewed';
    const current = JSON.parse(localStorage.getItem(key) || '[]');
    const filtered = current.filter(p => p.product_id !== product.product_id);
    const entry = {
      product_id:     product.product_id,
      title:          product.title,
      price:          product.price,
      major_category: product.major_category,
    };
    const updated = [entry, ...filtered].slice(0, 10);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {}
}

function shiftBudget(fromCat, toCat, amount, buyerId) {
  try {
    const dowry = readDowry(buyerId);
    if (!dowry?.category_budgets) return false;
    const budgets = dowry.category_budgets;
    const src = budgets[fromCat];
    const dst = budgets[toCat];
    if (!src || !dst) return false;
    const srcEst  = src.estimated || 0;
    const srcLeft = src.remaining ?? srcEst;
    if (amount > srcLeft) return false;
    const dstEst  = dst.estimated || 0;
    const dstLeft = dst.remaining ?? dstEst;
    src.estimated = srcEst  - amount;
    src.remaining = srcLeft - amount;
    dst.estimated = dstEst  + amount;
    dst.remaining = dstLeft + amount;
    const updated  = JSON.stringify({ ...dowry, category_budgets: budgets });
    localStorage.setItem('ss_dowry_latest', updated);
    if (buyerId) {
      localStorage.setItem(`ss_dowry_${buyerId}`, updated);
      // Persist to MongoDB + notify other components
      patchDowryBudgets(buyerId, budgets).catch(() => {});
      window.dispatchEvent(new CustomEvent('dowry-updated', { detail: { buyerId } }));
    }
    return true;
  } catch { return false; }
}

// ── Toast ─────────────────────────────────────────────────────────────────

function Toast({ message, visible }) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg animate-fade-in">
      {message}
    </div>
  );
}

// ── Budget Overshoot Modal (§11.4) ────────────────────────────────────────

function OvershootModal({ state, onContinue, onShift, onClose, majorCats }) {
  if (!state) return null;
  const { product, overshoot, scenario, cat } = state;
  const catLabel = majorCats?.find(c => c.id === cat)?.label || cat;
  const isBig    = scenario === 'D';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <div className="text-center mb-4">
          <span className="text-4xl">{isBig ? '⚠️' : '💸'}</span>
          <h3 className="text-lg font-bold text-gray-800 mt-2">
            {scenario === 'B'
              ? `Slight Budget Overshoot`
              : `${catLabel} Budget Exceeded`}
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            {scenario === 'B'
              ? `This item slightly exceeds your ${catLabel} budget by`
              : `This item exceeds your ${catLabel} budget by`}
            {' '}
            <span className="font-bold text-red-600">PKR {overshoot.toLocaleString()}</span>
          </p>
          {isBig && overshoot > 50000 && (
            <p className="text-xs text-blue-600 mt-2 bg-blue-50 rounded-lg p-2">
              💳 Consider our BNPL option to spread the cost.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={onShift}
            className="w-full py-2.5 bg-[#ECD4A8] hover:bg-[#dfc08d] text-gray-950 rounded-xl text-sm font-bold transition-all cursor-pointer shadow-md shadow-[#ECD4A8]/10">
            Shift Budget from Another Category
          </button>
          <button
            onClick={onContinue}
            className="w-full py-2 text-sm text-gray-600 border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors cursor-pointer">
            Continue Anyway (over-budget)
          </button>
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Budget Shift Modal (§11.5) ────────────────────────────────────────────

function BudgetShiftModal({ targetCat, overshoot, onDone, onClose, buyerId, majorCats }) {
  const dowry   = readDowry(buyerId);
  const budgets = dowry?.category_budgets || {};
  const cats    = Object.entries(budgets).filter(([k, v]) => k !== targetCat && (v.remaining ?? v.estimated ?? 0) > 0);
  const [fromCat, setFromCat] = useState(cats[0]?.[0] || '');
  const [amount,  setAmount]  = useState(overshoot > 0 ? String(overshoot) : '');
  const [error,   setError]   = useState('');

  const fromBudget = fromCat ? budgets[fromCat] : null;
  const maxShift   = fromBudget ? (fromBudget.remaining ?? fromBudget.estimated ?? 0) : 0;

  const getCatLabel = (id) => majorCats?.find(c => c.id === id)?.label || id;

  const handleConfirm = () => {
    const amt = Number(amount);
    if (!fromCat) return setError('Select a source category.');
    if (!amt || amt <= 0) return setError('Enter a valid amount.');
    if (amt > maxShift) return setError(`Maximum available from this category: PKR ${maxShift.toLocaleString()}`);
    const ok = shiftBudget(fromCat, targetCat, amt, buyerId);
    if (ok) { onDone(); }
    else setError('Shift failed. Please try again.');
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-[#FBEFF1]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Shift Budget</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1">×</button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Shift From</label>
            <select
              value={fromCat}
              onChange={e => { setFromCat(e.target.value); setError(''); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]/20 focus:border-[#ECD4A8] bg-white">
              <option value="">Select category…</option>
              {cats.map(([k, v]) => (
                <option key={k} value={k}>
                  {getCatLabel(k)} — PKR {(v.remaining ?? v.estimated ?? 0).toLocaleString()} available
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Amount (PKR)</label>
            <input
              type="number"
              value={amount}
              min="1"
              max={maxShift}
              onChange={e => { setAmount(e.target.value); setError(''); }}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]/20 focus:border-[#ECD4A8]"
              placeholder="0"
            />
            {fromCat && (
              <p className="text-xs text-gray-400 mt-1">Max available: PKR {maxShift.toLocaleString()}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Shift To</label>
            <div className="border border-[#FBEFF1] bg-[#FFF5F8] rounded-xl px-3 py-2 text-sm text-[#a37b3d] font-semibold">
              {getCatLabel(targetCat)}
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 bg-[#ECD4A8] hover:bg-[#dfc08d] text-gray-950 rounded-xl text-sm font-bold transition-all shadow-md shadow-[#ECD4A8]/10 cursor-pointer">
            Confirm Shift
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Product Card ──────────────────────────────────────────────────────────

function ProductCard({ product, onView, highlight, onAddToCart, isWishlisted, onToggleWishlist, isAdminView = false }) {
  const [toastVisible, setToast] = useState(false);
  const imageUrl    = sellerApi.resolveImageUrl(product.primary_image_url);
  const hasDiscount = product.discount_price && product.discount_price < product.price;
  const cardRef     = useRef(null);

  useEffect(() => {
    if (highlight && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cardRef.current.classList.add('ring-2', 'ring-[#ECD4A8]');
      const t = setTimeout(() => cardRef.current?.classList.remove('ring-2', 'ring-[#ECD4A8]'), 3000);
      return () => clearTimeout(t);
    }
  }, [highlight]);

  const handleAddToCart = (e) => {
    e.stopPropagation();
    onAddToCart(product, () => { setToast(true); setTimeout(() => setToast(false), 1800); });
  };

  const handleKeyDown = (e) => {
    // Open PDP on Enter or Space (accessibility)
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onView && onView(product);
    }
  };

  const totalSold = product.completed_orders || product.orders_count || 0;

  return (
    <>
      <div
        ref={cardRef}
        role="button"
        tabIndex={0}
        onClick={() => onView && onView(product)}
        onKeyDown={handleKeyDown}
        className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-[#ECD4A8] hover:-translate-y-1 transition-all overflow-hidden flex flex-col cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#ECD4A8]"
      >
        {/* Image — taller aspect ratio for modern feel */}
        <div className="relative aspect-[4/5] bg-gray-50 overflow-hidden">
          {imageUrl ? (
            <img src={imageUrl} alt={product.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              onError={e => { e.target.style.display = 'none'; }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 text-5xl bg-gradient-to-br from-[#FFF5F8] to-gray-50">
              📦
            </div>
          )}

          {/* Discount badge — top-left */}
          {hasDiscount && (
            <span className="absolute top-2.5 left-2.5 bg-[#800020] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-xs">
              {product.discount_pct ? `${Math.round(product.discount_pct)}% OFF` : 'SALE'}
            </span>
          )}

          {/* Hot-deal / Best-seller badges */}
          {product.is_hot_deal && (hasDiscount || product.discount_pct) && (
            <span className="absolute top-9 left-2.5 bg-[#9B7036] text-white text-[9.5px] font-bold px-2.5 py-0.5 rounded-full shadow-xs">
              FEATURED DEAL
            </span>
          )}
          {product.is_best_seller && (
            <span className="absolute top-[60px] left-2.5 bg-stone-900 text-[#ECD4A8] text-[9.5px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs border border-[#ECD4A8]/30">
              POPULAR CHOICE
            </span>
          )}

          {/* Wishlist heart — top-right */}
          {!isAdminView && (
            <button
              onClick={e => { e.stopPropagation(); onToggleWishlist(product); }}
              className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center shadow-xs transition-all cursor-pointer ${
                isWishlisted ? 'bg-[#800020] text-white' : 'bg-white/90 text-stone-400 hover:text-[#800020] hover:scale-110'
              }`}
              title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}>
              <Heart size={14} className={isWishlisted ? 'fill-white' : ''} />
            </button>
          )}

          {/* +N more images indicator — bottom-left */}
          {product.images?.length > 1 && (
            <span className="absolute bottom-2.5 left-2.5 bg-white/95 text-stone-700 text-[9.5px] font-bold px-2 py-0.5 rounded-full border border-stone-200/60 shadow-xs">
              +{product.images.length - 1} photos
            </span>
          )}

          {/* Condition pill — bottom-right */}
          {product.condition && product.condition !== 'New' && (
            <span className="absolute bottom-2.5 right-2.5 bg-[#FAF7F2] text-[#9B7036] text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-[#EADBCC]">
              {product.condition}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="p-3.5 flex flex-col flex-1 bg-white">
          {/* Category breadcrumb */}
          <p className="text-[10px] text-[#9B7036] font-bold uppercase tracking-wider mb-1 capitalize">
            {product.major_category?.replace(/_/g, ' ')}
            {product.subcategory ? ` › ${product.subcategory.replace(/_/g, ' ')}` : ''}
          </p>
          {/* Title */}
          <p className="text-xs md:text-sm font-semibold text-stone-900 line-clamp-2 flex-1 mb-2 leading-snug">{product.title}</p>

          {/* Price hierarchy */}
          <div className="flex items-baseline gap-2 mb-2">
            {hasDiscount ? (
              <>
                <span className="text-sm md:text-base font-bold font-serif text-emerald-800">PKR {product.discount_price.toLocaleString()}</span>
                <span className="text-[11px] text-stone-400 line-through">PKR {product.price.toLocaleString()}</span>
              </>
            ) : (
              <span className="text-sm md:text-base font-bold font-serif text-stone-900">PKR {product.price?.toLocaleString()}</span>
            )}
          </div>

          {/* Seller · City · Sold — single muted row */}
          <div className="text-[10px] text-stone-400 flex items-center gap-1.5 flex-wrap mb-3 min-h-[14px]">
            {product.seller_name && <span className="truncate max-w-[90px] font-medium text-stone-600">{product.seller_name}</span>}
            {product.seller_name && product.city && <span className="text-stone-300">·</span>}
            {product.city && (
              <span className="flex items-center gap-0.5"><MapPin size={9} /> {product.city}</span>
            )}
            {totalSold > 0 && (
              <span className="ml-auto text-emerald-700 font-semibold">{totalSold} ordered</span>
            )}
          </div>

          {/* Add to Cart */}
          {!isAdminView && (
            <button
              onClick={handleAddToCart}
              className="w-full py-2 text-xs font-bold text-stone-900 bg-[#FAF7F2] border border-[#EADBCC] rounded-xl hover:bg-[#9B7036] hover:text-white hover:border-[#9B7036] transition-all cursor-pointer shadow-xs flex items-center justify-center gap-1.5"
            >
              <ShoppingBag size={13} /> Add to Cart
            </button>
          )}
        </div>
      </div>
      <Toast message="Added to cart!" visible={toastVisible} />
    </>
  );
}

// ── Product Detail Modal ──────────────────────────────────────────────────

function ProductDetailModal({ product, onClose, onAddToCart, isWishlisted, onToggleWishlist, isAdminView = false, buyerId }) {
  const [toastVisible, setToast] = useState(false);
  if (!product) return null;

  const imageUrl    = sellerApi.resolveImageUrl(product.primary_image_url);
  const hasDiscount = product.discount_price && product.discount_price < product.price;

  const fields = [
    product.color           && { label: 'Color',      value: product.color },
    product.fabric          && { label: 'Fabric',     value: product.fabric },
    product.embroidery_type && { label: 'Embroidery', value: product.embroidery_type },
    product.size            && { label: 'Size',       value: product.size },
    product.material        && { label: 'Material',   value: product.material },
    product.brand           && { label: 'Brand',      value: product.brand },
    product.condition       && { label: 'Condition',  value: product.condition },
    product.city            && { label: 'City',       value: product.city },
  ].filter(Boolean);

  const budgetInfo = (!isAdminView && product.major_category) ? getBudgetForCategory(product.major_category, buyerId) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-[#FBEFF1]">
        {imageUrl && (
          <div className="relative aspect-video w-full overflow-hidden rounded-t-2xl bg-gray-50">
            <img src={imageUrl} alt={product.title} className="w-full h-full object-cover" />
            {!isAdminView && (
              <button
                onClick={() => onToggleWishlist(product)}
                className={`absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center shadow-md transition-all cursor-pointer ${
                  isWishlisted ? 'bg-[#800020] text-white' : 'bg-white/90 text-gray-400 hover:text-[#9B7036]'
                }`}>
                <Heart size={18} className={isWishlisted ? 'fill-white' : ''} />
              </button>
            )}
          </div>
        )}
        <div className="p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-xs text-[#9B7036] font-bold capitalize mb-1">
                {product.major_category?.replace(/_/g, ' ')}
              </p>
              <h2 className="text-lg font-bold text-gray-800">{product.title}</h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1 cursor-pointer">×</button>
          </div>

          {/* Budget banner inside modal */}
          {budgetInfo && (
            <div className="mb-3 p-3 bg-[#FAF7F2] rounded-xl border border-[#EADBCC] text-xs">
              <p className="font-bold text-[#9B7036] capitalize mb-1">
                Your {product.major_category?.replace(/_/g, ' ')} Budget
              </p>
              <div className="flex gap-3 text-gray-600 font-medium">
                <span>Budget: <strong>PKR {budgetInfo.estimated?.toLocaleString()}</strong></span>
                <span>Spent: <strong>PKR {(budgetInfo.spent || 0).toLocaleString()}</strong></span>
                <span className={budgetInfo.remaining < 0 ? 'text-red-500' : 'text-emerald-700'}>
                  Left: <strong>PKR {(budgetInfo.remaining ?? budgetInfo.estimated ?? 0).toLocaleString()}</strong>
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 mb-3">
            {hasDiscount ? (
              <>
                <span className="text-xl font-bold text-emerald-800 font-serif">PKR {product.discount_price.toLocaleString()}</span>
                <span className="text-sm text-gray-400 line-through font-serif">PKR {product.price.toLocaleString()}</span>
                <span className="text-xs bg-red-100 text-[#800020] font-bold px-2 py-0.5 rounded-full">
                  {Math.round(product.discount_pct || 0)}% OFF
                </span>
              </>
            ) : (
              <span className="text-xl font-bold text-stone-900 font-serif">PKR {product.price?.toLocaleString()}</span>
            )}
          </div>

          {product.description && (
            <p className="text-sm text-gray-600 mb-4 leading-relaxed">{product.description}</p>
          )}

          {fields.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {fields.map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-2">
                  <p className="text-[10px] text-gray-400 font-medium">{label}</p>
                  <p className="text-xs text-gray-700 font-semibold capitalize">{value}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-gray-100 mb-4 text-sm text-gray-500">
            <span>Sold by <strong className="text-gray-700">{product.seller_name}</strong></span>
            {product.stock_quantity > 0 && (
              <span className="text-emerald-700 text-xs font-medium">{product.stock_quantity} in stock</span>
            )}
          </div>

          {!isAdminView && (
            <button
              onClick={() => onAddToCart(product, () => { setToast(true); setTimeout(() => setToast(false), 1800); })}
              className="w-full py-2.5 bg-[#9B7036] hover:bg-[#7E5724] text-white rounded-xl text-sm font-bold transition-all shadow-xs cursor-pointer">
              Add to Cart
            </button>
          )}
        </div>
      </div>
      <Toast message="Added to cart!" visible={toastVisible} />
    </div>
  );
}

// ── Main MarketplacePage ──────────────────────────────────────────────────

export default function MarketplacePage({
  highlightProductId,
  onHighlightCleared,
  buyer,
  isAdminView = false,
  onViewProduct,
  initialCategory = '',
  initialSubcategory = '',
}) {
  const cartCtx = useCart();
  const addItem = cartCtx?.addItem || (() => {});
  const { categories, getCategoryIcon, getSubcategoriesFor } = useCategories();
  const buyerId = buyer?.buyer_id || null;

  // Icon consistency: render admin-uploaded category icon (URL from /uploads/Categories/<id>.png)
  // when available, falling back to a default Package icon.
  const renderCategoryIcon = (catId, size = 20) => {
    const url = getCategoryIcon ? getCategoryIcon(catId) : null;
    if (url) {
      return <img src={url} alt="" className="object-contain" style={{ width: size, height: size }} />;
    }
    return <Package size={size} />;
  };

  // Build dynamic MAJOR_CATS: "All" tab + one per DB category
  const MAJOR_CATS = [
    { id: '', label: 'All', icon: <ShoppingBag size={20} /> },
    ...categories.map(c => ({ id: c.category_id, label: c.label, icon: renderCategoryIcon(c.category_id) })),
  ];

  const [activeCat,   setActiveCat]   = useState(initialCategory || '');
  const [activeSub,   setActiveSub]   = useState(initialSubcategory || '');  // subcategory filter
  const [products,    setProducts]    = useState([]);
  const [total,       setTotal]       = useState(0);
  const [page,        setPage]        = useState(1);
  const [loading,     setLoading]     = useState(false);
  const [viewProduct, setViewProduct] = useState(null);

  // Apply category when arriving from product-page breadcrumb navigation
  useEffect(() => {
    setActiveCat(initialCategory || '');
    setActiveSub(initialSubcategory || '');
    setPage(1);
  }, [initialCategory, initialSubcategory]);

  // Filters
  const [sortBy,     setSortBy]     = useState('newest');
  const [condition,  setCondition]  = useState('');
  const [minPrice,   setMinPrice]   = useState('');
  const [maxPrice,   setMaxPrice]   = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [storefrontMode, setStorefrontMode] = useState('new'); // 'new' | 'thrift'

  // Wishlist
  const [wishlist, setWishlist] = useState(() => readWishlist(buyerId));

  // §11.4 Overshoot modal
  const [overshootState, setOvershootState] = useState(null);
  const [pendingCallback, setPendingCallback] = useState(null);
  const [shiftModalOpen, setShiftModalOpen] = useState(false);
  const [shiftToast, setShiftToast] = useState('');

  // Increment to force re-read of dowry from localStorage after budget shifts
  const [budgetRefresh, setBudgetRefresh] = useState(0);

  const LIMIT = 12;

  // Reactive dowry — re-reads when budgetRefresh increments
  const currentDowry = useMemo(() => {
    if (isAdminView) return null;
    return readDowry(buyerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyerId, isAdminView, budgetRefresh]);

  const hasDowry  = !!currentDowry;
  const budgetInfo = (hasDowry && activeCat)
    ? (currentDowry.category_budgets?.[activeCat] || null)
    : null;

  // Merge new admin-added categories into buyer's existing estimation with 0 values
  useEffect(() => {
    if (!buyerId || !categories.length || !hasDowry) return;
    const dowry   = readDowry(buyerId);
    if (!dowry?.category_budgets) return;
    const budgets = { ...dowry.category_budgets };
    let changed   = false;
    categories.forEach(c => {
      if (!(c.category_id in budgets)) {
        budgets[c.category_id] = { estimated: 0, spent: 0, remaining: 0 };
        changed = true;
      }
    });
    if (changed) {
      const updated = JSON.stringify({ ...dowry, category_budgets: budgets });
      localStorage.setItem(`ss_dowry_${buyerId}`, updated);
      setBudgetRefresh(v => v + 1);
    }
  }, [categories, buyerId, hasDowry]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await sellerApi.getPublicProducts({
        major_category: activeCat || undefined,
        subcategory:    activeSub || undefined,
        condition:      condition  || undefined,
        marketplace_type: 'new',   // Default: show only new products in the main marketplace
        min_price:      minPrice   || undefined,
        max_price:      maxPrice   || undefined,
        city:           cityFilter || undefined,
        sort_by:        sortBy,
        page,
        limit: LIMIT,
      });
      if (data.success !== false) {
        setProducts(data.products || []);
        setTotal(data.total || 0);
      }
    } catch (_) {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [activeCat, activeSub, condition, minPrice, maxPrice, cityFilter, sortBy, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!highlightProductId) return;
    const found = products.find(p => p.product_id === highlightProductId);
    if (found) {
      if (onViewProduct && !isAdminView) {
        onViewProduct(found);
      } else {
        setViewProduct(found);
      }
      onHighlightCleared?.();
    }
  }, [highlightProductId, products, onHighlightCleared, isAdminView, onViewProduct]);

  // Save recently viewed when product detail opens (modal path for admin)
  useEffect(() => {
    if (viewProduct) {
      saveRecentlyViewed(viewProduct, buyerId);
      if (buyerId) recordRecentlyViewed(buyerId, {
        product_id: viewProduct.product_id, title: viewProduct.title,
        price: viewProduct.price, major_category: viewProduct.major_category,
      });
    }
  }, [viewProduct, buyerId]);

  // Handler for clicking a product card
  const handleViewProduct = (product) => {
    if (onViewProduct && !isAdminView) {
      onViewProduct(product);
    } else {
      setViewProduct(product);
    }
  };

  // Subcategory hover-dropdown handlers
  const handleCatChange      = (id) => { setActiveCat(id); setActiveSub(''); setPage(1); };
  const handleSubcategorySelect = (catId, subId) => {
    setActiveCat(catId);
    setActiveSub(subId);
    setPage(1);
  };
  const clearSubcategory = () => { setActiveSub(''); setPage(1); };
  const applyFilters    = () => { setPage(1); setShowFilter(false); load(); };
  const clearFilters    = () => { setCondition(''); setMinPrice(''); setMaxPrice(''); setCityFilter(''); setSortBy('newest'); setPage(1); };

  // Wishlist toggle — syncs to localStorage + DB
  const toggleWishlist = (product) => {
    const item = {
      product_id:     product.product_id,
      title:          product.title,
      price:          product.discount_price || product.price,
      major_category: product.major_category,
    };
    setWishlist(prev => {
      const exists  = prev.some(p => p.product_id === product.product_id);
      const updated = exists
        ? prev.filter(p => p.product_id !== product.product_id)
        : [...prev, item];
      saveWishlist(updated, buyerId);
      return updated;
    });
    // Persist to MongoDB (fire and forget)
    if (buyerId) toggleWishlistItem(buyerId, item).catch(() => {});
  };

  // §11.4 Budget check before adding to cart
  const handleAddToCart = (product, onSuccess) => {
    const price     = product.discount_price || product.price || 0;
    const cat       = product.major_category;
    const budget    = (!isAdminView && cat) ? getBudgetForCategory(cat, buyerId) : null;
    const remaining = budget ? (budget.remaining ?? budget.estimated ?? 0) : null;
    const overshoot = remaining !== null ? price - remaining : -1;

    if (overshoot <= 0 || remaining === null) {
      addItem(product);
      onSuccess?.();
      return;
    }

    // Scenario B: small category, small overshoot → subtle toast then add
    if (SMALL_CATS.includes(cat) && overshoot <= 5000) {
      addItem(product);
      onSuccess?.();
      setShiftToast(`This item slightly exceeds your ${cat.replace(/_/g, ' ')} budget by PKR ${overshoot.toLocaleString()}.`);
      setTimeout(() => setShiftToast(''), 3500);
      return;
    }

    // Scenario C or D → show overshoot modal
    setPendingCallback(() => () => { addItem(product); onSuccess?.(); });
    setOvershootState({
      product,
      overshoot,
      scenario: BIG_CATS.includes(cat) ? 'D' : 'C',
      cat,
    });
  };

  const handleOvershootContinue = () => {
    pendingCallback?.();
    setOvershootState(null);
    setPendingCallback(null);
  };

  const handleOvershootShift = () => {
    setShiftModalOpen(true);
  };

  const handleShiftDone = () => {
    setShiftModalOpen(false);
    setShiftToast('Budget shifted successfully! Retry adding the item.');
    setTimeout(() => setShiftToast(''), 3000);
    setOvershootState(null);
    setPendingCallback(null);
    setBudgetRefresh(v => v + 1); // re-read dowry → banner updates
  };

  const displayProducts = products;
  const totalPages      = Math.ceil(total / LIMIT);

  // Lookup for the currently-active category object (for subcategory pill display)
  const activeCatObj = activeCat ? categories.find(c => c.category_id === activeCat) : null;
  const activeCatLabel = activeCat
    ? (MAJOR_CATS.find(c => c.id === activeCat)?.label || activeCat.replace(/_/g, ' '))
    : null;
  const activeSubList = activeCat ? (getSubcategoriesFor?.(activeCat) || []) : [];
  const activeSubLabel = activeSub && activeCatObj
    ? (activeSubList.find(s => (s.id || s.subcategory_id) === activeSub)?.label
        || activeSub.replace(/_/g, ' '))
    : null;

  const goMarketplaceRoot = () => { setActiveCat(''); setActiveSub(''); setPage(1); };
  const goCategoryOnly = () => { setActiveSub(''); setPage(1); };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Unified Dynamic Hero Banner */}
      <div className={`text-white rounded-3xl p-6 md:p-8 relative overflow-hidden shadow-sm border transition-colors duration-500 ${
        storefrontMode === 'thrift' ? 'bg-[#08201a] border-emerald-900/40' : 'bg-[#150a1b] border-white/10'
      }`}>
        {/* Background Image */}
        <div 
          className="absolute inset-0 bg-cover bg-center md:bg-right bg-no-repeat opacity-60 pointer-events-none transition-all duration-700"
          style={{ backgroundImage: `url(${storefrontMode === 'thrift' ? heroThriftImg : heroRetailImg})` }}
        />
        {/* Editorial Gradient */}
        <div className={`absolute inset-0 pointer-events-none transition-all duration-500 ${
          storefrontMode === 'thrift' 
            ? 'bg-gradient-to-r from-[#0d2e26] via-[#0d2e26]/80 to-transparent'
            : 'bg-gradient-to-r from-[#1A121F] via-[#1A121F]/80 to-transparent'
        }`} />

        <div className="relative z-10 space-y-3.5 max-w-2xl animate-fade-in">
          <span className={`px-3 py-1 backdrop-blur-md rounded-full text-[10px] font-bold uppercase tracking-wider inline-block border ${
            storefrontMode === 'thrift'
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30'
              : 'bg-white/10 text-[#ECD4A8] border-[#ECD4A8]/30'
          }`}>
            {storefrontMode === 'thrift' ? 'Sustainable Wedding Marketplace' : 'The Designer Boutique'}
          </span>
          <h2 className="text-3xl sm:text-4xl font-serif font-bold tracking-tight text-white leading-tight">
            {storefrontMode === 'thrift' ? 'Pre-Loved Bridal & Heirloom Decor' : 'Bridal Couture & Wedding Essentials'}
          </h2>
          <p className="text-stone-300 text-xs md:text-sm font-sans font-normal leading-relaxed">
            {storefrontMode === 'thrift'
              ? 'Explore authenticated pre-owned bridal lehengas, jewelry suites, and wedding decor from verified sellers across Pakistan.'
              : 'Discover handcrafted bridal collections, jewelry, and high-end wedding essentials curated from top designers.'}
          </p>
          
          {/* Switcher Tabs */}
          <div className="flex gap-3 pt-2 max-w-md">
            <button
              onClick={() => setStorefrontMode('new')}
              className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                storefrontMode === 'new'
                  ? 'bg-[#9B7036] text-white shadow-md'
                  : 'bg-white/10 hover:bg-white/20 text-stone-200 border border-white/10'
              }`}
            >
              <ShoppingBag size={14} /> Retail & Designer
            </button>
            <button
              onClick={() => setStorefrontMode('thrift')}
              className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                storefrontMode === 'thrift'
                  ? 'bg-emerald-700 text-white shadow-md'
                  : 'bg-white/10 hover:bg-white/20 text-stone-200 border border-white/10'
              }`}
            >
              <Sparkles size={14} /> Pre-Loved & Thrift
            </button>
          </div>
        </div>
      </div>

      {storefrontMode === 'new' ? (
        <>
      {/* Clickable breadcrumb — Marketplace › category › subcategory */}
      <nav
        aria-label="Category breadcrumb"
        className="flex flex-wrap items-center gap-2 text-xs text-stone-500 font-medium"
      >
        <button
          type="button"
          onClick={goMarketplaceRoot}
          className="inline-flex items-center gap-1 font-bold text-[#9B7036] hover:underline cursor-pointer"
        >
          Marketplace
        </button>
        {activeCatLabel && (
          <>
            <span className="text-stone-300">/</span>
            <button
              type="button"
              onClick={goCategoryOnly}
              className={`capitalize hover:underline cursor-pointer ${
                activeSub ? 'text-[#9B7036] font-semibold' : 'text-stone-900 font-bold'
              }`}
            >
              {activeCatLabel}
            </button>
          </>
        )}
        {activeSubLabel && (
          <>
            <span className="text-stone-300">/</span>
            <span className="capitalize text-stone-900 font-bold">{activeSubLabel}</span>
          </>
        )}
      </nav>

      {/* Category tabs */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
        {MAJOR_CATS.map(cat => {
          const isActive = activeCat === cat.id;
          return (
            <button
              key={cat.id || 'all'}
              type="button"
              onClick={() => handleCatChange(cat.id)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#9B7036] text-white shadow-xs'
                  : 'bg-white text-stone-700 border border-[#EFEAE4] hover:border-[#ECD4A8] hover:bg-[#FAF7F2]'
              }`}
            >
              <span className="flex items-center justify-center w-4 h-4">{cat.icon}</span>
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Subcategories — always visible on screen when a category is selected */}
      {activeCat && activeSubList.length > 0 && (
        <div className="rounded-2xl border border-[#EADBCC] bg-[#FAF7F2]/60 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-2.5">
            Curated Collections in {activeCatLabel}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={goCategoryOnly}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                !activeSub
                  ? 'bg-[#9B7036] text-white border-[#9B7036] shadow-xs'
                  : 'bg-white text-stone-700 border-stone-200 hover:border-[#ECD4A8]'
              }`}
            >
              All {activeCatLabel}
            </button>
            {activeSubList.map((sub) => {
              const subId = sub.id || sub.subcategory_id || sub.value;
              const subLabel = sub.label || sub.name || (typeof subId === 'string' ? subId.replace(/_/g, ' ') : '—');
              if (!subId) return null;
              const isSubActive = activeSub === subId;
              return (
                <button
                  key={subId}
                  type="button"
                  onClick={() => handleSubcategorySelect(activeCat, subId)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border capitalize transition-all cursor-pointer ${
                    isSubActive
                      ? 'bg-[#9B7036] text-white border-[#9B7036] shadow-xs'
                      : 'bg-white text-stone-700 border-stone-200 hover:border-[#ECD4A8]'
                  }`}
                >
                  {String(subLabel).replace(/_/g, ' ')}
                </button>
              );
            })}
          </div>
        </div>
      )}


      {/* Budget banner — hidden for admin and when buyer has no estimation */}
      {/* Budget banner — hidden for admin and when buyer has no estimation */}
      {!isAdminView && activeCat && hasDowry && (
        budgetInfo ? (
          <div className="p-3.5 bg-[#FAF7F2] border border-[#EADBCC] rounded-2xl flex items-center gap-4 text-xs flex-wrap">
            <span className="font-bold text-[#9B7036] uppercase tracking-wider capitalize">
              {MAJOR_CATS.find(c => c.id === activeCat)?.label || activeCat} Budget:
            </span>
            <span className="text-stone-600">
              Estimated: <strong className="font-serif text-stone-900">PKR {(budgetInfo.estimated || 0).toLocaleString()}</strong>
            </span>
            <span className="text-stone-600">
              Spent: <strong className="font-serif text-stone-900">PKR {(budgetInfo.spent || 0).toLocaleString()}</strong>
            </span>
            <span className={budgetInfo.remaining < 0 ? 'text-rose-700 font-bold font-serif' : 'text-emerald-800 font-bold font-serif'}>
              Remaining: PKR {(budgetInfo.remaining ?? budgetInfo.estimated ?? 0).toLocaleString()}
            </span>
          </div>
        ) : (
          <div className="p-3 bg-[#FAF7F2]/50 border border-stone-200/60 rounded-2xl flex items-center gap-2 text-xs text-stone-500">
            <span className="font-bold capitalize text-stone-700">
              {MAJOR_CATS.find(c => c.id === activeCat)?.label || activeCat}:
            </span>
            <span className="italic">Category not explicitly budgeted in active plan</span>
          </div>
        )
      )}

      {/* Controls row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-semibold text-stone-500">
            {loading ? 'Curating catalog…' : `${total} collection item${total !== 1 ? 's' : ''}`}
          </span>
          <button onClick={() => setShowFilter(v => !v)}
            className={`text-xs px-3.5 py-1.5 border rounded-xl font-bold transition-all cursor-pointer ${
              showFilter ? 'bg-[#9B7036] text-white border-[#9B7036]' : 'bg-white border-stone-200 text-stone-700 hover:border-[#ECD4A8]'
            }`}>
            Refine Filters
          </button>
          {(condition || minPrice || maxPrice || cityFilter) && (
            <button onClick={clearFilters} className="text-xs text-rose-600 hover:underline cursor-pointer font-semibold">Reset filters</button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-400 font-medium">Sort by:</span>
          <select value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1); }}
            className="text-xs font-semibold border border-stone-200 rounded-xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#ECD4A8] bg-white cursor-pointer">
            {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Filter panel */}
      {showFilter && (
        <div className="bg-white rounded-2xl border border-[#EFEAE4] p-5 grid grid-cols-2 md:grid-cols-4 gap-4 shadow-xs">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">Min Price (PKR)</label>
            <input type="number" value={minPrice} onChange={e => setMinPrice(e.target.value)}
              placeholder="0" min="0"
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#ECD4A8] bg-[#FAF7F2]/40" />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">Max Price (PKR)</label>
            <input type="number" value={maxPrice} onChange={e => setMaxPrice(e.target.value)}
              placeholder="Any budget" min="0"
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#ECD4A8] bg-[#FAF7F2]/40" />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">Condition</label>
            <select value={condition} onChange={e => setCondition(e.target.value)}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#ECD4A8] bg-[#FAF7F2]/40 cursor-pointer">
              <option value="">All Conditions</option>
              {CONDITIONS.filter(Boolean).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500 mb-1.5">City / Location</label>
            <input type="text" value={cityFilter} onChange={e => setCityFilter(e.target.value)}
              placeholder="e.g. Lahore, Karachi"
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#ECD4A8] bg-[#FAF7F2]/40" />
          </div>
          <div className="col-span-2 md:col-span-4 flex gap-2 justify-end pt-2 border-t border-stone-100">
            <button onClick={clearFilters}
              className="px-4 py-2 text-xs font-semibold text-stone-500 hover:text-stone-800 border border-stone-200 rounded-xl cursor-pointer">Clear All</button>
            <button onClick={applyFilters}
              className="px-5 py-2 text-xs font-bold text-white bg-[#9B7036] hover:bg-[#7E5724] rounded-xl shadow-xs cursor-pointer">Apply Filters</button>
          </div>
        </div>
      )}

      {/* Product grid */}
      {loading ? (
        <div className="flex justify-center items-center py-20">
          <div className="w-10 h-10 border-4 border-[#ECD4A8] border-t-[#a37b3d] rounded-full animate-spin" />
        </div>
      ) : displayProducts.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-3">🛍️</p>
          <p className="text-gray-500 text-sm">
            {activeSub
              ? `No products in “${activeSubLabel}” yet.`
              : 'No products found in this category yet.'}
          </p>
          {activeSub && (
            <button onClick={clearSubcategory} className="mt-2 text-xs text-[#a37b3d] hover:underline">
              Browse all in {MAJOR_CATS.find(c => c.id === activeCat)?.label || 'category'}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {displayProducts.map(p => (
            <ProductCard
              key={p.product_id}
              product={p}
              onView={handleViewProduct}
              highlight={highlightProductId === p.product_id}
              onAddToCart={handleAddToCart}
              isWishlisted={wishlist.some(w => w.product_id === p.product_id)}
              onToggleWishlist={toggleWishlist}
              isAdminView={isAdminView}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-3 mt-8">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
            className="px-4 py-2 text-sm border border-gray-200 rounded-xl disabled:opacity-40 hover:border-[#ECD4A8] transition-colors">
            ← Prev
          </button>
          <span className="px-4 py-2 text-sm text-gray-500">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}
            className="px-4 py-2 text-sm border border-gray-200 rounded-xl disabled:opacity-40 hover:border-[#ECD4A8] transition-colors">
            Next →
          </button>
        </div>
      )}
      </>
      ) : (
        <ThriftHomePage buyer={buyer} onProductClick={handleViewProduct} />
      )}

      {/* Product detail modal */}
      {viewProduct && (
        <ProductDetailModal
          product={viewProduct}
          onClose={() => setViewProduct(null)}
          onAddToCart={handleAddToCart}
          isWishlisted={wishlist.some(w => w.product_id === viewProduct.product_id)}
          onToggleWishlist={toggleWishlist}
          isAdminView={isAdminView}
          buyerId={buyerId}
        />
      )}

      {/* §11.4 Overshoot modal — hidden for admin */}
      {!isAdminView && (
        <OvershootModal
          state={overshootState}
          onContinue={handleOvershootContinue}
          onShift={handleOvershootShift}
          onClose={() => { setOvershootState(null); setPendingCallback(null); }}
          majorCats={MAJOR_CATS}
        />
      )}

      {/* §11.5 Budget shift modal — hidden for admin */}
      {!isAdminView && shiftModalOpen && overshootState && (
        <BudgetShiftModal
          targetCat={overshootState.cat}
          overshoot={overshootState.overshoot}
          onDone={handleShiftDone}
          onClose={() => setShiftModalOpen(false)}
          buyerId={buyerId}
          majorCats={MAJOR_CATS}
        />
      )}

      {/* Scenario B subtle toast / shift success toast */}
      <Toast message={shiftToast} visible={!!shiftToast} />
    </div>
  );
}
