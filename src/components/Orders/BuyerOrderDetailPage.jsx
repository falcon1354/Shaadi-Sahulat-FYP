import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Package, Truck, ShieldCheck, AlertTriangle, CheckCircle, FileText, Upload, Sparkles, Star, Clock } from "lucide-react";
import orderApi from "../../api/orderApi";
import ReviewForm from "../Reviews/ReviewForm";
import NotificationBell from "../Common/NotificationBell";
import SlaCountdown from "../Common/SlaCountdown";
import OrderTimeline from "../Common/OrderTimeline";

export default function BuyerOrderDetailPage({ buyer }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showProblem, setShowProblem] = useState(false);
  const [showReview, setShowReview] = useState(false);
  const [problemForm, setProblemForm] = useState({
    problem_type: "damaged",
    title: "",
    description: "",
  });
  const [problemFiles, setProblemFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await orderApi.getOrder(orderId);
    setData(r.success ? r : null);
    setLoading(false);
  };
  useEffect(() => { load(); }, [orderId]);

  const confirmReceived = async () => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.buyerConfirm({
      buyerId: buyer.buyer_id, orderId,
      confirmation: "RECEIVED",
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    setMsg("Order reception verified successfully.");
    load();
  };

  const confirmNotReceived = async () => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.buyerConfirm({
      buyerId: buyer.buyer_id, orderId,
      confirmation: "NOT_RECEIVED",
      problemType: "not_received",
      title: "Order Not Received",
      description: "Buyer reports the package was not received. Seller has a 48-hour response window.",
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    const disputeId = r.dispute?.dispute_id;
    if (disputeId) navigate(`/disputes/${disputeId}?as=buyer`, { state: { asRole: "buyer" } });
    else load();
  };

  const submitProblem = async () => {
    if (!problemForm.problem_type) {
      setMsg("Please select a problem category.");
      return;
    }
    if (!problemFiles.length) {
      setMsg("Please upload at least 1 image or document as verification evidence.");
      return;
    }
    setSubmitting(true); setMsg("");
    const r = await orderApi.buyerConfirm({
      buyerId: buyer.buyer_id, orderId,
      confirmation: "PROBLEM",
      problemType: problemForm.problem_type,
      title: problemForm.title || "Dispute: Order Issue",
      description: problemForm.description,
      evidence_ok: true,
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    setShowProblem(false);
    const disputeId = r.dispute?.dispute_id;
    if (disputeId && problemFiles.length) {
      const disputeApi = (await import("../../api/disputeApi")).default;
      await disputeApi.uploadEvidence(disputeId, {
        fromId: buyer.buyer_id,
        fromRole: "buyer",
        files: problemFiles,
        description: problemForm.description,
      });
      navigate(`/disputes/${disputeId}?as=buyer`, { state: { asRole: "buyer" } });
      return;
    }
    setMsg(`Dispute initiated successfully: ${disputeId || "ok"}`);
    load();
  };

  const submitReview = async ({
    rating, title, comment,
    ai_suggested_rating, ai_used, ai_generated, ai_provider,
    voice_agent, skip_voice,
  }) => {
    setSubmitting(true); setMsg("");
    const r = await orderApi.submitReview({
      buyerId: buyer.buyer_id, orderId,
      rating, title, comment,
      ai_suggested_rating, ai_used, ai_generated, ai_provider,
      voice_agent,
      skip_voice: !!skip_voice,
    });
    setSubmitting(false);
    if (!r.success) { setMsg(r.error); return; }
    setShowReview(false);
    setMsg('Review submitted successfully. Thank you for your feedback!');
    load();
  };

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-10 h-10 border-3 border-[#ECD4A8] border-t-[#9B7036] rounded-full animate-spin mb-4" />
        <p className="text-sm font-serif italic text-gray-500">Loading order breakdown...</p>
      </div>
    );
  }

  const { order, packages, disputes, sla, dispute_categories, timers } = data;

  const receptionConfirmed = order.buyer_confirmed_receipt || order.status === "COMPLETED" ||
    (order.timeline || []).some(t => t.by === "buyer" && (t.note || "").toLowerCase().includes("confirmed"));
  const alreadyReviewed = (order.timeline || []).some(
    t => t.by === "buyer" && (t.note || "").toLowerCase().includes("submitted") &&
         (t.note || "").toLowerCase().includes("review")
  );
  const openDispute = (disputes || []).find(d => !["RESOLVED", "CANCELLED"].includes(d.status));
  const canConfirm = order.status === "DELIVERED" && !receptionConfirmed && !openDispute;
  const canReview = receptionConfirmed && !alreadyReviewed && order.status !== "DISPUTED";

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

  const categories = (dispute_categories || []).filter(c => c.id !== "not_received");

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Top navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/buyer/orders")}
          className="flex items-center gap-1.5 text-xs font-bold text-[#9B7036] hover:text-[#7E5724] transition-colors cursor-pointer"
        >
          <ArrowLeft size={15} /> Back to My Orders
        </button>
        <NotificationBell userId={buyer?.buyer_id} role="buyer" onNavigate={(path) => navigate(path)} />
      </div>

      {receptionConfirmed && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200/80 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#1B6B4D] text-white flex items-center justify-center shrink-0">
            <CheckCircle size={18} />
          </div>
          <div>
            <p className="text-sm font-bold text-[#1B6B4D]">Package Reception Confirmed</p>
            <p className="text-xs text-emerald-800/80 font-medium">You have confirmed successful delivery of this commission.</p>
          </div>
        </div>
      )}

      {/* Main Order Card */}
      <div className="bg-white rounded-2xl border border-[#EADBCC] p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-[#EFEAE4]">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-[#9B7036] bg-[#FAF3E8] px-2.5 py-0.5 rounded-full border border-[#ECD4A8]/40">
              Commission Reference
            </span>
            <h1 className="text-2xl font-serif font-bold text-gray-900 mt-1.5">{order.order_id}</h1>
          </div>
          <span className={`text-[11px] uppercase font-bold tracking-wider px-3.5 py-1 rounded-full border w-fit ${statusColor(order.status)}`}>
            {order.status.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Order Meta details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#EFEAE4] space-y-1">
            <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Order Date</span>
            <p className="font-semibold text-gray-900">{new Date(order.created_at).toLocaleString()}</p>
          </div>
          <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#EFEAE4] space-y-1">
            <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Payment Method</span>
            <p className="font-semibold text-gray-900">{order.payment_method} ({order.payment_status})</p>
          </div>
          <div className="bg-[#FAF7F2] p-3.5 rounded-xl border border-[#EFEAE4] space-y-1">
            <span className="text-gray-400 font-bold uppercase tracking-wider text-[10px]">Destination</span>
            <p className="font-semibold text-gray-900 truncate">
              {order.shipping_address?.line1 ? `${order.shipping_address.line1}, ${order.shipping_address.city}` : 'Standard Delivery'}
            </p>
          </div>
        </div>

        {/* Financial breakdown */}
        <div className="border-t border-[#EFEAE4] pt-4 space-y-2 text-xs">
          <div className="flex justify-between text-gray-600">
            <span>Item Subtotal</span>
            <span className="font-mono font-medium">PKR {(order.subtotal || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>White-Glove Shipping & Handling</span>
            <span className="font-mono font-medium">PKR {(order.shipping_total || 0).toLocaleString()}</span>
          </div>
          <div className="flex justify-between border-t border-[#EFEAE4] pt-2 text-sm font-bold text-gray-900">
            <span className="font-serif text-base">Total Order Value</span>
            <span className="font-serif text-base font-bold text-[#9B7036]">
              PKR {(order.total_amount || 0).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Items list */}
      <div className="bg-white rounded-2xl border border-[#EADBCC] p-6 shadow-xs space-y-4">
        <h2 className="text-base font-serif font-bold text-gray-900">Order Items ({order.items?.length || 0})</h2>
        <div className="divide-y divide-[#EFEAE4]">
          {order.items.map((it, i) => (
            <div key={i} className="py-3.5 flex items-center justify-between gap-4 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">{it.title}</p>
                <p className="text-xs text-gray-400 font-medium">{it.major_category} · Quantity: {it.qty}</p>
              </div>
              <p className="text-sm font-bold text-gray-900 shrink-0 font-mono">
                PKR {(it.subtotal || 0).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Packages */}
      {order.status !== "PENDING_BNPL_APPROVAL" && packages?.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#EADBCC] p-6 shadow-xs space-y-3">
          <h2 className="text-base font-serif font-bold text-gray-900">Courier Shipments ({packages.length})</h2>
          <div className="space-y-2">
            {packages.map(p => (
              <div key={p.package_id} className="border border-[#EFEAE4] bg-[#FAF7F2] rounded-xl p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-mono font-bold text-gray-900">{p.package_id}</p>
                  {p.tracking_number && (
                    <p className="text-xs text-gray-500 mt-0.5">Tracking Number: <span className="font-mono font-bold text-[#9B7036]">{p.tracking_number}</span></p>
                  )}
                </div>
                <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full border ${statusColor(p.status)}`}>
                  {p.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {order.timeline && order.timeline.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#EADBCC] p-6 shadow-xs">
          <h2 className="text-base font-serif font-bold text-gray-900 mb-4">Fulfillment Timeline</h2>
          <OrderTimeline timeline={order.timeline} />
        </div>
      )}

      {/* Dispute Alert Box */}
      {disputes && disputes.length > 0 && (
        <div className="bg-rose-50 border border-rose-200/80 rounded-2xl p-6 space-y-3">
          <h2 className="text-sm font-bold text-[#800020] uppercase tracking-wider flex items-center gap-1.5">
            <AlertTriangle size={16} /> Active Disputes
          </h2>
          {disputes.map(d => (
            <div key={d.dispute_id} className="bg-white p-4 rounded-xl border border-rose-200/60 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-900 font-mono">{d.dispute_id} — {d.status}</p>
                <p className="text-xs text-gray-600 mt-0.5">{d.dispute_type}: {d.title}</p>
              </div>
              <button
                onClick={() => navigate(`/disputes/${d.dispute_id}?as=buyer`, { state: { asRole: "buyer" } })}
                className="px-3.5 py-1.5 bg-[#800020] text-white rounded-lg text-xs font-bold transition-all shadow-xs"
              >
                Open Case
              </button>
            </div>
          ))}
        </div>
      )}

      {msg && (
        <div className="bg-emerald-50 border border-emerald-200/70 text-[#1B6B4D] rounded-xl p-4 text-xs font-semibold">
          {msg}
        </div>
      )}

      {/* Verification SLA Action Module */}
      {canConfirm && (
        <div className="bg-white rounded-2xl border border-[#EADBCC] p-6 shadow-xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
            <div>
              <h2 className="text-lg font-serif font-bold text-gray-900 mb-1">
                {order.seller_win_confirm_deadline ? "Confirm Order Settlement" : "Delivery Reception Verification"}
              </h2>
              <p className="text-xs text-gray-500 font-light">
                {order.seller_win_confirm_deadline
                  ? "Dispute concluded in seller's favor. Please confirm final reception within 48 hours."
                  : "Please verify whether this bridal commission has reached you in pristine condition."}
              </p>
            </div>
            <SlaCountdown
              deadline={order.seller_win_confirm_deadline || sla?.auto_complete_deadline || order.auto_complete_at}
              label={order.seller_win_confirm_deadline ? "Settlement in 2 days" : `Auto-verifies in ${timers?.auto_complete_days || 7} days`}
              className="min-w-[180px]"
            />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-3">
            <button
              onClick={confirmReceived}
              disabled={submitting}
              className="py-3 px-4 bg-[#1B6B4D] hover:bg-[#14533C] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer text-center"
            >
              ✓ Received in Good Order
            </button>

            {!order.seller_win_confirm_deadline && (
              <>
                <button
                  onClick={confirmNotReceived}
                  disabled={submitting}
                  className="py-3 px-4 bg-[#800020] hover:bg-[#660019] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer text-center"
                >
                  Did Not Receive
                </button>
                <button
                  onClick={() => setShowProblem(true)}
                  disabled={submitting}
                  className="py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer text-center"
                >
                  Report an Issue
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {canReview && (
        <button
          onClick={() => setShowReview(true)}
          className="w-full py-3.5 bg-gradient-to-r from-[#FAF7F2] to-[#FAF3E8] border border-[#ECD4A8] text-[#9B7036] hover:text-[#7E5724] rounded-2xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
        >
          <Star size={16} /> Submit Couture Feedback & Review
        </button>
      )}

      {/* Problem Modal */}
      {showProblem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={() => setShowProblem(false)}>
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-luxury space-y-4 border border-[#EADBCC]" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-serif font-bold text-gray-900">Report an Order Issue</h2>
            <p className="text-xs text-gray-500 font-light">
              Select the nature of the issue and attach evidence photos. The artisan will have 48 hours to resolve.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Issue Category</label>
                <select
                  value={problemForm.problem_type}
                  onChange={e => setProblemForm({ ...problemForm, problem_type: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-[#E8E2D9] rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none"
                >
                  {(categories.length ? categories : [
                    { id: "damaged", label: "Damaged or Defective Fabric" },
                    { id: "wrong", label: "Incorrect Size or Item Sent" },
                    { id: "missing", label: "Missing Accessories or Parts" },
                    { id: "item_not_as_described", label: "Significant Variance from Photos" },
                    { id: "quality_issue", label: "Embroidery / Stitching Quality Issue" },
                    { id: "other", label: "Other Inquiry" },
                  ]).map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Subject</label>
                <input
                  placeholder="Summary of the issue..."
                  value={problemForm.title}
                  onChange={e => setProblemForm({ ...problemForm, title: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-[#E8E2D9] rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Detailed Description</label>
                <textarea
                  placeholder="Provide complete details regarding the defect or discrepancy..."
                  value={problemForm.description}
                  onChange={e => setProblemForm({ ...problemForm, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 border border-[#E8E2D9] rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none resize-none"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Supporting Evidence</label>
                <input
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp,application/pdf,video/mp4"
                  onChange={e => setProblemFiles(Array.from(e.target.files || []).slice(0, 5))}
                  className="w-full text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3.5 file:rounded-xl file:border file:border-[#E8E2D9] file:text-xs file:font-bold file:bg-[#FAF7F2] file:text-[#9B7036] hover:file:bg-[#FAF3E8] cursor-pointer"
                />
                <p className="text-[10px] text-gray-400 mt-1">JPEG/PNG/PDF/MP4 · Max 10MB each</p>
              </div>
            </div>

            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowProblem(false)}
                className="flex-1 py-2.5 border border-[#E8E2D9] rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitProblem}
                disabled={submitting}
                className="flex-1 py-2.5 bg-[#800020] hover:bg-[#660019] text-white rounded-xl text-xs font-bold transition-all shadow-xs"
              >
                {submitting ? "Submitting..." : "Initiate Dispute"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto bg-black/50 backdrop-blur-xs" onClick={() => setShowReview(false)}>
          <div className="bg-white rounded-3xl max-w-lg w-full my-8 shadow-luxury border border-[#EADBCC]" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <ReviewForm
                productTitle={order.items[0]?.title || "your order"}
                productDescription={order.items[0]?.major_category || ""}
                buyerId={buyer?.buyer_id}
                productId={order.items[0]?.product_id}
                onSubmit={submitReview}
                onCancel={() => setShowReview(false)}
                submitting={submitting}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
