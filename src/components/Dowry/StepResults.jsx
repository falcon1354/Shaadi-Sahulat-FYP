import React, { useState } from 'react';
import { patchDowryBudgets } from '../../api/buyerApi';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Sparkles, TrendingUp, Info, Sliders, ArrowRight, ShieldCheck, PieChart as PieIcon, BarChart2 } from 'lucide-react';
import { isRetiredCategory, newUnallocatedCategories } from '../../lib/dowryDisplay';
import CategoryThumb from './CategoryThumb';

// Luxury harmonious palette
const PALETTE = [
  '#9B7036', '#800020', '#1B6B4D', '#2B4C7E', '#C27D38',
  '#6D214F', '#0B6623', '#8B5A2B', '#5A3E36', '#3D5A80',
];

const formatPKR = (v) => {
  if (v >= 1000000) return `PKR ${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000)    return `PKR ${(v / 1000).toFixed(0)}K`;
  return `PKR ${v}`;
};

const formatPKRFull = (v) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(v);

function getSliderStep(amount) {
  if (amount > 1500000) return 500;
  if (amount > 1000000) return 1000;
  if (amount > 500000)  return 2000;
  return 5000;
}

function getDeviationColor(current, original) {
  if (!original || original === 0) return 'green';
  const pct = Math.abs((current - original) / original) * 100;
  if (pct <= 10) return 'green';
  if (pct <= 30) return 'yellow';
  return 'red';
}

const DEVIATION_STYLES = {
  green:  { bar: 'bg-[#1B6B4D]',  label: 'text-[#1B6B4D]',  badge: 'bg-emerald-50 text-[#1B6B4D] border-emerald-200/60' },
  yellow: { bar: 'bg-[#9B7036]', label: 'text-[#9B7036]', badge: 'bg-[#FAF3E8] text-[#9B7036] border-[#ECD4A8]/60' },
  red:    { bar: 'bg-[#800020]',    label: 'text-[#800020]',    badge: 'bg-rose-50 text-[#800020] border-rose-200/60' },
};

// ── helpers ───────────────────────────────────────────────────────────────────
function readDowry(buyerId) {
  try {
    if (buyerId) return JSON.parse(localStorage.getItem(`ss_dowry_${buyerId}`) || 'null');
    return JSON.parse(localStorage.getItem('ss_dowry_latest') || 'null');
  } catch { return null; }
}

function writeDowry(data, buyerId) {
  const s = JSON.stringify(data);
  localStorage.setItem('ss_dowry_latest', s);
  if (buyerId) localStorage.setItem(`ss_dowry_${buyerId}`, s);
}

// ── StepResults ───────────────────────────────────────────────────────────────
function StepResults({ result, loading, saved, adjustedEstimates, onAdjust, onSave, onReset, priorities, categories = [], buyerId }) {
  const catLabel = (key) => categories.find(c => c.category_id === key)?.label || key.replace(/_/g,' ');
  const catColor = (key) => {
    const idx = categories.findIndex(c => c.category_id === key);
    return PALETTE[(idx >= 0 ? idx : 0) % PALETTE.length];
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-3 border-[#ECD4A8] border-t-[#9B7036] rounded-full animate-spin mb-4" />
        <p className="text-sm font-serif italic text-gray-600">Synthesizing Market Pricing and Solvency Safety Rules...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-sm font-medium">Complete the previous steps to view your estimation results.</p>
      </div>
    );
  }

  const displayBreakdown = {};
  for (const [key, val] of Object.entries(result.category_breakdown || {})) {
    displayBreakdown[key] = adjustedEstimates[key] !== undefined ? adjustedEstimates[key] : val;
  }

  const adjustedTotal = Object.values(displayBreakdown).reduce((a, b) => a + b, 0);

  const originalIds = Array.isArray(result.original_category_ids) && result.original_category_ids.length
    ? result.original_category_ids
    : Object.keys(result.category_breakdown || {}).filter(k => (result.category_breakdown[k] || 0) > 0);

  // Fine-tune rows: live categories vs soft-deleted admin categories
  const fineTuneEntries = Object.entries(result.category_breakdown || {}).filter(([key, originalAmt]) => {
    if (isRetiredCategory(key)) return false;
    if (priorities && priorities[`priority_${key}`] === 'Not_Wanted') return false;
    if (!priorities && originalAmt === 0) return false;
    return true;
  });
  const activeIdSet = new Set(
    (categories || []).filter(c => c.is_active !== false).map(c => c.category_id)
  );
  const liveFineTune = fineTuneEntries.filter(([key]) => activeIdSet.size === 0 || activeIdSet.has(key));
  const deletedFineTune = fineTuneEntries.filter(([key]) => activeIdSet.size > 0 && !activeIdSet.has(key));

  const budgetKeys = Object.keys(result.category_budgets || {});
  for (const key of budgetKeys) {
    if (isRetiredCategory(key)) continue;
    if (activeIdSet.has(key)) continue;
    if (fineTuneEntries.some(([k]) => k === key)) continue;
    const est = result.category_budgets[key]?.estimated ?? displayBreakdown[key] ?? 0;
    if (est > 0 || (Array.isArray(originalIds) && originalIds.includes(key))) {
      deletedFineTune.push([key, est]);
    }
  }

  const sortedEntries = Object.entries(displayBreakdown)
    .filter(([key, v]) => v > 0 && !isRetiredCategory(key) && (priorities ? (priorities[`priority_${key}`] !== null && priorities[`priority_${key}`] !== 'Not_Wanted') : true))
    .filter(([key]) => activeIdSet.size === 0 || activeIdSet.has(key))
    .sort(([, a], [, b]) => b - a);

  const pieData = sortedEntries.map(([key, value]) => ({
    name: catLabel(key), value, key, color: catColor(key),
  }));

  const barData = sortedEntries.map(([key, value]) => ({
    name: catLabel(key), amount: value, color: catColor(key),
  }));

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <span className="text-[11px] font-bold tracking-widest uppercase text-[#9B7036] bg-[#FAF3E8] px-3 py-1 rounded-full border border-[#ECD4A8]/40">
          Phase 04 · Tailored Financial Blueprint
        </span>
        <h2 className="text-2xl sm:text-3xl font-serif font-bold text-gray-900 tracking-tight mt-2 mb-1.5">
          Calculated Wedding Estimation
        </h2>
        <p className="text-sm text-gray-500 font-light leading-relaxed">
          Calibrated using market prices and household safety thresholds. Fine-tune allocations below as needed.
        </p>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-gradient-to-br from-[#1C1814] to-[#362A1F] rounded-2xl p-5 text-white shadow-luxury relative overflow-hidden border border-[#524131]/50">
          <div className="absolute right-0 top-0 translate-x-3 -translate-y-3 w-20 h-20 bg-[#9B7036]/15 rounded-full blur-xl pointer-events-none" />
          <p className="text-[10px] uppercase font-bold tracking-widest text-[#ECD4A8]/80">Total Planned Budget</p>
          <p className="text-2xl font-serif font-bold mt-2 text-white">{formatPKRFull(adjustedTotal)}</p>
          {adjustedTotal !== result.total_recommended_budget && (
            <p className="text-[10px] text-gray-400 mt-1">Base Target: {formatPKR(result.total_recommended_budget)}</p>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 border border-[#EADBCC] shadow-xs">
          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">From Annual Income</p>
          <p className="text-xl font-bold text-gray-900 mt-2">{formatPKR(result.budget_sources?.from_income || 0)}</p>
          <p className="text-[11px] text-[#9B7036] font-bold mt-1.5 bg-[#FAF3E8] px-2 py-0.5 rounded-md inline-block border border-[#ECD4A8]/40">
            {result.budget_sources?.income_percentage || 0}% of budget
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-[#EADBCC] shadow-xs">
          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">From Savings Pool</p>
          <p className="text-xl font-bold text-gray-900 mt-2">{formatPKR(result.budget_sources?.from_savings || 0)}</p>
          <p className="text-[11px] text-[#9B7036] font-bold mt-1.5 bg-[#FAF3E8] px-2 py-0.5 rounded-md inline-block border border-[#ECD4A8]/40">
            {result.budget_sources?.savings_percentage || 0}% of budget
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-[#EADBCC] shadow-xs">
          <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">Solvency Safety Index</p>
          <p className="text-xl font-bold text-gray-900 mt-2">{(result.responsibility_score * 100).toFixed(0)}%</p>
          <p className="text-[11px] text-[#1B6B4D] font-bold mt-1.5 bg-emerald-50 px-2 py-0.5 rounded-md inline-block border border-emerald-200/60">
            Prudent Capital Zone
          </p>
        </div>
      </div>

      {/* Sliders Panel */}
      <div className="border border-[#EADBCC] rounded-2xl p-6 bg-white shadow-xs space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-serif font-bold text-gray-900 flex items-center gap-2">
              <Sliders size={16} className="text-[#9B7036]" /> Interactive Category Sliders
            </h3>
            <p className="text-xs text-gray-500 font-light mt-0.5">Drag to customize individual limits. Allocations remain dynamically balanced.</p>
          </div>
        </div>
        
        <div className="space-y-4">
          {liveFineTune.map(([key, originalAmt]) => {
            const current   = displayBreakdown[key] ?? originalAmt;
            const step      = getSliderStep(originalAmt || current || 1000);
            const maxVal    = Math.max((originalAmt || current) * 2, step * 20);
            const deviation = getDeviationColor(current, originalAmt);
            const styles    = DEVIATION_STYLES[deviation];
            const devPct    = originalAmt > 0
              ? (((current - originalAmt) / originalAmt) * 100).toFixed(0)
              : 0;
            const color = catColor(key);
            const market = result.market_price_stats?.[key];
            const pri = priorities?.[`priority_${key}`] || 'Medium';
            const band = market?.priority_ranges?.[pri];

            return (
              <div key={key} className="p-4 rounded-xl bg-[#FAF7F2] border border-[#EFEAE4] hover:border-[#E8E2D9] transition-all">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CategoryThumb categoryId={key} categories={categories} size={34} />
                    <span className="text-xs font-bold text-gray-900 capitalize truncate">{catLabel(key)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${styles.badge}`}>
                      {devPct > 0 ? `+${devPct}%` : devPct < 0 ? `${devPct}%` : 'Baseline'}
                    </span>
                    <span className={`text-xs font-bold font-mono ${styles.label}`}>
                      {formatPKR(current)}
                    </span>
                  </div>
                </div>
                <input
                  type="range" min={0} max={maxVal} step={step} value={current}
                  onChange={(e) => onAdjust && onAdjust(key, Number(e.target.value))}
                  disabled={!onAdjust}
                  className={`w-full h-1.5 rounded-full appearance-none accent-[#9B7036] ${onAdjust ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
                  style={{
                    background: `linear-gradient(to right, ${color} ${(current / maxVal) * 100}%, #E5E7EB ${(current / maxVal) * 100}%)`,
                  }}
                />
                <div className="flex justify-between text-[10px] text-gray-400 font-medium px-0.5 mt-1">
                  <span>PKR 0</span>
                  <span>Engine Target: {formatPKR(originalAmt)}</span>
                  <span>Max: {formatPKR(maxVal)}</span>
                </div>
                {band && (
                  <p className="text-[10px] text-[#9B7036] font-medium px-0.5 mt-1">
                    Market {pri} Tier: PKR {band.min.toLocaleString()} – {band.max.toLocaleString()}
                    {market?.avg ? ` · Avg PKR ${Number(market.avg).toLocaleString()}` : ''}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {deletedFineTune.length > 0 && (
          <div className="pt-4 border-t border-rose-100 space-y-3">
            <div>
              <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wide">Archived Categories</h4>
              <p className="text-xs text-rose-600/80 font-medium mt-0.5">
                These categories were in your initial blueprint. Reallocate remaining balances via the transfer tool below.
              </p>
            </div>
            {deletedFineTune.map(([key, originalAmt]) => {
              const current = displayBreakdown[key] ?? result.category_budgets?.[key]?.estimated ?? originalAmt ?? 0;
              return (
                <div key={`deleted-${key}`} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-rose-50 border border-rose-200/60">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CategoryThumb categoryId={key} categories={categories} size={32} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-rose-900 capitalize truncate">{catLabel(key)}</p>
                      <p className="text-[10px] text-rose-600 font-semibold">Archived · Available to shift</p>
                    </div>
                  </div>
                  <span className="text-xs font-bold font-mono text-rose-800 shrink-0">{formatPKR(current)}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="pt-4 border-t border-[#EFEAE4] flex items-center justify-between">
          <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Adjusted Blueprint</span>
          <span className="text-xl font-serif font-bold text-gray-900">{formatPKRFull(adjustedTotal)}</span>
        </div>
      </div>

      {/* Visual Analytics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-[#EADBCC] rounded-2xl p-6 bg-white shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <PieIcon size={16} className="text-[#9B7036]" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Portfolio Share</h3>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name"
                cx="50%" cy="50%" outerRadius={80} innerRadius={48} paddingAngle={3}
                label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
              >
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => formatPKRFull(v)} />
              <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 11, fontWeight: '600' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="border border-[#EADBCC] rounded-2xl p-6 bg-white shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 size={16} className="text-[#9B7036]" />
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Category Comparison</h3>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={barData} layout="vertical" margin={{ left: -10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f3f4f6" />
              <XAxis type="number" tickFormatter={formatPKR} tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" width={80} tick={{ fontSize: 10, fontWeight: 'bold' }} />
              <Tooltip formatter={(v) => formatPKRFull(v)} />
              <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                {barData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Community Matches */}
      {result.training_matches?.length > 0 && (
        <CommunityInsights matches={result.training_matches} myBudget={adjustedTotal} />
      )}

      {/* Table breakdown */}
      <div className="border border-[#EADBCC] rounded-2xl overflow-hidden bg-white shadow-xs">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#FAF7F2] border-b border-[#EFEAE4]">
              <th className="text-left px-5 py-3.5 text-gray-600 font-bold uppercase tracking-wider">Category</th>
              <th className="text-right px-5 py-3.5 text-gray-600 font-bold uppercase tracking-wider">Engine Default</th>
              <th className="text-right px-5 py-3.5 text-gray-600 font-bold uppercase tracking-wider">Adjusted Blueprint</th>
              <th className="text-right px-5 py-3.5 text-gray-600 font-bold uppercase tracking-wider">Allocation %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FAF7F2]">
            {Object.entries(result.category_breakdown || {})
              .filter(([key]) => priorities ? (priorities[`priority_${key}`] !== null && priorities[`priority_${key}`] !== 'Not_Wanted') : true)
              .map(([key, sysAmt]) => {
                const adjusted = displayBreakdown[key] ?? sysAmt;
                const pct      = adjustedTotal > 0 ? ((adjusted / adjustedTotal) * 100).toFixed(1) : 0;
                const dev      = getDeviationColor(adjusted, sysAmt);
                const styles   = DEVIATION_STYLES[dev];
                return (
                  <tr key={key} className="hover:bg-[#FAF7F2]/60 transition-colors">
                    <td className="px-5 py-3.5 flex items-center gap-2.5 font-bold text-gray-900 capitalize">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: catColor(key) }} />
                      {catLabel(key)}
                    </td>
                    <td className="text-right px-5 py-3.5 font-mono text-gray-400 font-medium">{formatPKRFull(sysAmt)}</td>
                    <td className={`text-right px-5 py-3.5 font-mono font-bold ${styles.label}`}>{formatPKRFull(adjusted)}</td>
                    <td className="text-right px-5 py-3.5 text-gray-600 font-semibold">{pct}%</td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {buyerId && (
        <BudgetManageSection buyerId={buyerId} categories={categories} />
      )}

      {/* Advisory Notes */}
      {result.notes?.length > 0 && (
        <div className="bg-[#FAF7F2] border border-[#EADBCC] rounded-2xl p-5 space-y-3">
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
            <Info size={14} className="text-[#9B7036]" /> Financial Guidance & Advice
          </h3>
          <ul className="space-y-2">
            {result.notes.map((note, i) => (
              <li key={i} className="text-xs text-gray-600 leading-relaxed flex items-start gap-2 font-medium">
                <span className="text-[#9B7036] mt-0.5 shrink-0">•</span>{note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Community Insights ────────────────────────────────────────────────────────
function incomeBucket(income) {
  if (income <  30000) return "< 30K";
  if (income <  50000) return "30K–50K";
  if (income <  75000) return "50K–75K";
  if (income < 100000) return "75K–100K";
  if (income < 150000) return "100K–150K";
  if (income < 200000) return "150K–200K";
  if (income < 300000) return "200K–300K";
  return "300K+";
}

function CommunityInsights({ matches, myBudget }) {
  return (
    <div className="border border-[#EADBCC] rounded-2xl overflow-hidden bg-white shadow-xs">
      <div className="bg-[#FAF7F2] px-5 py-4 border-b border-[#EFEAE4]">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Sparkles size={15} className="text-[#9B7036]" /> Peer Benchmarks
        </h3>
        <p className="text-xs text-gray-500 mt-0.5 font-light">
          Compare patterns against {matches.length} comparable household wedding profiles in our registry.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#FAF7F2]/50 border-b border-[#EFEAE4]">
              <th className="text-left px-5 py-3 text-gray-600 font-bold uppercase tracking-wider">Income Bracket</th>
              <th className="text-center px-5 py-3 text-gray-600 font-bold uppercase tracking-wider">Family Scale</th>
              <th className="text-right px-5 py-3 text-gray-600 font-bold uppercase tracking-wider">Recommended Budget</th>
              <th className="text-right px-5 py-3 text-gray-600 font-bold uppercase tracking-wider">Variance vs Yours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#FAF7F2]">
            {matches.map((m, i) => {
              const dev      = m.deviation_pct;
              const devColor = Math.abs(dev) <= 10 ? "text-[#1B6B4D] bg-emerald-50 border-emerald-200/60" : Math.abs(dev) <= 25 ? "text-[#9B7036] bg-[#FAF3E8] border-[#ECD4A8]/60" : "text-[#800020] bg-rose-50 border-rose-200/60";
              return (
                <tr key={i} className="hover:bg-[#FAF7F2]/60 transition-colors">
                  <td className="px-5 py-3.5 text-gray-800 font-bold">PKR {incomeBucket(m.income)}/mo</td>
                  <td className="px-5 py-3.5 text-center text-gray-500 font-medium">{m.total_family_members} members</td>
                  <td className="px-5 py-3.5 text-right font-mono text-gray-800 font-bold">{formatPKRFull(m.total_recommended_budget)}</td>
                  <td className="px-5 py-3.5 text-right font-semibold">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full border text-[10px] font-bold ${devColor}`}>
                      {dev > 0 ? `+${dev}%` : dev < 0 ? `${dev}%` : 'Equal'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Budget Manage Section ────────────────────────────────────────────────────
function BudgetManageSection({ buyerId, categories }) {
  const catLabel = (id) => categories.find(c => c.category_id === id)?.label || id.replace(/_/g, ' ');

  const [dowry, setDowry] = useState(() => readDowry(buyerId));
  const [fromCat, setFromCat] = useState('');
  const [toCat, setToCat]   = useState('');
  const [amount, setAmount] = useState('');
  const [msg, setMsg]       = useState({ text: '', error: false });

  const budgets = { ...(dowry?.category_budgets || {}) };
  const originalIds = Array.isArray(dowry?.original_category_ids) ? dowry.original_category_ids : [];
  (categories || []).forEach(c => {
    if (isRetiredCategory(c.category_id)) return;
    if (!(c.category_id in budgets)) {
      if (c.is_active === false) return;
      budgets[c.category_id] = { estimated: 0, spent: 0, remaining: 0, active: true };
    }
  });
  const cats = Object.entries(budgets).filter(
    ([k, v]) => v.active !== false && !isRetiredCategory(k)
  );
  const fromCats = cats.filter(([, v]) => (v.remaining ?? v.estimated ?? 0) > 0);
  const toCats = cats.filter(([k]) => {
    const meta = (categories || []).find(c => c.category_id === k);
    return !meta || meta.is_active !== false;
  });
  const newTargets = newUnallocatedCategories(
    (categories || []).filter(c => c.is_active !== false),
    originalIds,
    budgets
  );

  const fromBudget = fromCat ? budgets[fromCat] : null;
  const maxShift   = fromBudget ? (fromBudget.remaining ?? fromBudget.estimated ?? 0) : 0;

  const handleShift = () => {
    const amt = Number(amount);
    if (!fromCat || !toCat) return setMsg({ text: 'Select both source and target categories.', error: true });
    if (fromCat === toCat)  return setMsg({ text: 'Source and destination categories must differ.', error: true });
    if (!amt || amt <= 0)   return setMsg({ text: 'Enter an amount greater than zero.', error: true });
    if (amt > maxShift)     return setMsg({ text: `Max transferable from ${catLabel(fromCat)}: PKR ${maxShift.toLocaleString()}`, error: true });

    const b = { ...budgets };
    if (!b[toCat]) b[toCat] = { estimated: 0, spent: 0, remaining: 0, active: true };
    const srcEst  = b[fromCat].estimated || 0;
    const srcLeft = b[fromCat].remaining ?? srcEst;
    const dstEst  = b[toCat].estimated  || 0;
    const dstLeft = b[toCat].remaining  ?? dstEst;
    b[fromCat] = { ...b[fromCat], estimated: srcEst - amt, remaining: srcLeft - amt };
    b[toCat]   = { ...b[toCat],  estimated: dstEst + amt, remaining: dstLeft + amt };

    const updated = { ...dowry, category_budgets: b, original_category_ids: originalIds };
    writeDowry(updated, buyerId);
    setDowry(updated);
    patchDowryBudgets(buyerId, b).catch(() => {});
    window.dispatchEvent(new CustomEvent('dowry-updated', { detail: { buyerId } }));
    setMsg({ text: `✓ Successfully shifted PKR ${amt.toLocaleString()} from ${catLabel(fromCat)} to ${catLabel(toCat)}.`, error: false });
    setAmount('');
  };

  if (!dowry || cats.length < 2) return null;

  return (
    <div className="border border-[#EADBCC] rounded-2xl p-6 bg-white shadow-xs space-y-4">
      <div>
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <ArrowRight size={15} className="text-[#9B7036]" /> Inter-Category Capital Rebalancing
        </h3>
        <p className="text-xs text-gray-500 mt-0.5 font-light">
          Transfer surplus funds from one allocated category to another in real-time.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Source (From)</label>
          <select
            value={fromCat}
            onChange={e => { setFromCat(e.target.value); setMsg({ text: '', error: false }); }}
            className="w-full border border-[#E8E2D9] bg-white rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] transition-all">
            <option value="">Select source category…</option>
            {fromCats.filter(([k]) => k !== toCat).map(([k, v]) => {
              const deleted = (categories || []).find(c => c.category_id === k)?.is_active === false;
              return (
                <option key={k} value={k}>
                  {catLabel(k)}{deleted ? ' (archived)' : ''} — PKR {(v.remaining ?? v.estimated ?? 0).toLocaleString()} left
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Target (To)</label>
          <select
            value={toCat}
            onChange={e => { setToCat(e.target.value); setMsg({ text: '', error: false }); }}
            className="w-full border border-[#E8E2D9] bg-white rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] transition-all">
            <option value="">Select target category…</option>
            {toCats.filter(([k]) => k !== fromCat).map(([k, v]) => {
              const isNew = newTargets.some(c => c.category_id === k);
              return (
                <option key={k} value={k}>
                  {catLabel(k)}{isNew ? ' · New Category' : ''} {(v.estimated || 0) > 0 ? `— PKR ${(v.estimated || 0).toLocaleString()}` : ''}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Transfer Amount (PKR)</label>
          <div className="flex gap-2">
            <input
              type="number" value={amount} min="1" max={maxShift || undefined}
              onChange={e => { setAmount(e.target.value); setMsg({ text: '', error: false }); }}
              placeholder="e.g. 25,000"
              className="flex-1 border border-[#E8E2D9] rounded-xl px-4 py-2.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#9B7036]/20 focus:border-[#9B7036] transition-all"
            />
            <button
              onClick={handleShift}
              className="px-5 py-2.5 bg-[#9B7036] hover:bg-[#7E5724] text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer">
              Shift
            </button>
          </div>
        </div>
      </div>

      {fromCat && (
        <p className="text-[11px] text-gray-500 font-medium">
          Available in <span className="font-bold text-gray-900">{catLabel(fromCat)}</span>: PKR {maxShift.toLocaleString()}
        </p>
      )}

      {msg.text && (
        <p className={`text-xs px-4 py-2.5 rounded-xl font-semibold border ${msg.error ? 'bg-rose-50 border-rose-200/60 text-rose-800' : 'bg-emerald-50 border-emerald-200/60 text-[#1B6B4D]'}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

export default StepResults;
