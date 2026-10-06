import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { CreditCard, Check, Building2, ShieldCheck, Upload, FileText, CheckCircle2, ArrowRight, ArrowLeft, Clock, Sparkles } from "lucide-react";
import bnplApi from "../../api/bnplApi";
import orderApi from "../../api/orderApi";

function formatCnic(raw) {
  const digits = String(raw || "").replace(/\D/g, "").slice(0, 13);
  let out = digits;
  if (digits.length > 5) out = digits.slice(0, 5) + "-" + digits.slice(5);
  if (digits.length > 12) out = digits.slice(0, 5) + "-" + digits.slice(5, 12) + "-" + digits.slice(12);
  return out;
}

function isFullCnic(s) {
  return /^\d{5}-\d{7}-\d{1}$/.test(String(s || ""));
}

export default function BNPLApplyPage({ buyer }) {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [order, setOrder] = useState(null);
  const [eligibility, setEligibility] = useState(null);
  const [banks, setBanks] = useState([]);
  const [form, setForm] = useState({
    bankId: "",
    iban: "",
    accountTitle: buyer?.name || "",
    planMonths: 3,
    cnicNumber: "",
  });
  const [files, setFiles] = useState({ cnic_front: null, cnic_back: null, utility_bill: null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrHint, setOcrHint] = useState("");

  useEffect(() => {
    if (!buyer?.buyer_id) return;
    orderApi.getOrder(orderId).then(r => { if (r.success) setOrder(r.order); });
    bnplApi.listBanks().then(r => { if (r.success) setBanks(r.banks); });
  }, [buyer, orderId]);

  const checkElig = async () => {
    setError(""); setLoading(true);
    try {
      const r = await bnplApi.checkEligibility(buyer.buyer_id, order.total_amount);
      if (!r.success) throw new Error(r.error);
      setEligibility(r);
      if (r.eligible) setStep(2); else setError(r.reasons.join(" "));
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const reviewAndContinue = () => {
    setError("");

    if (!form.bankId) { setError("Please select a financing partner bank."); return; }

    if (!form.iban || form.iban.replace(/\s/g, "").length < 5) {
      setError("Please enter your bank IBAN number.");
      return;
    }

    if (!form.accountTitle.trim()) { setError("Please specify the exact account title."); return; }

    if (!isFullCnic(form.cnicNumber)) {
      setError("CNIC must match XXXXX-XXXXXXX-X format (13 digits).");
      return;
    }

    const acctCnic = String(buyer?.cnic || "").replace(/[^0-9]/g, "");
    const entered  = form.cnicNumber.replace(/[^0-9]/g, "");
    if (acctCnic && acctCnic !== entered) {
      setError("Entered CNIC does not match your verified profile CNIC.");
      return;
    }

    if (!files.cnic_front || !files.cnic_back || !files.utility_bill) {
      setError("Please upload CNIC front, CNIC back, and utility bill verification documents.");
      return;
    }

    setStep(3);
  };

  const handleDocChange = async (key, file) => {
    setFiles((prev) => ({ ...prev, [key]: file || null }));
    setError("");
    if (key !== "cnic_front" || !file || !buyer?.buyer_id) return;

    setOcrBusy(true);
    setOcrHint("Scanning CNIC text via OCR…");
    try {
      const r = await bnplApi.previewCnicOcr(buyer.buyer_id, file);
      if (r?.found && r.extracted_cnic) {
        setForm((prev) => ({ ...prev, cnicNumber: formatCnic(r.extracted_cnic) }));
        setOcrHint(`CNIC recognized: ${formatCnic(r.extracted_cnic)}`);
      } else {
        setOcrHint("Automatic scan inconclusive — please confirm your CNIC manually below.");
      }
    } catch {
      setOcrHint("Automatic scan inconclusive — please confirm your CNIC manually below.");
    } finally {
      setOcrBusy(false);
    }
  };

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const r = await bnplApi.submitApplication({
        buyerId: buyer.buyer_id,
        orderId,
        bankId: form.bankId,
        iban: form.iban.toUpperCase(),
        accountTitle: form.accountTitle,
        planMonths: parseInt(form.planMonths, 10),
        cnicNumber: form.cnicNumber,
        cnicFront: files.cnic_front,
        cnicBack: files.cnic_back,
        utilityBill: files.utility_bill,
      });
      if (!r.success) throw new Error(r.error || "Submission failed");

      if (r.ocr?.extracted_cnic) {
        const ocr = r.ocr.extracted_cnic.replace(/[^0-9]/g, "");
        const entered = form.cnicNumber.replace(/[^0-9]/g, "");
        if (ocr && entered && ocr !== entered) {
          setError(`CNIC entered (${form.cnicNumber}) does not match uploaded card (${r.ocr.extracted_cnic}).`);
          setLoading(false);
          setStep(2);
          return;
        }
      }
      setResult(r); setStep(4);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  if (!order) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-3 border-[#ECD4A8] border-t-[#9B7036] rounded-full animate-spin mb-4" />
        <p className="text-sm font-serif italic text-gray-500">Loading order verification...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 space-y-6">
      {/* Header */}
      <div>
        <span className="text-[11px] font-bold tracking-widest uppercase text-[#9B7036] bg-[#FAF3E8] px-3 py-1 rounded-full border border-[#ECD4A8]/40">
          Installment Application
        </span>
        <h1 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 tracking-tight mt-2 mb-1">
          Apply for BNPL Financing
        </h1>
        <p className="text-xs text-gray-500 font-light">
          Commission Ref #{orderId} · Value: <strong className="text-gray-900 font-mono">PKR {order.total_amount.toLocaleString()}</strong>
        </p>
      </div>

      {/* Stepper */}
      <div className="grid grid-cols-4 gap-2 border-b border-[#EFEAE4] pb-6">
        {[
          { num: 1, title: 'Eligibility' },
          { num: 2, title: 'Bank Info' },
          { num: 3, title: 'Review' },
          { num: 4, title: 'Completed' },
        ].map((s) => (
          <div key={s.num} className="flex flex-col items-center text-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step >= s.num ? 'bg-[#9B7036] text-white shadow-xs' : 'bg-[#FAF7F2] border border-[#E8E2D9] text-gray-400'
            }`}>
              {step > s.num ? <Check size={14} /> : s.num}
            </div>
            <span className={`text-[10px] font-bold uppercase tracking-wider mt-1.5 ${
              step >= s.num ? 'text-gray-900' : 'text-gray-400'
            }`}>{s.title}</span>
          </div>
        ))}
      </div>

      {step !== 2 && error && (
        <div className="bg-rose-50 border border-rose-200 text-[#800020] rounded-2xl p-4 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Step 1: Pre-check */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-[#EADBCC] p-6 shadow-xs space-y-5">
          <div className="flex items-center gap-2.5 pb-4 border-b border-[#EFEAE4]">
            <div className="w-8 h-8 rounded-xl bg-[#FAF7F2] border border-[#EFEAE4] flex items-center justify-center text-[#9B7036]">
              <ShieldCheck size={18} />
            </div>
            <div>
              <h2 className="text-base font-serif font-bold text-gray-900">Pre-Underwriting Verification</h2>
              <p className="text-xs text-gray-400 font-light">We will check your profile limits and current installment capacity.</p>
            </div>
          </div>

          <div className="space-y-2 text-xs text-gray-600 leading-relaxed bg-[#FAF7F2] p-4 rounded-xl border border-[#EFEAE4]">
            <p className="flex justify-between font-medium">
              <span>Order Subtotal:</span>
              <span className="font-bold text-gray-900 font-mono">PKR {order.total_amount.toLocaleString()}</span>
            </p>
            <p className="flex justify-between font-medium">
              <span>Minimum BNPL Threshold:</span>
              <span className="font-bold text-gray-900 font-mono">PKR 5,000</span>
            </p>
            {order.total_amount < 5000 && (
              <p className="text-emerald-700 font-bold pt-2 border-t border-[#E8E2D9]">
                ✓ Amounts under PKR 5,000 qualify for rapid automated clearance.
              </p>
            )}
          </div>

          <button
            onClick={checkElig}
            disabled={loading}
            className="w-full py-3 bg-[#9B7036] hover:bg-[#7E5724] text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {loading ? "Verifying Financial Solvency..." : "Proceed to Bank Details →"}
          </button>
        </div>
      )}

      {/* Step 2: Banking & Documents */}
      {step === 2 && (
        <div className="bg-white rounded-2xl border border-[#EADBCC] p-6 shadow-xs space-y-5">
          <div className="pb-4 border-b border-[#EFEAE4]">
            <h2 className="text-base font-serif font-bold text-gray-900">Partner Bank & Identification</h2>
            <p className="text-xs text-gray-400 font-light">Provide your banking coordinates and verification documents for underwriter approval.</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">Financing Partner Bank</label>
              <select
                value={form.bankId}
                onChange={e => setForm({ ...form, bankId: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-[#E8E2D9] rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none"
              >
                <option value="">— Choose Underwriting Bank —</option>
                {banks.map(b => <option key={b.bank_id} value={b.bank_id}>{b.name} ({b.code})</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">IBAN Number</label>
              <input
                value={form.iban}
                onChange={e => setForm({ ...form, iban: e.target.value })}
                placeholder="PK36HBL1234567890123456"
                className="w-full px-3.5 py-2.5 border border-[#E8E2D9] rounded-xl text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">Account Title</label>
              <input
                value={form.accountTitle}
                onChange={e => setForm({ ...form, accountTitle: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-[#E8E2D9] rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1.5">Tenure Plan</label>
              <div className="grid grid-cols-2 gap-3">
                {[3, 6].map(m => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm({ ...form, planMonths: m })}
                    className={`py-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      form.planMonths === m
                        ? "border-[#9B7036] bg-[#FAF3E8] text-[#9B7036] shadow-xs"
                        : "border-[#E8E2D9] bg-white text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {m} Equal Monthly Installments
                  </button>
                ))}
              </div>
            </div>

            {/* Document upload grid */}
            <div className="space-y-3 pt-2">
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider">Required Proof of Identity</label>
              {[
                { key: "cnic_front", label: "CNIC Document (Front Side)" },
                { key: "cnic_back", label: "CNIC Document (Back Side)" },
                { key: "utility_bill", label: "Recent Utility Bill (Proof of Residence)" },
              ].map(doc => (
                <div key={doc.key} className="flex flex-col sm:flex-row sm:items-center justify-between border border-[#E8E2D9] bg-[#FAF7F2] rounded-xl p-3 gap-2">
                  <span className="text-xs font-semibold text-gray-800">{doc.label}</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(e) => handleDocChange(doc.key, e.target.files?.[0] || null)}
                    className="text-xs text-gray-500 file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border file:border-[#E8E2D9] file:text-xs file:font-bold file:bg-white file:text-[#9B7036] cursor-pointer"
                  />
                </div>
              ))}
              {(ocrBusy || ocrHint) && (
                <p className={`text-xs ${ocrBusy ? "text-[#9B7036] animate-pulse" : "text-gray-600"}`}>
                  {ocrHint}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-wider mb-1">
                CNIC Number (13 Digits)
              </label>
              <input
                value={form.cnicNumber}
                onChange={e => setForm({ ...form, cnicNumber: formatCnic(e.target.value) })}
                maxLength={15}
                placeholder="35202-1234567-1"
                className="w-full px-3.5 py-2.5 border border-[#E8E2D9] rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none"
              />
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-[#800020] rounded-xl p-3.5 text-xs font-semibold">
              {error}
            </div>
          )}

          <button
            onClick={reviewAndContinue}
            className="w-full py-3 bg-[#9B7036] hover:bg-[#7E5724] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            Review & Continue →
          </button>
        </div>
      )}

      {/* Step 3: Review */}
      {step === 3 && (
        <div className="bg-white rounded-2xl border border-[#EADBCC] p-6 shadow-xs space-y-5">
          <div className="pb-4 border-b border-[#EFEAE4]">
            <h2 className="text-base font-serif font-bold text-gray-900">Step 3: Review & Final Submission</h2>
            <p className="text-xs text-gray-400 font-light">Confirm all coordinates before submitting to underwriting.</p>
          </div>

          <div className="space-y-2.5 text-xs bg-[#FAF7F2] p-4 rounded-xl border border-[#EFEAE4]">
            <div className="flex justify-between"><span className="text-gray-500">Order ID:</span><span className="font-mono font-bold text-gray-900">{orderId}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Principal Amount:</span><span className="font-mono font-bold text-gray-900">PKR {order.total_amount.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Bank Partner:</span><span className="font-bold text-gray-900">{banks.find(b => b.bank_id === form.bankId)?.name}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">IBAN:</span><span className="font-mono font-bold text-gray-900">{form.iban}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">CNIC:</span><span className="font-mono font-bold text-gray-900">{form.cnicNumber}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Selected Tenure:</span><span className="font-bold text-[#9B7036]">{form.planMonths} Months</span></div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-3 border border-[#E8E2D9] rounded-xl text-xs font-bold text-gray-700 hover:bg-[#FAF7F2]"
            >
              ← Back
            </button>
            <button
              onClick={submit}
              disabled={loading}
              className="flex-1 py-3 bg-[#9B7036] hover:bg-[#7E5724] text-white rounded-xl text-xs font-bold transition-all shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {loading ? "Submitting Application..." : "Submit Application"}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Complete */}
      {step === 4 && result && (
        <div className="bg-white rounded-3xl border border-[#EADBCC] p-8 shadow-xs text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center mx-auto text-[#1B6B4D]">
            <CheckCircle2 size={30} />
          </div>
          <h2 className="text-xl font-serif font-bold text-gray-900">Application Lodged Successfully</h2>
          <p className="text-xs text-gray-500 font-light">
            Application Reference #{result.application?.application_no}
          </p>
          <button
            onClick={() => navigate("/buyer/bnpl")}
            className="mt-4 px-6 py-3 bg-[#9B7036] hover:bg-[#7E5724] text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            Go to BNPL Portfolio →
          </button>
        </div>
      )}
    </div>
  );
}
