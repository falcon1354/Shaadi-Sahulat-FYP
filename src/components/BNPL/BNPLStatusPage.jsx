import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, Calendar, Clock, CheckCircle2, AlertCircle, FileText, ChevronRight, X, ArrowRight, RefreshCw, Wallet, Building2, Sparkles } from "lucide-react";
import bnplApi from "../../api/bnplApi";
import orderApi from "../../api/orderApi";
import { resolveMediaUrl } from "../../lib/openDoc";
import BuyerPageHero from "../Common/BuyerPageHero";
import bnplHeroImg from "../../assets/hero/Buyer_BNPL.jpg";

const APPROVAL_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 5;

const FILTER_TABS = [
  { id: 'all',            label: 'All Financing',   statuses: null },
  { id: 'pending',        label: 'Underwriting',    statuses: ['PENDING_BANK_VERIFICATION', 'PENDING_BNPL_APPROVAL'] },
  { id: 'approved',       label: 'Active & Approved', statuses: ['OFFER_ACCEPTED', 'APPROVED'] },
  { id: 'rejected',       label: 'Declined',        statuses: ['REJECTED'] },
  { id: 'cancelled',      label: 'Archived',        statuses: ['CANCELLED', 'OFFER_DECLINED', 'OFFER_EXPIRED'] },
];

const DELIVERY_LABEL = {
  standard: 'Standard Courier',
  express:  'White-Glove Express',
  same_day: 'Priority 1-Day',
};
const deliveryLabel = (m) => DELIVERY_LABEL[m] || (m ? m.replace(/_/g, ' ') : 'Standard Courier');

