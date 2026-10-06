import React, { useState } from 'react';
import { Star, Check, X, ShieldAlert, Sparkles, SlidersHorizontal } from 'lucide-react';
import CategoryThumb from './CategoryThumb';

const PRIORITY_OPTIONS = [
  { value: 'High',       label: 'High',       activeClass: 'bg-[#800020] text-white border-[#800020] shadow-xs' },
  { value: 'Medium',     label: 'Medium',     activeClass: 'bg-[#9B7036] text-white border-[#9B7036] shadow-xs' },
  { value: 'Low',        label: 'Low',        activeClass: 'bg-[#1B6B4D] text-white border-[#1B6B4D] shadow-xs' },
  { value: 'Not_Wanted', label: 'Exclude',    activeClass: 'bg-gray-800 text-white border-gray-800 shadow-xs' },
];

const PRIORITY_BADGE_STYLE = {
  High:       'bg-rose-50 text-[#800020] border-rose-200/60',
  Medium:     'bg-[#FAF3E8] text-[#9B7036] border-[#ECD4A8]/60',
  Low:        'bg-emerald-50 text-[#1B6B4D] border-emerald-200/60',
  Not_Wanted: 'bg-gray-100 text-gray-500 border-gray-200',
};

function StepPriority({ formData, categories, updatePriority, updateRedistribution, updateForm }) {
  const [promptShown, setPromptShown] = useState({});

  const handlePriorityClick = (catKey, value) => {
    updatePriority(catKey, value);
    if (value === 'Not_Wanted') {
      setPromptShown((prev) => ({ ...prev, [catKey]: true }));
    } else {
      setPromptShown((prev) => ({ ...prev, [catKey]: false }));
      updateRedistribution(catKey, undefined);
    }
  };

  const selectedCount = Object.values(formData.priorities).filter(v => v && v !== 'Not_Wanted').length;

  return (
    <div className="space-y-7 animate-fade-in">
      <div>
        <span className="text-[11px] font-bold tracking-widest uppercase text-[#9B7036] bg-[#FAF3E8] px-3 py-1 rounded-full border border-[#ECD4A8]/40">
          Phase 03 · Category Importance
        </span>
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 tracking-tight mt-2 mb-1.5">
          Wedding Category Priorities
        </h2>
        <p className="text-sm text-gray-500 font-light leading-relaxed">
          Set relative importance weights across all bridal categories. The engine will allocate your budget accordingly.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {categories.map((cat) => {
          const currentPriority  = formData.priorities[cat.key] || null;
          const isNotWanted      = currentPriority === 'Not_Wanted';
          const showPrompt       = isNotWanted && promptShown[cat.key];
          const redistribution   = formData.redistributions[cat.key];

          return (
            <div
              key={cat.key}
              className={`border rounded-2xl p-5 transition-all duration-200 relative ${
                isNotWanted
                  ? 'border-[#EFEAE4] bg-[#FAF7F2]/50 opacity-70'
                  : 'border-[#EADBCC] bg-white hover:border-[#9B7036]/50 shadow-xs hover:shadow-card-hover'
              }`}
            >
              <div className="flex items-center justify-between mb-4 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`shrink-0 ${isNotWanted ? 'opacity-40 grayscale' : ''}`}>
                    {cat.category ? (
                      <CategoryThumb category={cat.category} size={46} />
                    ) : cat.iconPng ? (
                      <img src={cat.iconPng} alt={cat.label} className="w-11 h-11 rounded-xl object-cover border border-[#EFEAE4]" />
                    ) : (
                      <span className="w-11 h-11 bg-[#FAF7F2] rounded-xl inline-flex items-center justify-center border border-[#EFEAE4] text-xs font-bold text-[#9B7036]">
                        {cat.label?.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className={`text-sm font-bold block truncate capitalize ${isNotWanted ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {cat.label}
                    </span>
                    <span className="text-[11px] text-gray-400 font-normal">
                      {isNotWanted ? 'Excluded from allocation' : 'Custom weight enabled'}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border shrink-0 ${currentPriority && PRIORITY_BADGE_STYLE[currentPriority] ? PRIORITY_BADGE_STYLE[currentPriority] : 'bg-gray-50 text-gray-400 border-gray-200'}`}>
                  {currentPriority === 'Not_Wanted' ? 'Excluded' : currentPriority || 'Unset'}
                </span>
              </div>

              {cat.hasTypeSelector && !isNotWanted && (
                <div className="flex gap-2 mb-4 bg-[#FAF7F2] p-1 rounded-xl border border-[#EFEAE4]">
                  {['bridal', 'groom'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => updateForm({ wedding_dress_type: type })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all capitalize cursor-pointer ${
                        formData.wedding_dress_type === type
                          ? 'bg-white text-gray-900 shadow-xs border border-[#E8E2D9]'
                          : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      {type === 'bridal' ? 'Bridal Ensemble' : 'Groom Attire'}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-4 gap-1.5">
                {PRIORITY_OPTIONS.map((opt) => {
                  const isSelected = currentPriority === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => handlePriorityClick(cat.key, opt.value)}
                      className={`py-2 rounded-xl text-[11px] font-bold border transition-all cursor-pointer ${
                        isSelected
                          ? opt.activeClass
                          : 'bg-white text-gray-500 border-[#E8E2D9] hover:border-[#9B7036]/40 hover:text-gray-900'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {showPrompt && (
                <div className="mt-4 bg-[#FAF3E8] border border-[#ECD4A8] rounded-xl p-3.5 space-y-2.5 animate-fade-in">
                  <p className="text-xs text-[#4A3B2C] font-semibold">
                    Reallocate this category&apos;s budget share across remaining items?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        updateRedistribution(cat.key, true);
                        setPromptShown((prev) => ({ ...prev, [cat.key]: false }));
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        redistribution === true
                          ? 'bg-[#1B6B4D] text-white border-[#1B6B4D]'
                          : 'bg-white text-[#4A3B2C] border-[#ECD4A8] hover:bg-[#FAF7F2]'
                      }`}
                    >
                      Yes, Rebalance
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        updateRedistribution(cat.key, false);
                        setPromptShown((prev) => ({ ...prev, [cat.key]: false }));
                      }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        redistribution === false
                          ? 'bg-[#800020] text-white border-[#800020]'
                          : 'bg-white text-[#4A3B2C] border-[#ECD4A8] hover:bg-[#FAF7F2]'
                      }`}
                    >
                      No, Save Surplus
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Priority weight matrix banner */}
      <div className="bg-[#FAF7F2] border border-[#EADBCC] rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-[#9B7036]/10 flex items-center justify-center text-[#9B7036]">
            <SlidersHorizontal size={14} />
          </div>
          <h4 className="text-xs font-bold text-[#4A3B2C] uppercase tracking-wider">
            Engine Priority Weights Matrix
          </h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { rate: '30%', name: 'High Priority', color: 'text-[#800020]' },
            { rate: '20%', name: 'Medium Priority', color: 'text-[#9B7036]' },
            { rate: '10%', name: 'Low Priority', color: 'text-[#1B6B4D]' },
            { rate: '0%', name: 'Excluded', color: 'text-gray-400' },
          ].map(w => (
            <div key={w.name} className="bg-white rounded-xl p-3 border border-[#EFEAE4] text-center shadow-xs">
              <div className={`font-serif font-bold text-xl ${w.color}`}>{w.rate}</div>
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-0.5">{w.name}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 font-medium leading-relaxed">
          The engine normalizes weights across your chosen items to guarantee 100% budget adherence.
        </p>
      </div>

      {/* Progress status */}
      <div className={`p-4 rounded-xl border text-center transition-all ${
        selectedCount >= 5
          ? 'bg-emerald-50/70 border-emerald-200/70 text-[#1B6B4D]'
          : 'bg-amber-50/80 border-amber-200/70 text-amber-900'
      }`}>
        <p className="text-xs font-bold">
          Active Categories Selected: {selectedCount} / 5 required minimum
        </p>
        {selectedCount < 5 && (
          <p className="text-[11px] font-medium mt-1 text-amber-700">
            Please assign priorities to at least 5 categories to generate an accurate breakdown.
          </p>
        )}
      </div>
    </div>
  );
}

export default StepPriority;
