import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gem, Hand, Banknote, Heart, TrendingUp, Eye, Wallet, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, Sparkles, CheckCircle2, ChevronRight, Clock, Trash2, ShoppingBag } from 'lucide-react';
import { useCategories } from '../../hooks/useCategories';
import { getFullBuyerData } from '../../api/buyerApi';
import { listBuyerOrders } from '../../api/orderApi';
import bnplApi from '../../api/bnplApi';
import { filterDisplayBudgetEntries, isRetiredCategory, splitAllocatedAndDeleted } from '../../lib/dowryDisplay';
import { spentByCategoryFromOrders, applySpentToBudgets } from '../../lib/dowrySpent';
import CategoryThumb from '../Dowry/CategoryThumb';

// ── Buyer-isolated storage helpers ───────────────────────────────────────────
function readDowry(buyerId) {
  try {
    if (buyerId) {
      const v = localStorage.getItem(`ss_dowry_${buyerId}`);
      return v ? JSON.parse(v) : null;
    }
    return JSON.parse(localStorage.getItem('ss_dowry_latest') || 'null');
  } catch { return null; }
}

function readWishlist(buyerId) {
  try {
    if (buyerId) {
      const v = localStorage.getItem(`ss_wishlist_${buyerId}`);
      return v ? JSON.parse(v) : [];
    }
    return [];
  } catch { return []; }
}

function readRecentlyViewed(buyerId) {
  try {
    if (buyerId) {
      const v = localStorage.getItem(`ss_recently_viewed_${buyerId}`);
      return v ? JSON.parse(v) : [];
    }
    return [];
  } catch { return []; }
}

const ANALYTICS_TABS = ['Overview', 'By Category', 'Remaining', 'Projections'];

