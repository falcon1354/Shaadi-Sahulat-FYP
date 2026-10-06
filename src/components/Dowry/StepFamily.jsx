import React from 'react';
import { Users, ShieldCheck, Heart, UserCheck, Info } from 'lucide-react';

const PARENT_OPTIONS = [
  {
    value: 'both',
    label: 'Both Parents Alive',
    badge: 'Full Capital Support',
    desc: 'Unconstrained household capital backing for balanced wedding allocations.',
    activeBorder: 'border-[#9B7036] bg-[#FAF3E8]/70 text-[#4A3B2C] ring-1 ring-[#9B7036]',
  },
  {
    value: 'only_father',
    label: 'Father Only',
    badge: 'Standard Buffer',
    desc: 'Mild safety adjustment factored in for single-parent household management.',
    activeBorder: 'border-[#9B7036] bg-[#FAF3E8]/70 text-[#4A3B2C] ring-1 ring-[#9B7036]',
  },
  {
    value: 'only_mother',
    label: 'Mother Only',
    badge: 'Standard Buffer',
    desc: 'Mild safety adjustment factored in for single-parent household management.',
    activeBorder: 'border-[#9B7036] bg-[#FAF3E8]/70 text-[#4A3B2C] ring-1 ring-[#9B7036]',
  },
  {
    value: 'neither',
    label: 'Self-Funded / Neither',
    badge: 'Protective Reserve',
    desc: 'Significant protective safety buffer applied to reserve long-term savings.',
    activeBorder: 'border-[#800020] bg-rose-50/70 text-[#800020] ring-1 ring-[#800020]',
  },
];

function StepFamily({ formData, updateForm }) {
  const {
    parents_alive,
    total_siblings,
    unmarried_siblings,
    married_siblings,
    youngest_sibling_age,
  } = formData;

  const totalNum   = Number(total_siblings    || 0);
  const unmarriedN = Number(unmarried_siblings || 0);
  const marriedN   = Number(married_siblings   || 0);
  const siblingMismatch = totalNum > 0 && (unmarriedN + marriedN) !== totalNum;

  return (
    <div className="space-y-7">
      <div>
        <span className="text-[11px] font-bold tracking-widest uppercase text-[#9B7036] bg-[#FAF3E8] px-3 py-1 rounded-full border border-[#ECD4A8]/40">
          Phase 02 · Family Dynamics
        </span>
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 tracking-tight mt-2 mb-1.5">
          Family & Sibling Context
        </h2>
        <p className="text-sm text-gray-500 font-light leading-relaxed">
          Your family size and marital responsibilities help the engine calibrate emergency reserves and sibling buffers.
        </p>
      </div>

      {/* Parents status check */}
      <div className="bg-[#FAF7F2] border border-[#EFEAE4] rounded-2xl p-6 space-y-4">
        <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
          <Heart size={14} className="text-[#9B7036]" /> Parental Support Status
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PARENT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => updateForm({ parents_alive: opt.value })}
              className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer ${
                parents_alive === opt.value
                  ? opt.activeBorder
                  : 'bg-white border-[#E8E2D9] text-gray-700 hover:border-[#9B7036]/50 hover:bg-[#FAF7F2]/50'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="text-sm font-bold">{opt.label}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-black/5 text-gray-700">
                  {opt.badge}
                </span>
              </div>
              <span className="text-xs text-gray-500 font-normal leading-relaxed mt-1">{opt.desc}</span>
            </button>
          ))}
        </div>
        {parents_alive === 'neither' && (
          <p className="text-xs text-[#800020] bg-rose-50 border border-rose-200/60 rounded-xl px-4 py-3 font-medium">
            Note: An elevated liquid reserve buffer will be maintained to protect your independent household solvency.
          </p>
        )}
      </div>

      {/* Sibling counts */}
      <div className="bg-[#FAF7F2] border border-[#EFEAE4] rounded-2xl p-6 space-y-5">
        <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
          <Users size={14} className="text-[#9B7036]" /> Sibling Responsibility Matrix
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Total Siblings</label>
            <input
              type="number"
              value={total_siblings}
              onChange={(e) => updateForm({ total_siblings: e.target.value })}
              placeholder="e.g. 3"
              min="0"
              className="w-full px-4 py-3 border border-[#E8E2D9] rounded-xl focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none transition-all bg-white text-sm font-semibold text-gray-900"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Unmarried Siblings</label>
            <input
              type="number"
              value={unmarried_siblings}
              onChange={(e) => updateForm({ unmarried_siblings: e.target.value })}
              placeholder="e.g. 2"
              min="0"
              className="w-full px-4 py-3 border border-[#E8E2D9] rounded-xl focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none transition-all bg-white text-sm font-semibold text-gray-900"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wide">Married Siblings</label>
            <input
              type="number"
              value={married_siblings}
              onChange={(e) => updateForm({ married_siblings: e.target.value })}
              placeholder="e.g. 1"
              min="0"
              className="w-full px-4 py-3 border border-[#E8E2D9] rounded-xl focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none transition-all bg-white text-sm font-semibold text-gray-900"
            />
          </div>
        </div>

        {siblingMismatch && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-3 font-medium">
            Attention: Married ({marriedN}) + Unmarried ({unmarriedN}) equals {marriedN + unmarriedN}, but total siblings is currently set to {totalNum}.
          </p>
        )}

        {unmarriedN > 0 && (
          <div className="pt-4 border-t border-[#E8E2D9] space-y-2">
            <label className="block text-xs font-bold text-gray-800 uppercase tracking-wide">
              Age of Youngest Unmarried Sibling
            </label>
            <p className="text-xs text-gray-500 font-light">
              Obligation weight adjustment: Under 18 retains future milestone reserves (-10%), while ages 18–22 adjusts (-5%).
            </p>
            <input
              type="number"
              value={youngest_sibling_age}
              onChange={(e) => updateForm({ youngest_sibling_age: e.target.value })}
              placeholder="e.g. 20"
              min="1"
              max="60"
              className="w-full sm:w-48 px-4 py-3 border border-[#E8E2D9] rounded-xl focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] outline-none transition-all bg-white text-sm font-semibold text-gray-900"
            />
          </div>
        )}
      </div>

      {/* Advisory explanation */}
      <div className="bg-[#FAF7F2] border border-[#EADBCC] rounded-2xl p-5 flex items-start gap-3">
        <div className="w-6 h-6 rounded-md bg-[#9B7036]/10 flex items-center justify-center text-[#9B7036] shrink-0 mt-0.5">
          <Info size={14} />
        </div>
        <p className="text-xs text-gray-600 font-medium leading-relaxed">
          Dependent unmarried siblings require family capital protection so one wedding doesn&apos;t jeopardize subsequent family milestone events.
        </p>
      </div>
    </div>
  );
}

export default StepFamily;
