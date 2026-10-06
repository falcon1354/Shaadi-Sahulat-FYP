import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Truck, CreditCard, Calendar, ChevronRight, ShoppingBag, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import orderApi from "../../api/orderApi";
import bnplApi from "../../api/bnplApi";
import BuyerPageHero from "../Common/BuyerPageHero";
import ordersHeroImg from "../../assets/hero/Buyer_Orders.jpg";

const PAGE_SIZE = 5;

const FILTER_TABS = [
  { id: 'all',       label: 'All Orders',      statuses: null },
  { id: 'delivered', label: 'Delivered',       statuses: ['DELIVERED', 'COMPLETED'] },
  { id: 'confirmed', label: 'In Progress',     statuses: ['CONFIRMED', 'PREPARING', 'SHIPPED'] },
  { id: 'cancelled', label: 'Cancelled',       statuses: ['CANCELLED'] },
];

const DELIVERY_LABEL = {
  standard: 'Standard Courier',
  express:  'White-Glove Express',
  same_day: 'Priority 1-Day',
};
const deliveryLabel = (m) => DELIVERY_LABEL[m] || (m ? m.replace(/_/g, ' ') : 'Standard Courier');

export default function BuyerOrdersPage({ buyer }) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [bnplApps, setBnplApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!buyer?.buyer_id) return;
    orderApi.listBuyerOrders(buyer.buyer_id).then(r => {
      setOrders(r.success ? r.orders : []);
      setLoading(false);
    });
    bnplApi.listMyApplications(buyer.buyer_id).then(r => {
      setBnplApps(r.success ? r.applications : []);
    });
  }, [buyer]);

  const statusColor = (s) => ({
    PENDING_BNPL_APPROVAL: "bg-[#FAF3E8] text-[#9B7036] border-[#ECD4A8]/70",
    CONFIRMED: "bg-blue-50 text-blue-800 border-blue-200/60",
    PREPARING: "bg-purple-50 text-purple-800 border-purple-200/60",
    SHIPPED: "bg-indigo-50 text-indigo-800 border-indigo-200/60",
    DELIVERED: "bg-emerald-50 text-[#1B6B4D] border-emerald-200/60",
    DISPUTED: "bg-rose-50 text-[#800020] border-rose-200/60",
    RESOLVED: "bg-emerald-50 text-[#1B6B4D] border-emerald-200/60",
    CANCELLED: "bg-gray-100 text-gray-600 border-gray-200",
    COMPLETED: "bg-emerald-50 text-[#1B6B4D] border-emerald-200/60",
  }[s] || "bg-gray-50 text-gray-700 border-gray-200");

  const activeTabDef = FILTER_TABS.find(t => t.id === filter) || FILTER_TABS[0];

  const sorted = useMemo(
    () => [...orders]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .filter(o => !activeTabDef.statuses || activeTabDef.statuses.includes(o.status)),
    [orders, activeTabDef]
  );
  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const bnplByOrderId = useMemo(() => {
    const map = new Map();
    for (const a of bnplApps) {
      if (a?.order_id) map.set(a.order_id, a);
    }
    return map;
  }, [bnplApps]);
  const bnplOrderIds = useMemo(() => new Set(bnplByOrderId.keys()), [bnplByOrderId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-3 border-[#ECD4A8] border-t-[#9B7036] rounded-full animate-spin mb-4" />
        <p className="text-sm font-serif italic text-gray-500">Retrieving your order history...</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <BuyerPageHero
        badge="Purchases & Fulfillment"
        title="My Orders & Commissions"
        subtitle="Track package milestones, verify delivery reception, and manage installment financing."
        image={ordersHeroImg}
        imageAlt="Luxury wedding order packages"
        rightSlot={(
          <div className="text-left sm:text-right">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Recorded</p>
            <p className="text-xl font-serif font-bold text-gray-900">{totalCount} {totalCount === 1 ? 'Order' : 'Orders'}</p>
          </div>
        )}
      />

      {/* Filter tabs */}
      <div className="flex gap-1.5 bg-[#FAF7F2] p-1.5 rounded-2xl border border-[#EFEAE4] w-fit">
        {FILTER_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filter === tab.id
                ? 'bg-white text-[#9B7036] shadow-xs border border-[#EADBCC]'
                : 'text-gray-500 hover:text-gray-900 hover:bg-white/40'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {totalCount === 0 ? (
        <div className="bg-white rounded-3xl border border-[#EADBCC] p-16 text-center shadow-xs overflow-hidden relative">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <img src={ordersHeroImg} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-[#FAF7F2] border border-[#EFEAE4] flex items-center justify-center mx-auto mb-4 text-[#9B7036]">
            <ShoppingBag size={28} />
          </div>
          <h3 className="text-base font-serif font-bold text-gray-900 mb-1">No Orders Found</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto font-light mb-6">
            {filter === 'all'
              ? 'You have not placed any orders yet. Discover curated couture pieces and wedding essentials in the marketplace.'
              : `No orders currently matching the "${filter}" filter.`}
          </p>
          <button
            onClick={() => navigate('/buyer/marketplace')}
            className="px-6 py-2.5 bg-[#9B7036] hover:bg-[#7E5724] text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            Explore Marketplace
          </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {paged.map(o => {
            const hasBnpl = bnplOrderIds.has(o.order_id);
            const bnplApp = bnplByOrderId.get(o.order_id);
            const bnplStatus = bnplApp?.status || "";
            const bnplStillPendingBank =
              !bnplStatus ||
              bnplStatus === "PENDING_BANK_VERIFICATION" ||
              bnplStatus === "PENDING_BNPL_APPROVAL";
            const productLabel = (o.items?.[0]?.title || 'Bridal Order') +
              (o.items && o.items.length > 1 ? ` + ${o.items.length - 1} more` : '');

            return (
              <div
                key={o.order_id}
                className="bg-white rounded-2xl border border-[#EADBCC] p-5 hover:border-[#9B7036]/50 shadow-xs hover:shadow-card-hover transition-all duration-200 cursor-pointer group"
                onClick={() => navigate(`/buyer/orders/${o.order_id}`)}
              >
                {/* Header row */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[#EFEAE4]">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-[#FAF7F2] border border-[#EFEAE4] flex items-center justify-center text-[#9B7036]">
                      <Package size={18} />
                    </div>
                    <div>
                      <p className="text-xs font-mono font-bold text-gray-900">{o.order_id}</p>
                      <p className="text-[11px] text-gray-400 font-medium">
                        {new Date(o.created_at).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full border ${statusColor(o.status)}`}>
                      {o.status.replace(/_/g, ' ')}
                    </span>
                    <ChevronRight size={16} className="text-gray-300 group-hover:text-[#9B7036] transition-colors" />
                  </div>
                </div>

                {/* Body details */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-4">
                  <div className="space-y-1.5 min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 group-hover:text-[#9B7036] transition-colors truncate">
                      {productLabel}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 font-light">
                      <span className="flex items-center gap-1">
                        <CreditCard size={13} className="text-gray-400" /> {o.payment_method}
                      </span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Truck size={13} className="text-gray-400" /> {deliveryLabel(o.delivery_method)}
                      </span>
                    </div>
                  </div>

                  <div className="text-left sm:text-right shrink-0 bg-[#FAF7F2] sm:bg-transparent p-3 sm:p-0 rounded-xl">
                    <p className="text-base font-serif font-bold text-gray-900">
                      PKR {(o.total_amount || o.subtotal || 0).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-gray-400 font-medium">
                      {o.items_count || (o.items?.length || 1)} {o.items?.length === 1 ? 'item' : 'items'}
                    </p>
                  </div>
                </div>

                {/* BNPL contextual state alerts */}
                {o.status === "PENDING_BNPL_APPROVAL" && o.payment_method === "BNPL" && !hasBnpl && !o.bnpl_application_id && (
                  <div className="mt-4 pt-3 border-t border-[#EFEAE4] flex items-center justify-between">
                    <span className="text-xs text-amber-800 font-medium">Financing verification needed</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate(`/bnpl/apply/${o.order_id}`); }}
                      className="px-4 py-1.5 bg-[#9B7036] hover:bg-[#7E5724] text-white text-xs font-bold rounded-lg shadow-xs transition-all"
                    >
                      Complete Bank Form →
                    </button>
                  </div>
                )}
                {o.status === "PENDING_BNPL_APPROVAL" && (hasBnpl || o.bnpl_application_id) && bnplStillPendingBank && (
                  <div className="mt-3 pt-3 border-t border-[#EFEAE4] flex items-center gap-2 text-xs text-[#9B7036] font-medium">
                    <Clock size={14} /> Application submitted — awaiting formal bank underwriting review.
                  </div>
                )}
                {o.payment_method === "BNPL" && bnplStatus === "APPROVED" && (
                  <div className="mt-3 pt-3 border-t border-[#EFEAE4] flex items-center gap-2 text-xs text-[#1B6B4D] font-medium">
                    <CheckCircle2 size={14} /> Installment plan approved. Review repayment schedule in My BNPL.
                  </div>
                )}
                {o.payment_method === "BNPL" && bnplStatus === "REJECTED" && (
                  <div className="mt-3 pt-3 border-t border-[#EFEAE4] flex items-center gap-2 text-xs text-[#800020] font-medium">
                    <AlertCircle size={14} /> BNPL application was declined by the underwriting bank.
                  </div>
                )}
              </div>
            );
          })}

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2 pt-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => p - 1)}
                className="px-4 py-2 rounded-xl border border-[#E8E2D9] text-xs font-bold text-gray-700 disabled:opacity-30 hover:bg-[#FAF7F2] transition-colors"
              >
                Previous
              </button>
              <span className="text-xs font-bold text-gray-500 px-3">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
                className="px-4 py-2 rounded-xl border border-[#E8E2D9] text-xs font-bold text-gray-700 disabled:opacity-30 hover:bg-[#FAF7F2] transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
