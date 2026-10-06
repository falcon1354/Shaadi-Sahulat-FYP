/**
 * ReviewList — displays a list of reviews for a product (public view)
 * or for a seller (with admin metadata if requested).
 *
 * Props:
 *   reviews        : array of review objects
 *   emptyMessage   : string shown when there are no reviews
 *   showProduct    : bool — show product title (for seller/admin views)
 *   showAiBadge    : bool — show "AI-generated" / "AI-suggested" badges
 */
import React from 'react';
import StarRating from './StarRating';

function timeAgo(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60)      return 'just now';
  if (diff < 3600)    return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800)  return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ReviewList({
  reviews = [],
  emptyMessage = 'No reviews yet',
  showProduct = false,
  showAiBadge = false,
}) {
  if (!reviews.length) {
    return (
      <div className="text-center py-10 text-gray-400">
        <p className="text-4xl mb-2">💬</p>
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map((r) => (
        <div key={r.review_id || r._id} className={`bg-white border rounded-2xl p-4 ${r.visible === false ? 'border-amber-200 bg-amber-50/30' : 'border-gray-100'}`}>
          {/* Header: name, rating, date */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#a37b3d] to-[#ECD4A8] flex items-center justify-center text-white font-bold text-sm">
                {r.buyer_name?.[0]?.toUpperCase() || 'B'}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-gray-800">{r.buyer_name || 'Anonymous Buyer'}</p>
                  {r.visible === false && (
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      Hidden by admin
                    </span>
                  )}
                  {showAiBadge && r.ai_generated && (
                    <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                      ✨ AI-generated
                    </span>
                  )}
                  {showAiBadge && r.ai_used && !r.ai_generated && (
                    <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      🤖 AI-assisted rating
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <StarRating value={r.rating} size="sm" />
                  <span className="text-xs text-gray-500">{r.rating.toFixed(1)}</span>
                </div>
              </div>
            </div>
            <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(r.created_at)}</span>
          </div>

          {/* Title (short headline) */}
          {r.title && (
            <p className="text-sm font-bold text-gray-800 mb-1">{r.title}</p>
          )}

          {/* Comment body */}
          {r.comment && (
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{r.comment}</p>
          )}

          {/* Review voiceover playback hidden for current evaluation */}

          {/* Footer: product info (seller view), would-recommend */}
          {(showProduct && r.product_id) && (
            <p className="text-[10px] text-gray-400 mt-2">
              Product ID: <span className="font-mono">{r.product_id}</span>
            </p>
          )}
          {r.would_recommend === false && (
            <p className="text-[10px] text-red-500 mt-1">⚠ Buyer would not recommend this product</p>
          )}
          {r.ai_suggested_rating != null && (
            <p className="text-[10px] text-blue-500 mt-1">
              AI suggested: {r.ai_suggested_rating.toFixed(1)} ★ {r.ai_used ? '(accepted)' : ''}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