export default function BuyerDashboard({ buyer, onViewProduct }) {
  const navigate = useNavigate();
  const buyerId = buyer?.buyer_id;
  const { categories } = useCategories({ includeInactive: true });

  const catLabel = (key) =>
    categories.find(c => c.category_id === key)?.label || key.replace(/_/g, ' ');

  const [dowry,          setDowry]          = useState(null);
  const [wishlist,       setWishlist]       = useState([]);
  const [recentlyViewed, setRecentlyViewed] = useState([]);
  const [analyticsTab,   setAnalyticsTab]   = useState('Overview');
  const [purchasedItems, setPurchasedItems] = useState([]);
  const [bnplRepayments, setBnplRepayments] = useState([]);

  const persistDowry = (payload) => {
    const s = JSON.stringify(payload);
    if (buyerId) localStorage.setItem(`ss_dowry_${buyerId}`, s);
    localStorage.setItem('ss_dowry_latest', s);
    setDowry(payload);
  };

  // Single refresh path: Mongo reconcile → all orders + BNPL apps → stable spent overlay
  useEffect(() => {
    setWishlist(readWishlist(buyerId));
    setRecentlyViewed(readRecentlyViewed(buyerId));
    const local = readDowry(buyerId);
    if (local) setDowry(local);
    if (!buyerId) return;

    let cancelled = false;

    (async () => {
      try {
        const [fullRes, ordersRes, appsRes, repayRes] = await Promise.all([
          getFullBuyerData(buyerId),
          listBuyerOrders(buyerId, { page: 1, limit: 200 }),
          bnplApi.listMyApplications(buyerId),
          bnplApi.listMyRepayments(buyerId),
        ]);
        if (cancelled) return;

        if (repayRes?.success) setBnplRepayments(repayRes.rows || []);

        const orders = (ordersRes?.success ? ordersRes.orders : []) || [];
        const bnplApps = (appsRes?.success ? appsRes.applications : []) || [];
        const completed = orders.filter(
          (o) => !o.superseded && ['COMPLETED', 'DELIVERED', 'RESOLVED'].includes(o.status)
        );
        const items = [];
        completed.forEach((o) => {
          (o.items || []).forEach((it) => items.push({ ...it, order_id: o.order_id, status: o.status }));
        });
        setPurchasedItems(items);

        const est = fullRes?.success ? fullRes.dowry_estimation : null;
        const budgets = est?.category_budgets || local?.category_budgets;
        if (!budgets || !Object.keys(budgets).length) return;

        const total = Object.values(budgets).reduce((s, v) => s + (v?.estimated || 0), 0);
        const originalIds = Array.isArray(est?.original_category_ids) && est.original_category_ids.length
          ? est.original_category_ids
          : (local?.original_category_ids?.length
            ? local.original_category_ids
            : Object.keys(budgets).filter((k) => (budgets[k]?.estimated || 0) > 0));

        const spentByCat = spentByCategoryFromOrders(orders, bnplApps);
        const { budgets: synced } = applySpentToBudgets(budgets, spentByCat);
        persistDowry({
          estimation_id: est?._id || local?.estimation_id,
          total_budget: total || est?.total_recommended_budget || local?.total_budget,
          category_budgets: synced,
          original_category_ids: originalIds,
          saved_at: est?.updated_at || est?.created_at || new Date().toISOString(),
        });
      } catch (_) { /* keep local */ }
    })();

    return () => { cancelled = true; };
  }, [buyerId]);

  // Re-read when any component shifts budget (cart checkout, marketplace, dowry reallocation)
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail?.buyerId || e.detail.buyerId === buyerId) {
        // Prefer a full refresh so spent stays order-sourced, not stale local
        if (!buyerId) {
          setDowry(readDowry(buyerId));
          return;
        }
        Promise.all([
          getFullBuyerData(buyerId),
          listBuyerOrders(buyerId, { page: 1, limit: 200 }),
          bnplApi.listMyApplications(buyerId),
        ]).then(([fullRes, ordersRes, appsRes]) => {
          const est = fullRes?.success ? fullRes.dowry_estimation : null;
          const base = est?.category_budgets || readDowry(buyerId)?.category_budgets;
          if (!base) return;
          const spentByCat = spentByCategoryFromOrders(
            ordersRes?.orders || [],
            appsRes?.applications || []
          );
          const { budgets: synced } = applySpentToBudgets(base, spentByCat);
          const originalIds = est?.original_category_ids
            || readDowry(buyerId)?.original_category_ids
            || Object.keys(synced).filter((k) => (synced[k]?.estimated || 0) > 0);
          persistDowry({
            estimation_id: est?._id,
            total_budget: Object.values(synced).reduce((s, v) => s + (v?.estimated || 0), 0),
            category_budgets: synced,
            original_category_ids: originalIds,
            saved_at: new Date().toISOString(),
          });
        }).catch(() => setDowry(readDowry(buyerId)));
      }
    };
    window.addEventListener('dowry-updated', handler);
    return () => window.removeEventListener('dowry-updated', handler);
  }, [buyerId]);

  // Merge new DB categories into buyer's category_budgets with default 0
  // so Reallocate can target them — they stay hidden on charts until funded.
  const mergedDowry = useMemo(() => {
    if (!dowry || !categories.length) return dowry;
    const budgets = { ...(dowry.category_budgets || {}) };
    let changed = false;
    for (const cat of categories) {
      if (isRetiredCategory(cat.category_id)) continue;
      if (cat.is_active === false) continue;
      if (!(cat.category_id in budgets)) {
        budgets[cat.category_id] = { estimated: 0, spent: 0, remaining: 0, active: true };
        changed = true;
      }
    }
    const originalIds = Array.isArray(dowry.original_category_ids) && dowry.original_category_ids.length
      ? dowry.original_category_ids
      : Object.keys(dowry.category_budgets || {}).filter(k => ((dowry.category_budgets || {})[k]?.estimated || 0) > 0);
    if (!changed && dowry.original_category_ids) return dowry;
    const updated = { ...dowry, category_budgets: budgets, original_category_ids: originalIds };
    const s = JSON.stringify(updated);
    localStorage.setItem('ss_dowry_latest', s);
    if (buyerId) localStorage.setItem(`ss_dowry_${buyerId}`, s);
    return updated;
  }, [dowry, categories, buyerId]);

  const dbCatIds   = categories.map(c => c.category_id);
  const catBudgets = mergedDowry?.category_budgets || {};
  const originalIds = mergedDowry?.original_category_ids;

  const { live: activeCats, deleted: deletedCats } = splitAllocatedAndDeleted(
    catBudgets,
    originalIds,
    categories
  );
  // Keep funded categories even if somehow missing from list
  const orphanFunded = filterDisplayBudgetEntries(catBudgets, originalIds).filter(
    ([key]) => !activeCats.some(([k]) => k === key) && !deletedCats.some(([k]) => k === key)
  );
  const displayLive = [...activeCats, ...orphanFunded];

  const totalEst    = [...displayLive, ...deletedCats].reduce((s, [, v]) => s + (v.estimated || 0), 0);
  const totalSpent  = [...displayLive, ...deletedCats].reduce((s, [, v]) => s + (v.spent || 0), 0);
  const totalRemain = [...displayLive, ...deletedCats].reduce((s, [, v]) => s + (v.remaining ?? (v.estimated - (v.spent || 0))), 0);
  const spentPct    = totalEst > 0 ? Math.round((totalSpent / totalEst) * 100) : 0;

  const noEstimate = !mergedDowry;

  const handleClearWishlist = () => {
    if (buyerId) {
      localStorage.setItem(`ss_wishlist_${buyerId}`, JSON.stringify([]));
      setWishlist([]);
    }
  };

  return (
    <div className="animate-fade-in space-y-8 pb-12">
      {/* Luxury Editorial Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FAF7F2] via-[#FDFBF7] to-[#F5EFEB] p-8 md:p-10 border border-[#EADBCC]/80 shadow-[0_4px_24px_rgba(163,123,61,0.06)]">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-72 h-72 bg-[#ECD4A8]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 w-64 h-64 bg-[#FBEFF1]/40 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 border border-[#EADBCC] text-[#9B7036] text-[11px] font-bold tracking-wider uppercase shadow-xs">
                <Sparkles size={12} className="text-[#9B7036]" />
                Bridal Concierge
              </span>
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#800020]/5 border border-[#800020]/15 text-[#800020] text-[11px] font-semibold tracking-wide">
                Smart Wedding Planner
              </span>
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-serif font-bold text-stone-900 tracking-tight leading-tight">
                Welcome back, {buyer?.name?.split(' ')[0] || 'Bride & Groom'}
              </h1>
              <p className="text-stone-600 text-sm md:text-base font-sans mt-1 max-w-xl font-normal leading-relaxed">
                Your curated wedding planning suite. Monitor real-time budget allocations, installment plans, and personalized bridal selections.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
            <div className="px-4 py-3 rounded-2xl bg-white/90 border border-[#EADBCC] shadow-xs flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#FFF5F8] text-[#9B7036] flex items-center justify-center">
                <Clock size={18} />
              </div>
              <div>
                <p className="text-[10px] uppercase font-bold tracking-wider text-stone-400">Wedding Planner Hub</p>
                <p className="text-xs font-bold text-stone-800">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Action Shortcuts */}
        <div className="relative z-10 mt-6 pt-6 border-t border-[#EADBCC]/60 flex items-center gap-3 flex-wrap">
          <span className="text-xs font-semibold text-stone-500 mr-1">Quick Access:</span>
          <button
            onClick={() => navigate('/buyer/marketplace')}
            className="px-3.5 py-1.5 rounded-xl bg-white/80 hover:bg-white text-stone-800 text-xs font-semibold border border-[#EADBCC] transition-all hover:shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ShoppingBag size={13} className="text-[#9B7036]" />
            Boutique Marketplace
          </button>
          <button
            onClick={() => navigate('/buyer/visual')}
            className="px-3.5 py-1.5 rounded-xl bg-white/80 hover:bg-white text-stone-800 text-xs font-semibold border border-[#EADBCC] transition-all hover:shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Eye size={13} className="text-[#9B7036]" />
            Find by Photo
          </button>
          <button
            onClick={() => navigate('/buyer/dowry')}
            className="px-3.5 py-1.5 rounded-xl bg-white/80 hover:bg-white text-stone-800 text-xs font-semibold border border-[#EADBCC] transition-all hover:shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <BarChart3 size={13} className="text-[#9B7036]" />
            Budget Estimator
          </button>
          <button
            onClick={() => navigate('/buyer/bnpl')}
            className="px-3.5 py-1.5 rounded-xl bg-white/80 hover:bg-white text-stone-800 text-xs font-semibold border border-[#EADBCC] transition-all hover:shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Banknote size={13} className="text-[#9B7036]" />
            My BNPL Plans
          </button>
        </div>
      </div>

      {/* Luxury Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Total Budget */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#EFEAE4] hover:border-[#ECD4A8] transition-all duration-300 relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-stone-500 text-[11px] font-bold uppercase tracking-wider">Total Recommended Budget</span>
              <h3 className="text-2xl font-bold font-serif text-stone-900 mt-1">
                {noEstimate ? (
                  <span className="text-sm font-sans font-medium text-stone-400">No estimation generated</span>
                ) : (
                  `PKR ${totalEst.toLocaleString()}`
                )}
              </h3>
            </div>
            <div className="p-3 bg-[#FAF7F2] text-[#9B7036] rounded-2xl border border-[#EADBCC]/60 group-hover:bg-[#9B7036] group-hover:text-white transition-colors duration-300">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-stone-100 pt-3">
            <span className="text-stone-500">{noEstimate ? 'Complete the estimation' : `${displayLive.length + deletedCats.length} Categories included`}</span>
            {!noEstimate && <span className="inline-flex items-center text-[#9B7036] font-bold gap-1">Active Plan <CheckCircle2 size={13} /></span>}
          </div>
        </div>

        {/* Card 2: Total Spent */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#EFEAE4] hover:border-[#ECD4A8] transition-all duration-300 relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-stone-500 text-[11px] font-bold uppercase tracking-wider">Total Spent So Far</span>
              <h3 className="text-2xl font-bold font-serif text-stone-900 mt-1">
                {noEstimate ? <span className="text-sm font-sans font-medium text-stone-400">—</span> : `PKR ${totalSpent.toLocaleString()}`}
              </h3>
            </div>
            <div className="p-3 bg-[#FFF5F8] text-[#800020] rounded-2xl border border-[#FBEFF1] group-hover:bg-[#800020] group-hover:text-white transition-colors duration-300">
              <Banknote size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-stone-100 pt-3">
            <span className="text-stone-500">{noEstimate ? 'No transactions' : `${spentPct}% utilized`}</span>
            {!noEstimate && (
              <span className={`inline-flex items-center font-bold gap-0.5 ${spentPct > 80 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {spentPct > 80 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />} {spentPct}% of plan
              </span>
            )}
          </div>
        </div>

        {/* Card 3: Remaining Budget */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#EFEAE4] hover:border-[#ECD4A8] transition-all duration-300 relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-stone-500 text-[11px] font-bold uppercase tracking-wider">Remaining Balance</span>
              <h3 className={`text-2xl font-bold font-serif mt-1 ${totalRemain < 0 ? 'text-rose-700' : 'text-stone-900'}`}>
                {noEstimate ? <span className="text-sm font-sans font-medium text-stone-400">—</span> : `PKR ${totalRemain.toLocaleString()}`}
              </h3>
            </div>
            <div className="p-3 bg-[#ECFDF5] text-emerald-700 rounded-2xl border border-emerald-100 group-hover:bg-emerald-700 group-hover:text-white transition-colors duration-300">
              <Gem size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-stone-100 pt-3">
            <span className="text-stone-500">Available to allocate</span>
            {!noEstimate && (
              <span className={`font-bold ${totalRemain < 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {totalRemain < 0 ? 'Over Budget' : 'Safe Runway'}
              </span>
            )}
          </div>
        </div>

        {/* Card 4: Wishlist Items */}
        <div className="bg-white rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] border border-[#EFEAE4] hover:border-[#ECD4A8] transition-all duration-300 relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <span className="text-stone-500 text-[11px] font-bold uppercase tracking-wider">Saved Wishlist</span>
              <h3 className="text-2xl font-bold font-serif text-stone-900 mt-1">{wishlist.length} <span className="text-sm font-sans font-normal text-stone-500">items</span></h3>
            </div>
            <div className="p-3 bg-[#FFF5F8] text-[#800020] rounded-2xl border border-[#FBEFF1] group-hover:bg-[#800020] group-hover:text-white transition-colors duration-300">
              <Heart size={20} />
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs border-t border-stone-100 pt-3">
            <span className="text-stone-500">Curated favorites</span>
            {wishlist.length > 0 && (
              <button 
                onClick={handleClearWishlist} 
                className="text-stone-400 hover:text-rose-700 font-semibold inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                Clear all <Trash2 size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* My BNPL — repayment status (right under KPI cards) */}
      {bnplRepayments.length > 0 && (
        <div className="bg-white rounded-3xl border border-[#EFEAE4] shadow-sm p-6 md:p-8 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-bold font-serif text-stone-900 flex items-center gap-2">
                <Banknote className="text-[#9B7036]" size={22} /> My BNPL Financing Plans
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                {bnplRepayments.length} active installment plan{bnplRepayments.length === 1 ? '' : 's'} · bank-backed transparent repayment
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/buyer/bnpl')}
              className="text-xs font-bold text-[#9B7036] hover:text-[#7E5724] inline-flex items-center gap-1 cursor-pointer"
            >
              View detailed repayment schedule <ChevronRight size={14} />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {bnplRepayments.slice(0, 4).map((r) => (
              <div key={r.application_no} className="rounded-2xl border border-[#EFEAE4] bg-[#FAF7F2]/50 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-stone-900">{r.application_no}</p>
                    <p className="text-[11px] text-stone-500 font-mono">{r.order_id}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                    r.repayment_status === "COMPLETED"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-[#FFF8E7] text-[#9B7036] border-[#ECD4A8]"
                  }`}>{r.repayment_status}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-stone-400 text-[11px]">Total Financed</p>
                    <p className="font-bold text-stone-900">PKR {(r.total_amount || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-stone-400 text-[11px]">Monthly Installment</p>
                    <p className="font-bold text-stone-900">PKR {(r.monthly_installment || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-stone-400 text-[11px]">Paid so far</p>
                    <p className="font-bold text-emerald-700">PKR {(r.amount_paid || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-stone-400 text-[11px]">Remaining</p>
                    <p className="font-bold text-amber-800">PKR {(r.amount_remaining || 0).toLocaleString()}</p>
                  </div>
                </div>
                {r.next_due_date && r.repayment_status === "ACTIVE" && (
                  <p className="text-[11px] text-stone-700 font-medium bg-white/80 px-2.5 py-1 rounded-lg border border-stone-200/60">
                    Next payment due: <b className="text-stone-900">{new Date(r.next_due_date).toLocaleDateString()}</b>
                  </p>
                )}
                <div className="h-2 bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#9B7036] rounded-full transition-all duration-500"
                    style={{
                      width: `${r.total_amount > 0 ? Math.min(100, Math.round(((r.amount_paid || 0) / r.total_amount) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          {bnplRepayments.length > 4 && (
            <button
              type="button"
              onClick={() => navigate('/buyer/bnpl')}
              className="w-full text-center text-xs font-bold text-[#9B7036] py-2 cursor-pointer"
            >
              +{bnplRepayments.length - 4} more plans · open My BNPL
            </button>
          )}
        </div>
      )}

      {/* No Estimate Beautiful Onboarding Callout */}
      {noEstimate && (
        <div className="bg-white rounded-3xl p-10 text-center border border-[#EADBCC] shadow-sm max-w-2xl mx-auto space-y-6">
          <div className="w-16 h-16 bg-[#FAF7F2] rounded-2xl flex items-center justify-center mx-auto text-[#9B7036] border border-[#EADBCC]">
            <Sparkles size={32} />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold font-serif text-stone-900">Personalized Wedding Budget Planner</h2>
            <p className="text-sm text-stone-600 leading-relaxed max-w-lg mx-auto font-sans">
              Generate a bespoke wedding budget estimation tailored to your family preferences, dowry items, and financial comfort zones.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => navigate('/buyer/dowry')}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#9B7036] hover:bg-[#7E5724] text-white font-bold text-sm shadow-md transition-all cursor-pointer"
            >
              <span>Launch Budget Estimator Wizard</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Main Budget Breakdown & Analytics Panel */}
      {!noEstimate && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Panel: Category budgets */}
          <div className="lg:col-span-7 bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#EFEAE4] flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold font-serif text-stone-900 tracking-tight flex items-center gap-2.5">
                    <TrendingUp className="text-[#9B7036]" size={24} /> Budget Allocation
                  </h2>
                  <p className="text-stone-500 text-xs mt-1">Recommended target vs actual spend per bridal category</p>
                </div>
                {mergedDowry?.saved_at && (
                  <span className="text-[11px] font-medium text-stone-500 bg-[#FAF7F2] px-3 py-1.5 rounded-xl border border-[#EFEAE4]">
                    Updated: {new Date(mergedDowry.saved_at).toLocaleDateString()}
                  </span>
                )}
              </div>

              <div className="space-y-3.5 max-h-[420px] overflow-y-auto pr-1">
                {displayLive.map(([cat, info]) => {
                  const spent     = info.spent || 0;
                  const est       = info.estimated || 0;
                  const remaining = info.remaining ?? (est - spent);
                  const isOver    = remaining < 0;
                  const itemPct   = est > 0 ? Math.min(100, Math.round((spent / est) * 100)) : 0;
                  
                  return (
                    <div key={cat} className="group p-4 bg-[#FAF7F2]/60 hover:bg-[#FFF5F8]/70 rounded-2xl border border-[#EFEAE4] transition-all duration-300">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <CategoryThumb categoryId={cat} categories={categories} size={40} />
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-stone-900 capitalize tracking-wide truncate">{catLabel(cat)}</p>
                            <p className="text-[11px] text-stone-500 font-medium">
                              Spent: PKR {spent.toLocaleString()} · Allocated: PKR {est.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-sm font-bold font-serif ${isOver ? 'text-rose-700' : 'text-emerald-800'}`}>
                            {isOver ? `Over PKR ${Math.abs(remaining).toLocaleString()}` : `PKR ${remaining.toLocaleString()} left`}
                          </p>
                          <p className="text-[10px] text-stone-400 font-semibold">
                            {itemPct}% utilized
                          </p>
                        </div>
                      </div>
                      
                      <div className="w-full bg-stone-200/70 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${isOver ? 'bg-rose-600' : itemPct > 80 ? 'bg-amber-600' : 'bg-[#9B7036]'}`}
                          style={{ width: `${itemPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}

                {deletedCats.length > 0 && (
                  <div className="pt-2 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-rose-700 px-1">Retired Categories</p>
                    {deletedCats.map(([cat, info]) => {
                      const spent = info.spent || 0;
                      const est = info.estimated || 0;
                      const remaining = info.remaining ?? (est - spent);
                      return (
                        <div key={`del-${cat}`} className="p-4 bg-rose-50/60 rounded-2xl border border-rose-100">
                          <div className="flex items-center gap-2.5">
                            <CategoryThumb categoryId={cat} categories={categories} size={40} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-rose-900 capitalize truncate">{catLabel(cat)}</p>
                              <p className="text-[11px] text-rose-600 font-medium">
                                Archived · PKR {remaining.toLocaleString()} left · Spent PKR {spent.toLocaleString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Overall progress bar */}
            <div className="mt-8 pt-6 border-t border-stone-100">
              <div className="flex justify-between text-xs font-semibold text-stone-600 mb-2">
                <span>Total Wedding Budget Allocation</span>
                <span className="text-[#9B7036] font-bold">{spentPct}% utilized (PKR {totalSpent.toLocaleString()} spent)</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2.5 p-0.5 border border-stone-200">
                <div
                  className="bg-gradient-to-r from-[#9B7036] to-[#c09858] h-1.5 rounded-full transition-all duration-500 shadow-xs"
                  style={{ width: `${Math.min(100, spentPct)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Right Panel: Spending Analytics Tabbed view */}
          <div className="lg:col-span-5 bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#FBEFF1]">
            <div className="mb-6">
              <h2 className="text-2xl font-extrabold text-gray-950 tracking-tight flex items-center gap-2.5">
                <BarChart3 className="text-[#a37b3d]" size={24} /> Insights & Projections
              </h2>
              <p className="text-gray-400 text-xs mt-1">Select views to analyze trends and forecasts</p>
            </div>

            {/* Analytics navigation */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-2 bg-gray-50 p-1.5 rounded-2xl mb-6">
              {ANALYTICS_TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setAnalyticsTab(tab)}
                  className={`py-2 px-1 text-center text-xs font-semibold rounded-xl transition-all cursor-pointer ${
                    analyticsTab === tab ? 'bg-white text-[#a37b3d] shadow-sm border border-[#FBEFF1]' : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Tab content area */}
            <div className="space-y-6 min-h-[300px] flex flex-col justify-between">
              
              {/* Tab 1: Overview */}
              {analyticsTab === 'Overview' && (
                <div className="space-y-6 my-auto">
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Estimated', value: `PKR ${totalEst.toLocaleString()}`, bg: 'bg-[#FFF5F8]', text: 'text-[#a37b3d]' },
                      { label: 'Spent', value: `PKR ${totalSpent.toLocaleString()}`, bg: 'bg-[#FDF2F3]', text: 'text-rose-600' },
                      { label: 'Remaining', value: `PKR ${totalRemain.toLocaleString()}`, bg: 'bg-[#FEF4F7]', text: 'text-emerald-800' },
                    ].map(c => (
                      <div key={c.label} className={`${c.bg} rounded-2xl p-4 text-center border border-white`}>
                        <p className={`text-sm md:text-base font-extrabold ${c.text}`}>{c.value}</p>
                        <p className="text-[10px] text-gray-500 font-semibold mt-1 uppercase tracking-wide">{c.label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="p-5 bg-gradient-to-r from-[#FFF5F8] to-[#FDF2F3] border border-[#FBEFF1] rounded-2xl relative">
                    <p className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1.5">
                      <Sparkles size={16} className="text-[#a37b3d]" /> Smart Advisory
                    </p>
                    <p className="text-xs text-stone-600 leading-relaxed font-sans">
                      {spentPct < 40 ? 'Your bridal budget is in pristine condition. You have ample flexibility to prioritize heirloom jewelry and couture pieces.' :
                       spentPct < 75 ? 'You are pacing well within your planned limits. Continue balancing retail acquisitions with custom or thrift options.' :
                       'Advisory: You are approaching target budget limits. Consider reallocating surplus funds from other categories or exploring BNPL financing.'}
                    </p>
                  </div>
                </div>
              )}

              {/* Tab 2: By Category List */}
              {analyticsTab === 'By Category' && (
                <div className="space-y-3.5 overflow-y-auto max-h-[320px] pr-1">
                  {displayLive.map(([cat, info]) => {
                    const spent = info.spent || 0;
                    const est   = info.estimated || 0;
                    const pct   = est > 0 ? Math.min(100, Math.round((spent / est) * 100)) : 0;
                    return (
                      <div key={cat} className="space-y-1.5 p-2 rounded-xl bg-[#FAF7F2]/50">
                        <div className="flex justify-between text-xs font-semibold gap-2">
                          <span className="text-stone-800 capitalize flex items-center gap-2 min-w-0 font-medium">
                            <CategoryThumb categoryId={cat} categories={categories} size={24} />
                            <span className="truncate">{catLabel(cat)}</span>
                          </span>
                          <span className="text-stone-500 font-serif shrink-0">PKR {spent.toLocaleString()} / {est.toLocaleString()}</span>
                        </div>
                        <div className="w-full bg-stone-200/60 rounded-full h-1.5">
                          <div className={`h-1.5 rounded-full transition-all duration-300 ${pct > 90 ? 'bg-rose-600' : pct > 70 ? 'bg-amber-600' : 'bg-[#9B7036]'}`}
                            style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {deletedCats.length > 0 && (
                    <div className="pt-2 border-t border-rose-100 space-y-2">
                      <p className="text-[10px] font-bold text-rose-700 uppercase">Archived</p>
                      {deletedCats.map(([cat, info]) => (
                        <div key={`d-${cat}`} className="flex items-center justify-between text-xs gap-2">
                          <span className="flex items-center gap-2 text-rose-800 capitalize">
                            <CategoryThumb categoryId={cat} categories={categories} size={24} />
                            {catLabel(cat)}
                          </span>
                          <span className="text-rose-600 font-semibold">PKR {(info.estimated || 0).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Remaining Sorted List */}
              {analyticsTab === 'Remaining' && (
                <div className="space-y-4 my-auto">
                  <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                    {[...displayLive]
                      .sort(([, a], [, b]) => (b.remaining ?? (b.estimated - (b.spent || 0))) - (a.remaining ?? (a.estimated - (a.spent || 0))))
                      .map(([cat, info]) => {
                        const rem   = info.remaining ?? (info.estimated - (info.spent || 0));
                        const isOvr = rem < 0;
                        return (
                          <div key={cat} className="flex items-center justify-between py-2 border-b border-stone-100 last:border-0 text-xs font-medium">
                            <span className="text-stone-700 capitalize">{catLabel(cat)}</span>
                            <span className={`font-bold font-serif ${isOvr ? 'text-rose-700' : 'text-emerald-800'}`}>
                              {isOvr ? `-PKR ${Math.abs(rem).toLocaleString()}` : `PKR ${rem.toLocaleString()}`}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                  <div className="pt-4 border-t border-stone-100 flex justify-between text-sm font-bold text-stone-900">
                    <span>Net Available Surplus</span>
                    <span className={`font-serif ${totalRemain < 0 ? 'text-rose-700' : 'text-emerald-800'}`}>
                      PKR {totalRemain.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Tab 4: Projections */}
              {analyticsTab === 'Projections' && (
                <div className="space-y-3 my-auto">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-stone-400 mb-2">Simulated Scenarios</p>
                  {[
                    { label: 'Smart Thrift & Rentals (70%)', total: Math.round(totalEst * 0.70), desc: 'Focus on sustainable pre-loved bridalwear', color: 'bg-emerald-50/60 text-emerald-900 border-emerald-100' },
                    { label: 'Target Model (85%)', total: Math.round(totalEst * 0.85), desc: 'Mix of designer retail & seasonal promotions', color: 'bg-[#FAF7F2] text-[#9B7036] border-[#EADBCC]' },
                    { label: 'Couture Luxury (100%)', total: totalEst, desc: 'Full custom boutique specifications', color: 'bg-rose-50/60 text-[#800020] border-rose-100' },
                  ].map(p => (
                    <div key={p.label} className={`p-3.5 rounded-2xl border flex items-center justify-between ${p.color}`}>
                      <div>
                        <p className="text-xs font-bold">{p.label}</p>
                        <p className="text-[10px] text-stone-500 font-medium mt-0.5">{p.desc}</p>
                      </div>
                      <span className="text-xs font-bold font-serif bg-white px-3 py-1.5 rounded-xl shadow-xs border border-stone-200/60 text-stone-900">
                        PKR {p.total.toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>

        </div>
      )}

      {/* Purchased Items Section */}
      {purchasedItems.length > 0 && (
        <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#EFEAE4]">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold font-serif text-stone-900 tracking-tight flex items-center gap-2">
                <ShoppingBag className="text-[#9B7036]" size={22} /> Acquired Wedding Essentials
              </h2>
              <p className="text-stone-500 text-xs mt-0.5">Verified products purchased across your completed orders</p>
            </div>
            <span className="text-xs font-bold px-3 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full">
              {purchasedItems.length} items acquired
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[280px] overflow-y-auto pr-1">
            {purchasedItems.slice(0, 9).map((item, i) => (
              <div key={i} className="p-3.5 bg-[#FAF7F2]/60 rounded-2xl border border-[#EFEAE4]">
                <p className="text-xs font-bold text-stone-900 truncate">{item.title}</p>
                <p className="text-[10px] text-stone-500 capitalize">{item.major_category?.replace(/_/g, ' ')}</p>
                <div className="flex justify-between items-center mt-2.5 pt-2 border-t border-stone-200/60">
                  <span className="text-xs font-bold font-serif text-emerald-800">PKR {(item.price || 0).toLocaleString()}</span>
                  <span className="text-[10px] text-stone-400 font-medium">Qty: {item.qty}</span>
                </div>
              </div>
            ))}
          </div>
          {purchasedItems.length > 9 && (
            <p className="text-xs text-stone-400 mt-3 text-center font-medium">+{purchasedItems.length - 9} more purchased items</p>
          )}
        </div>
      )}

      {/* Wishlist + Recently Viewed Dual Section */}
      {(wishlist.length > 0 || recentlyViewed.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Wishlist Grid */}
          {wishlist.length > 0 && (
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#EFEAE4]">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold font-serif text-stone-900 tracking-tight flex items-center gap-2">
                    <Heart className="text-[#800020] fill-[#800020]" size={20} /> Curated Wishlist
                  </h2>
                  <p className="text-stone-500 text-xs mt-0.5">Quick access to your saved bridal selections</p>
                </div>
                <span className="text-xs font-bold px-3 py-1 bg-[#FFF5F8] text-[#800020] border border-[#FBEFF1] rounded-full">
                  {wishlist.length} Saved
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[360px] overflow-y-auto pr-1">
                {wishlist.slice(0, 6).map((item) => (
                  <div
                    key={item.product_id}
                    onClick={() => onViewProduct && onViewProduct(item)}
                    className="group p-4 bg-[#FAF7F2]/50 hover:bg-[#FAF7F2] rounded-2xl border border-[#EFEAE4] hover:border-[#ECD4A8] transition-all duration-300 cursor-pointer flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-[#9B7036] uppercase tracking-wider bg-white px-2 py-0.5 rounded-md border border-[#EADBCC]">
                          {catLabel(item.major_category)}
                        </span>
                        <ArrowUpRight size={14} className="text-[#9B7036] opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <p className="text-xs font-bold text-stone-900 line-clamp-2 leading-snug">{item.title}</p>
                    </div>
                    <div className="flex justify-between items-center mt-4 pt-2.5 border-t border-stone-200/60">
                      <span className="text-[10px] text-stone-400 font-semibold">Price</span>
                      <span className="text-sm font-bold font-serif text-stone-900">PKR {(item.price || 0).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
              
              {wishlist.length > 6 && (
                <p className="text-xs text-stone-400 mt-4 text-center font-medium">+{wishlist.length - 6} more saved items in your catalog</p>
              )}
            </div>
          )}

          {/* Recently Viewed Grid */}
          {recentlyViewed.length > 0 && (
            <div className="bg-white rounded-3xl p-6 md:p-8 shadow-sm border border-[#EFEAE4]">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold font-serif text-stone-900 tracking-tight flex items-center gap-2">
                    <Eye className="text-[#9B7036]" size={20} /> Recently Explored
                  </h2>
                  <p className="text-stone-500 text-xs mt-0.5">Continue where you left off</p>
                </div>
                <span className="text-xs font-bold px-3 py-1 bg-[#FAF7F2] border border-[#EADBCC] text-[#9B7036] rounded-full">
                  History
                </span>
              </div>

              <div className="space-y-3 max-h-[360px] overflow-y-auto pr-1">
                {recentlyViewed.slice(0, 6).map((item) => (
                  <div
                    key={item.product_id}
                    onClick={() => onViewProduct && onViewProduct(item)}
                    className="group flex items-center gap-3.5 p-3.5 bg-[#FAF7F2]/50 hover:bg-[#FAF7F2] rounded-2xl border border-[#EFEAE4] hover:border-[#ECD4A8] transition-all duration-300 cursor-pointer"
                  >
                    <div className="w-11 h-11 bg-white text-[#9B7036] border border-[#EADBCC] rounded-xl flex items-center justify-center shrink-0 shadow-xs">
                      <ShoppingBag size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-stone-900 truncate group-hover:text-[#9B7036] transition-colors">{item.title}</p>
                      <p className="text-[10px] text-stone-400 font-semibold capitalize mt-0.5">{catLabel(item.major_category)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold font-serif text-stone-900">PKR {(item.price || 0).toLocaleString()}</p>
                      <span className="text-[10px] text-[#9B7036] font-bold opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-end gap-0.5 mt-0.5">
                        View <ChevronRight size={11} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
