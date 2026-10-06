/**
 * ReviewForm — AI-powered review writing.
 * Review voiceover / tone-voice UI is intentionally hidden for the current evaluation.
 */
import React, { useState, useEffect, useRef } from 'react';
import StarRating from './StarRating';
import AIReviewGenerator from './AIReviewGenerator';
import { suggestRating } from '../../api/aiReviewApi';

const TITLE_TAGS = [
  'Fast Delivery', 'Beautiful', 'Great Quality', 'Value for Money',
  'Exactly as Shown', 'Well Packaged', 'On Time', 'Recommended',
  'Comfortable Fit', 'Loved It', 'Needs Improvement', 'Not as Expected',
];

export default function ReviewForm({
  productTitle, productDescription,
  onSubmit, onCancel, submitting = false,
}) {
  const [rating, setRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState([]);
  const [comment, setComment] = useState('');

  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [aiProvider, setAiProvider] = useState('');

  const [generatorOpen, setGeneratorOpen] = useState(false);

  const debounceRef = useRef(null);
  const lastTextRef = useRef('');

  useEffect(() => {
    const text = comment.trim();
    if (!text || text.length < 3 || text === lastTextRef.current) return;
    lastTextRef.current = text;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setAiLoading(true);
      const res = await suggestRating({
        text,
        product_title: productTitle || '',
        product_description: productDescription || '',
      });
      setAiLoading(false);
      if (res?.success) {
        setAiSuggestion(res);
        if (res.provider) setAiProvider(res.provider);
      }
    }, 800);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [comment, productTitle, productDescription]);

  const acceptAiSuggestion = () => {
    if (!aiSuggestion) return;
    setRating(aiSuggestion.suggested_rating);
    setAiUsed(true);
  };

  const toggleTag = (t) => {
    setSelectedTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  };

  const handleGeneratorPick = (text) => {
    setComment(text);
    setAiGenerated(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (rating < 0.5) { alert('Please select a star rating'); return; }
    if (!comment.trim() || comment.trim().length < 2) {
      alert('Please write at least 1-2 words in the comment box');
      return;
    }
    onSubmit?.({
      rating,
      title: selectedTags.join(', '),
      comment: comment.trim(),
      skip_voice: true,
      ai_suggested_rating: aiSuggestion?.suggested_rating ?? null,
      ai_used: aiUsed,
      ai_generated: aiGenerated,
      ai_provider: aiProvider || aiSuggestion?.provider || '',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-base font-bold text-gray-800">Write a Review</h3>
          <p className="text-xs text-gray-500 mt-0.5">Share your experience with this product</p>
        </div>
        <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
          ✨ AI-powered
        </span>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">YOUR RATING *</label>
        <div className="flex items-center gap-3">
          <StarRating value={rating} onChange={(v) => { setRating(v); setAiUsed(false); }} size="lg" allowHalf />
          {rating > 0 && (
            <span className="text-sm font-semibold text-gray-700">{rating.toFixed(1)} / 5</span>
          )}
        </div>

        {(aiLoading || aiSuggestion) && (
          <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-100">
            {aiLoading ? (
              <p className="text-xs text-blue-700 flex items-center gap-2">
                <span className="w-3 h-3 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                AI is analysing your review text…
              </p>
            ) : aiSuggestion && (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-base">🤖</span>
                  <div>
                    <p className="text-xs font-semibold text-blue-800">
                      AI suggests: <span className="text-yellow-600">{aiSuggestion.suggested_rating.toFixed(1)} ★</span>
                    </p>
                    <p className="text-[10px] text-gray-600">{aiSuggestion.sentiment} sentiment</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={acceptAiSuggestion}
                  disabled={aiUsed}
                  className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-all ${
                    aiUsed ? 'bg-green-100 text-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {aiUsed ? `✓ Applied (${aiSuggestion.suggested_rating.toFixed(1)}★)` : 'Apply suggestion'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-2">
          PICK A FEW TAGS (used as review title + fed to AI)
        </label>
        <div className="flex flex-wrap gap-2">
          {TITLE_TAGS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => toggleTag(t)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                selectedTags.includes(t)
                  ? 'bg-[#a37b3d] text-white border-[#a37b3d]'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-[#ECD4A8]'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs font-semibold text-gray-600">YOUR REVIEW *</label>
          <button
            type="button"
            onClick={() => setGeneratorOpen(true)}
            disabled={!rating}
            className="text-[11px] font-bold px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            ✨ AI Generate
          </button>
        </div>
        <textarea
          value={comment}
          onChange={(e) => { setComment(e.target.value); setAiGenerated(false); }}
          rows={4}
          maxLength={500}
          placeholder="Write your honest review here…"
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:border-[#a37b3d] focus:ring-2 focus:ring-[#FBEFF1] outline-none transition-all resize-none"
        />
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-400">{comment.length} / 500</span>
          {aiGenerated && (
            <span className="text-[10px] text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full font-medium">
              ✨ AI-generated (editable)
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting || rating < 0.5}
          className="flex-1 py-3 bg-gradient-to-r from-[#a37b3d] to-[#ECD4A8] text-white rounded-xl text-sm font-bold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Submitting…' : 'Submit Review'}
        </button>
      </div>

      {generatorOpen && (
        <AIReviewGenerator
          productTitle={productTitle}
          productDescription={productDescription}
          rating={rating}
          keywordTags={selectedTags}
          onPick={handleGeneratorPick}
          onClose={() => setGeneratorOpen(false)}
        />
      )}
    </form>
  );
}