function fmtRemaining(ms) {
  if (ms <= 0) return "Expired";
  const d = Math.floor(ms / 86400000);
  const h = Math.floor((ms % 86400000) / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function offerDeadlineMs(app) {
  const anchor = app?.decision_at || app?.updated_at || app?.created_at;
  if (!anchor) return null;
  return new Date(anchor).getTime() + APPROVAL_WINDOW_MS;
}

function countdownColor(remainingMs, totalMs) {
  if (remainingMs <= 0) return { ring: '#800020', text: 'text-[#800020]', bg: 'bg-rose-50 border-rose-200/70' };
  const pct = remainingMs / totalMs;
  if (pct > 0.5) return { ring: '#1B6B4D', text: 'text-[#1B6B4D]', bg: 'bg-emerald-50 border-emerald-200/70' };
  if (pct > 0.15) return { ring: '#9B7036', text: 'text-[#9B7036]', bg: 'bg-[#FAF3E8] border-[#ECD4A8]/70' };
  return { ring: '#800020', text: 'text-[#800020]', bg: 'bg-rose-50 border-rose-200/70' };
}

export default function BNPLStatusPage({ buyer }) {
  const navigate = useNavigate();
  const [apps, setApps] = useState([]);
  const [orders, setOrders] = useState([]);
  const [repayments, setRepayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const load = async () => {
    if (!buyer?.buyer_id) return;
    setLoading(true);
    const [r, repayRes] = await Promise.all([
      bnplApi.listMyApplications(buyer.buyer_id),
      bnplApi.listMyRepayments(buyer.buyer_id).catch(() => ({ success: false })),
    ]);
    setApps(r.success ? r.applications : []);
    setRepayments(repayRes.success ? (repayRes.rows || []) : []);
    orderApi.listBuyerOrders(buyer.buyer_id, { page: 1, limit: 100 }).then(or => {
      setOrders(or.success ? or.orders : []);
    }).catch(() => {});
    setLoading(false);
  };

  useEffect(() => { load(); }, [buyer]);

  const open = async (appNo) => {
    const r = await bnplApi.getApplication(buyer.buyer_id, appNo);
    if (r.success) setSelected(r.application);
  };

  const statusColor = (s) => ({
    PENDING_BNPL_APPROVAL: "bg-[#FAF3E8] text-[#9B7036] border-[#ECD4A8]/70",
    PENDING_BANK_VERIFICATION: "bg-[#FAF3E8] text-[#9B7036] border-[#ECD4A8]/70",
    APPROVED: "bg-blue-50 text-blue-800 border-blue-200/60",
    REJECTED: "bg-rose-50 text-[#800020] border-rose-200/60",
    OFFER_ACCEPTED: "bg-emerald-50 text-[#1B6B4D] border-emerald-200/60",
    OFFER_DECLINED: "bg-gray-100 text-gray-700 border-gray-200",
    OFFER_EXPIRED: "bg-gray-100 text-gray-700 border-gray-200",
    CANCELLED: "bg-rose-50 text-[#800020] border-rose-200/60",
  }[s] || "bg-gray-50 text-gray-700 border-gray-200");

  const ordersByOrderId = useMemo(() => {
    const m = new Map();
    orders.forEach(o => { if (o.order_id) m.set(o.order_id, o); });
    return m;
  }, [orders]);

  const activeTabDef = FILTER_TABS.find(t => t.id === filter) || FILTER_TABS[0];

  const sorted = useMemo(
    () => [...apps]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .filter(a => !activeTabDef.statuses || activeTabDef.statuses.includes(a.status)),
    [apps, activeTabDef]
  );
  const totalCount = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  useEffect(() => { setPage(1); }, [filter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const paged = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const repaySummary = useMemo(() => {
    return repayments.reduce(
      (acc, r) => {
        acc.total += Number(r.total_amount) || 0;
        acc.paid += Number(r.amount_paid) || 0;
        acc.remaining += Number(r.amount_remaining) || 0;
        return acc;
      },
      { total: 0, paid: 0, remaining: 0 }
    );
  }, [repayments]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      <BuyerPageHero
        badge="Installment Solutions"
        title="Bridal Financing & BNPL"
        subtitle="Manage your flexible 3-6 month installment schedules and bank underwriting status."
        image={bnplHeroImg}
        imageAlt="Bridal financing still life"
        rightSlot={(
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-xs font-bold text-[#9B7036] hover:text-[#7E5724] transition-colors cursor-pointer self-start sm:self-auto bg-white/80 border border-[#EADBCC] px-3 py-2 rounded-xl"
          >
            <RefreshCw size={14} /> Refresh Records
          </button>
        )}
      />

      {/* Repayment overview */}
      {repayments.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#EADBCC] shadow-xs p-6 space-y-5">
          <div className="flex items-center justify-between gap-2 flex-wrap pb-3 border-b border-[#EFEAE4]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[#FAF7F2] border border-[#EFEAE4] flex items-center justify-center text-[#9B7036]">
                <Wallet size={16} />
              </div>
              <div>
                <h2 className="text-base font-serif font-bold text-gray-900">Active Repayment Portfolio</h2>
                <p className="text-xs text-gray-400 font-light">{repayments.length} active financing {repayments.length === 1 ? 'facility' : 'facilities'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl bg-[#FAF7F2] border border-[#EFEAE4] p-4">
              <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Total Financed Value</p>
              <p className="text-xl font-serif font-bold text-gray-900 mt-1">PKR {repaySummary.total.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-emerald-50/70 border border-emerald-200/60 p-4">
              <p className="text-[10px] text-emerald-800 uppercase font-bold tracking-wider">Cleared Installments</p>
              <p className="text-xl font-serif font-bold text-[#1B6B4D] mt-1">PKR {repaySummary.paid.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-[#FAF3E8] border border-[#ECD4A8]/70 p-4">
              <p className="text-[10px] text-[#9B7036] uppercase font-bold tracking-wider">Remaining Balance</p>
              <p className="text-xl font-serif font-bold text-[#9B7036] mt-1">PKR {repaySummary.remaining.toLocaleString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            {repayments.map((r) => (
              <div key={r.application_no} className="rounded-xl border border-[#EFEAE4] bg-[#FAF7F2]/60 p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono font-bold text-gray-900">{r.application_no}</p>
                    <p className="text-[11px] text-gray-400">Order Ref: {r.order_id}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                    r.repayment_status === "COMPLETED"
                      ? "bg-emerald-50 text-[#1B6B4D] border-emerald-200"
                      : "bg-[#FAF3E8] text-[#9B7036] border-[#ECD4A8]"
                  }`}>{r.repayment_status}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-gray-400">Monthly Due</p>
                    <p className="font-bold text-gray-900 font-mono">PKR {(r.monthly_installment || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-400">Outstanding</p>
                    <p className="font-bold text-[#9B7036] font-mono">PKR {(r.amount_remaining || 0).toLocaleString()}</p>
                  </div>
                </div>
                {r.next_due_date && r.repayment_status === "ACTIVE" && (
                  <p className="text-xs text-[#2B4C7E] font-medium flex items-center gap-1.5">
                    <Calendar size={13} /> Next installment due: <b>{new Date(r.next_due_date).toLocaleDateString()}</b>
                  </p>
                )}
                <div className="h-1.5 bg-[#E8E2D9] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1B6B4D] rounded-full transition-all duration-500"
                    style={{
                      width: `${r.total_amount > 0 ? Math.min(100, Math.round(((r.amount_paid || 0) / r.total_amount) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-1.5 bg-[#FAF7F2] p-1.5 rounded-2xl border border-[#EFEAE4] w-fit">
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

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-3 border-[#ECD4A8] border-t-[#9B7036] rounded-full animate-spin mb-4" />
          <p className="text-sm font-serif italic text-gray-500">Loading financing applications...</p>
        </div>
      ) : totalCount === 0 ? (
        <div className="bg-white rounded-3xl border border-[#EADBCC] p-16 text-center shadow-xs overflow-hidden relative">
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            <img src={bnplHeroImg} alt="" className="w-full h-full object-cover" />
          </div>
          <div className="relative z-10">
          <div className="w-16 h-16 rounded-2xl bg-[#FAF7F2] border border-[#EFEAE4] flex items-center justify-center mx-auto mb-4 text-[#9B7036]">
            <CreditCard size={28} />
          </div>
          <h3 className="text-base font-serif font-bold text-gray-900 mb-1">No Financing Applications</h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto font-light mb-6">
            {filter === 'all'
              ? 'You do not have any active BNPL installment applications. You can finance any bridal commission over PKR 5,000 at checkout.'
              : `No applications found under the "${filter}" filter.`}
          </p>
          <button
            onClick={() => navigate("/buyer/marketplace")}
            className="px-6 py-2.5 bg-[#9B7036] hover:bg-[#7E5724] text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            Explore Marketplace
          </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {paged.map(app => {
            const dl = app.status === "APPROVED" ? offerDeadlineMs(app) : null;
            const remaining = dl ? dl - now : 0;
            const total = APPROVAL_WINDOW_MS;
            const colors = dl && remaining > 0 ? countdownColor(remaining, total) : null;
            const urgent = remaining > 0 && remaining < 86400000;
            const order = ordersByOrderId.get(app.order_id);
            const productLabel = (order?.items?.[0]?.title || 'Bridal Order') +
              (order?.items && order.items.length > 1 ? ` + ${order.items.length - 1} more` : '');
            const subtotal = order?.subtotal ?? app.amount ?? 0;
            const itemCount = order?.items_count ?? (order?.items?.length || 0);

            return (
              <div
                key={app.application_no}
                className="bg-white rounded-2xl border border-[#EADBCC] p-5 shadow-xs hover:border-[#9B7036]/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-gray-900">{app.application_no}</span>
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full border ${statusColor(app.status)}`}>
                      {app.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 font-light">
                    {new Date(app.created_at).toLocaleDateString()} · {app.plan_months}-Month Financing Plan
                  </p>
                  <p className="text-sm font-bold text-gray-900 truncate">{productLabel}</p>

                  {dl && remaining > 0 && (
                    <div className={`mt-2 p-2.5 rounded-xl border text-xs flex items-center gap-2 ${colors?.bg || ''}`}>
                      <Clock size={14} className={colors?.text} />
                      <span className={`font-semibold ${colors?.text}`}>
                        Decision Window: {fmtRemaining(remaining)} remaining
                      </span>
                    </div>
                  )}
                  {dl && remaining <= 0 && (
                    <p className="text-xs mt-1 text-[#800020] font-medium flex items-center gap-1">
                      <AlertCircle size={13} /> Response window expired — order automatically reverting.
                    </p>
                  )}
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 shrink-0 pt-3 sm:pt-0 border-t sm:border-t-0 border-[#EFEAE4]">
                  <div className="text-left sm:text-right">
                    <p className="text-base font-serif font-bold text-gray-900 font-mono">
                      PKR {Number(subtotal).toLocaleString()}
                    </p>
                    <p className="text-[11px] text-gray-400 font-medium">{itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
                  </div>
                  <button
                    onClick={() => open(app.application_no)}
                    className="px-4 py-2 bg-[#9B7036] hover:bg-[#7E5724] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
                  >
                    View Facility
                  </button>
                </div>
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

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-luxury border border-[#EADBCC] space-y-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-4 border-b border-[#EFEAE4]">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#9B7036]">Financing Facility Details</span>
                <h2 className="text-xl font-serif font-bold text-gray-900 mt-0.5">{selected.application_no}</h2>
              </div>
              <button onClick={() => setSelected(null)} className="w-8 h-8 rounded-full bg-[#FAF7F2] border border-[#EFEAE4] flex items-center justify-center text-gray-400 hover:text-gray-700">
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#EFEAE4]">
                <span className="text-gray-400 uppercase font-bold text-[10px]">Status</span>
                <p className="font-bold text-gray-900 mt-0.5">{selected.status}</p>
              </div>
              <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#EFEAE4]">
                <span className="text-gray-400 uppercase font-bold text-[10px]">Total Amount</span>
                <p className="font-bold text-gray-900 mt-0.5 font-mono">PKR {selected.amount.toLocaleString()}</p>
              </div>
              <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#EFEAE4]">
                <span className="text-gray-400 uppercase font-bold text-[10px]">Tenure</span>
                <p className="font-bold text-gray-900 mt-0.5">{selected.plan_months} Months</p>
              </div>
              <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#EFEAE4]">
                <span className="text-gray-400 uppercase font-bold text-[10px]">IBAN (Masked)</span>
                <p className="font-bold text-gray-900 mt-0.5 font-mono">{selected.iban_masked}</p>
              </div>
              <div className="bg-[#FAF7F2] p-3 rounded-xl border border-[#EFEAE4] sm:col-span-2">
                <span className="text-gray-400 uppercase font-bold text-[10px]">Account Holder</span>
                <p className="font-bold text-gray-900 mt-0.5">{selected.account_title}</p>
              </div>
            </div>

            {selected.offer && (
              <div className="bg-[#FAF3E8] border border-[#ECD4A8] rounded-2xl p-5 space-y-2.5">
                <h3 className="text-xs font-bold text-[#4A3B2C] uppercase tracking-wider">Formal Bank Term Sheet</h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-gray-500">Approved Credit:</span>
                    <p className="font-bold text-gray-900 font-mono">PKR {selected.offer.approved_amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Processing Fee (2%):</span>
                    <p className="font-bold text-gray-900 font-mono">PKR {selected.offer.processing_fee.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Monthly Installment:</span>
                    <p className="font-bold text-[#9B7036] font-mono">PKR {selected.offer.monthly_installment.toLocaleString()}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">Total Payable:</span>
                    <p className="font-bold text-gray-900 font-mono">PKR {selected.offer.total_payable.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            )}

            {selected.documents && selected.documents.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Verified Documents</h3>
                <div className="space-y-1.5">
                  {selected.documents.map(d => (
                    <div key={d._id || d.doc_type} className="text-xs flex items-center justify-between border border-[#EFEAE4] bg-[#FAF7F2] rounded-xl p-3">
                      <span className="font-medium text-gray-700">{d.doc_type} — {d.original_name}</span>
                      <button
                        type="button"
                        className="text-xs font-bold text-[#9B7036] hover:text-[#7E5724] cursor-pointer"
                        onClick={() => {
                          if (d.url) window.open(resolveMediaUrl(d.url), "_blank", "noopener,noreferrer");
                        }}
                      >
                        Preview Document
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
