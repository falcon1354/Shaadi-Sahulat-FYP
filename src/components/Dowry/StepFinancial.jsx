import React from 'react';
import { Sparkles, ShieldCheck, DollarSign, Wallet, Gift } from 'lucide-react';

function StepFinancial({ formData, updateForm }) {
  const handleChange = (field) => (e) => {
    updateForm({ [field]: e.target.value });
  };

  return (
    <div className="space-y-7">
      <div>
        <span className="text-[11px] font-bold tracking-widest uppercase text-[#9B7036] bg-[#FAF3E8] px-3 py-1 rounded-full border border-[#ECD4A8]/40">
          Phase 01 · Household Economics
        </span>
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 tracking-tight mt-2 mb-1.5">
          Financial & Savings Profile
        </h2>
        <p className="text-sm text-gray-500 font-light leading-relaxed">
          Specify your household financial capabilities so our recommendation engine can map safe, responsible spending limits.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Monthly Household Income */}
        <div className="bg-[#FAF7F2] p-5 rounded-2xl border border-[#EFEAE4] space-y-2.5">
          <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
            <DollarSign size={13} className="text-[#9B7036]" />
            Monthly Household Income (PKR) <span className="text-rose-500">*</span>
          </label>
          <div className="relative rounded-xl shadow-xs bg-white">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold tracking-wider">PKR</span>
            <input
              type="number"
              value={formData.monthly_household_income}
              onChange={handleChange('monthly_household_income')}
              placeholder="e.g. 150,000"
              min="1"
              className="w-full pl-14 pr-4 py-3.5 border border-[#E8E2D9] rounded-xl focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-300"
            />
          </div>
          <p className="text-[11px] text-gray-400 font-medium">Combined monthly earnings of your immediate household.</p>
        </div>

        {/* Total Savings */}
        <div className="bg-[#FAF7F2] p-5 rounded-2xl border border-[#EFEAE4] space-y-2.5">
          <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
            <Wallet size={13} className="text-[#9B7036]" />
            Total Savings Available (PKR) <span className="text-rose-500">*</span>
          </label>
          <div className="relative rounded-xl shadow-xs bg-white">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold tracking-wider">PKR</span>
            <input
              type="number"
              value={formData.total_savings_available}
              onChange={handleChange('total_savings_available')}
              placeholder="e.g. 600,000"
              min="0"
              className="w-full pl-14 pr-4 py-3.5 border border-[#E8E2D9] rounded-xl focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-300"
            />
          </div>
          <p className="text-[11px] text-gray-400 font-medium">Total liquid capital or savings accumulated for the event.</p>
        </div>

        {/* Expected Contribution */}
        <div className="md:col-span-2 bg-[#FAF7F2] p-5 rounded-2xl border border-[#EFEAE4] space-y-2.5">
          <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
            <Gift size={13} className="text-[#9B7036]" />
            Expected Contribution from Relatives / Parents (PKR)
          </label>
          <div className="relative rounded-xl shadow-xs bg-white">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-xs font-bold tracking-wider">PKR</span>
            <input
              type="number"
              value={formData.expected_contribution}
              onChange={handleChange('expected_contribution')}
              placeholder="Optional — e.g. 200,000"
              min="0"
              className="w-full pl-14 pr-4 py-3.5 border border-[#E8E2D9] rounded-xl focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none transition-all text-sm font-semibold text-gray-900 placeholder:text-gray-300"
            />
          </div>
          <p className="text-[11px] text-gray-400 font-medium">
            Additional financial gifts or family support expected (does not count against household safety caps).
          </p>
        </div>
      </div>

      {/* Safety Limit Box */}
      <div className="bg-gradient-to-br from-[#FAF7F2] to-[#F5ECE0] border border-[#EADBCC] rounded-2xl p-6 relative overflow-hidden">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-[#9B7036]/10 flex items-center justify-center text-[#9B7036]">
            <ShieldCheck size={16} />
          </div>
          <h4 className="text-xs font-bold text-[#4A3B2C] uppercase tracking-wider">
            Safety & Financial Prudence Standards
          </h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-700 font-medium leading-relaxed">
          <div className="bg-white/70 backdrop-blur-xs p-3 rounded-xl border border-[#EFEAE4]">
            <span className="font-bold text-gray-900 block mb-0.5">Income Cap (40%)</span>
            Maximum 40% of cumulative annual earnings allocated to preserve ongoing life quality.
          </div>
          <div className="bg-white/70 backdrop-blur-xs p-3 rounded-xl border border-[#EFEAE4]">
            <span className="font-bold text-gray-900 block mb-0.5">Savings Cap (80%)</span>
            At least 20% of your savings buffer is permanently safeguarded for emergency reserves.
          </div>
        </div>
      </div>
    </div>
  );
}

export default StepFinancial;
