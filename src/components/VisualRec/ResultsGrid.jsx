import React, { useState } from 'react';
import sellerApi from '../../api/sellerApi';

// Compact similarity breakdown shown in a tooltip on hover
function SimilarityTooltip({ item }) {
  const img   = Math.round((item.image_similarity    || 0) * 100);
  const color = Math.round(Math.max(item.color_exact_sim || 0, item.color_family_sim || 0) * 100);
  const text  = Math.round((item.text_similarity     || 0) * 100);

  return (
    <div className="absolute bottom-full right-0 mb-2 z-20 w-52 bg-white rounded-2xl shadow-xl border border-[#EFEAE4] p-3.5 text-xs pointer-events-none space-y-2">
      <p className="font-bold text-stone-800 text-[11px] uppercase tracking-wider">Similarity Match</p>
      {[
        { label: 'Silhouette', pct: img,   color: 'bg-[#9B7036]' },
        { label: 'Color Shade', pct: color, color: 'bg-emerald-700' },
        { label: 'Fabric/Text', pct: text,  color: 'bg-amber-600' },
      ].map(({ label, pct, color: cls }) => (
        <div key={label} className="flex items-center gap-2 text-[11px]">
          <span className="w-16 text-stone-500 shrink-0 font-medium">{label}</span>
          <div className="flex-1 bg-stone-100 rounded-full h-1.5 overflow-hidden">
            <div className={`${cls} h-1.5 rounded-full`} style={{ width: `${pct}%` }} />
          </div>
          <span className="w-8 text-right text-stone-800 font-bold">{pct}%</span>
        </div>
      ))}
      {item.color_name && (
        <p className="pt-2 border-t border-stone-100 text-[11px] text-stone-500">
          Identified Hue: <strong className="text-stone-800 capitalize">{item.color_name}</strong>
          {item.color_hex && (
            <span
              className="ml-1.5 inline-block w-3 h-3 rounded-full border border-stone-300 align-middle"
              style={{ backgroundColor: item.color_hex }}
            />
          )}
        </p>
      )}
    </div>
  );
}

// One result card — matches marketplace ProductCard layout
function ResultCard({ item }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const imageUrl = item.image_url
    ? (item.image_url.startsWith('http') ? item.image_url : `http://localhost:5002${item.image_url}`)
    : null;

  const hasDiscount = item.discount_price && item.discount_price < item.price;
  const matchPct    = item.match_percentage ?? Math.round((item.hybrid_score || 0) * 100);

  return (
    <div className="bg-white rounded-2xl border border-[#EFEAE4] shadow-xs hover:shadow-lg hover:border-[#ECD4A8] transition-all overflow-hidden flex flex-col group">
      {/* Image */}
      <div className="relative aspect-[4/5] bg-[#FAF7F2] overflow-hidden">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={e => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs">No image preview</div>
        )}

        {/* Match % badge — top-left */}
        <span className="absolute top-2.5 left-2.5 bg-stone-900/90 text-[#ECD4A8] text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-[#ECD4A8]/30 backdrop-blur-xs shadow-xs">
          {matchPct}% Match
        </span>

        {/* Sale badge */}
        {hasDiscount && (
          <span className="absolute top-2.5 right-2.5 bg-[#800020] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-xs">
            SALE
          </span>
        )}

        {/* Similarity breakdown icon — bottom-right, hover shows tooltip */}
        <div
          className="absolute bottom-2.5 right-2.5"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <button
            className="w-7 h-7 rounded-full bg-white/90 border border-stone-200 flex items-center justify-center text-[10px] text-stone-700 hover:bg-white hover:border-[#9B7036] transition-all shadow-xs cursor-pointer"
            title="Similarity match breakdown"
          >
            ℹ
          </button>
          {showTooltip && <SimilarityTooltip item={item} />}
        </div>
      </div>

      {/* Info */}
      <div className="p-3.5 flex flex-col flex-1 bg-white">
        <p className="text-[10px] text-[#9B7036] font-bold uppercase tracking-wider mb-1 capitalize">
          {item.category?.replace(/_/g, ' ')}
        </p>
        <p className="text-xs font-bold text-stone-900 line-clamp-2 flex-1 mb-2 leading-snug">
          {item.title || item.product_id}
        </p>

        <div className="flex items-baseline gap-2 mb-2">
          {hasDiscount ? (
            <>
              <span className="text-sm font-bold font-serif text-emerald-800">
                PKR {Number(item.discount_price).toLocaleString()}
              </span>
              <span className="text-[11px] text-stone-400 line-through">
                PKR {Number(item.price).toLocaleString()}
              </span>
            </>
          ) : item.price ? (
            <span className="text-sm font-bold font-serif text-stone-900">
              PKR {Number(item.price).toLocaleString()}
            </span>
          ) : null}
        </div>

        <div className="flex items-center justify-between text-[10px] text-stone-400 pt-2 border-t border-stone-100">
          <span className="font-medium text-stone-600 truncate">{item.seller_name || 'Boutique Collection'}</span>
          {item.city && <span>{item.city}</span>}
        </div>
      </div>
    </div>
  );
}

export default function ResultsGrid({ result }) {
  const { results, validation, search_metadata } = result;

  if (!results || results.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-xs border border-[#EFEAE4] p-10 text-center space-y-2">
        <p className="text-sm font-bold text-stone-800">No close matches found in current catalog</p>
        <p className="text-xs text-stone-500 max-w-sm mx-auto leading-relaxed font-sans">
          Try describing the dress using alternate fabric or color keywords, or upload another angle.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold font-serif text-stone-900">
          Top Matching Bridalwear ({results.length} results)
        </h3>
        <span className="text-xs text-[#9B7036] font-bold">Ranked by Visual Similarity</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {results.map((item, idx) => (
          <ResultCard key={item.product_id || idx} item={item} />
        ))}
      </div>
    </div>
  );
}

