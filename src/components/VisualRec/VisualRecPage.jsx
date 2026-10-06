import React, { useState, useCallback } from 'react';
import { Shirt, User, AlertCircle, Ban, Search, Camera } from 'lucide-react';
import ImageUpload from './ImageUpload';
import ResultsGrid from './ResultsGrid';
import ServiceStatus from './ServiceStatus';
import BuyerPageHero from '../Common/BuyerPageHero';
import visualApi from '../../api/visualApi';
import visualHeroImg from '../../assets/hero/Buyer_Visual.jpg';

// Real catalog categories — selecting one bypasses weak ImageNet-only classifier confidence.
const HINT_OPTIONS = [
  { id: 'lehenga', label: 'Lehenga', icon: <Shirt size={18} className="text-[#a37b3d]" />, backendCat: 'bridal_lehenga' },
  { id: 'sharara', label: 'Sharara', icon: <User size={18} className="text-[#a37b3d]" />, backendCat: 'bridal_sharara' },
  { id: 'saree',   label: 'Saree',   icon: <Camera size={18} className="text-[#a37b3d]" />, backendCat: 'bridal_saree' },
];

// Error stage → display config
const STAGE_DISPLAY = {
  content_safety:      { icon: <Ban size={24} className="text-red-500" />, title: 'Content Safety Check Failed',    color: 'bg-red-50 border-red-200' },
  category_validation: { icon: <AlertCircle size={24} className="text-yellow-500" />, title: 'Dress Category Not Recognised',  color: 'bg-yellow-50 border-yellow-200' },
  similarity_gate:     { icon: <Search size={24} className="text-orange-500" />, title: 'No Matching Dress Found',         color: 'bg-orange-50 border-orange-200' },
};

function wordCount(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export default function VisualRecPage({ userId, onNavigateToProduct }) {
  const [selectedFile,      setSelectedFile]      = useState(null);
  const [preview,           setPreview]           = useState(null);
  const [hintId,            setHintId]            = useState(null);
  const [userDescription,   setUserDescription]   = useState('');
  const [loading,           setLoading]           = useState(false);
  const [result,            setResult]            = useState(null);
  const [error,             setError]             = useState(null);

  const handleFileSelect = useCallback((file) => {
    setSelectedFile(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError(null);
  }, []);

  const words = wordCount(userDescription);
  const canSearch = selectedFile && words >= 4 && !loading;
  const stageDisplay = error
    ? (STAGE_DISPLAY[error.stage] || {
        icon: <AlertCircle size={24} className="text-red-500" />,
        title: 'Visual Search Unavailable',
        color: 'bg-red-50 border-red-200',
      })
    : null;

  const handleRecommend = async () => {
    if (!canSearch) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const hint = HINT_OPTIONS.find(h => h.id === hintId);
      const preferredCategory = hint?.backendCat || null;

      const response = await visualApi.recommend(
        selectedFile,
        preferredCategory,
        10,
        userId,
        userDescription.trim(),
      );

      if (response.status === 'success') {
        setResult(response);
      } else {
        setError(response);
      }
    } catch (err) {
      const data = err.response?.data;
      const reason =
        (typeof data === 'object' && data && (data.reason || data.error || data.message)) ||
        (typeof data === 'string' && data.includes('Internal Server Error')
          ? 'Visual ML service failed. Start it with: npm run dev:visual (requires PyTorch in visual-ml-service\\.venv).'
          : null) ||
        err.message ||
        'Could not connect. Make sure both services are running.';
      setError({
        status: 'error',
        stage: data?.stage || 'service',
        reason,
        suggestion: data?.suggestion ||
          'Use npm run dev:visual so the Flask service loads with torch, then retry.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
    setHintId(null);
    setUserDescription('');
  };

  return (
    <div className="animate-fade-in space-y-6">
      <BuyerPageHero
        badge={<><Camera size={13} /> Visual Match & Style Finder</>}
        title="Visual Dress & Silhouette Matcher"
        subtitle="Upload an inspiration photo of any bridal or groom attire. Our catalog engine matches visual cuts, embroidery patterns, and color palettes with verified boutique pieces."
        image={visualHeroImg}
        imageAlt="Visual style matching inspiration"
        rightSlot={(
          <span className="px-3 py-1.5 rounded-xl bg-white/80 border border-[#EADBCC] text-stone-700 text-xs font-semibold">
            Multi-Modal Style Engine
          </span>
        )}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left Column ─────────────────────────────────────────── */}
        <div className="lg:col-span-1 space-y-4">

          {/* Image Upload */}
          <ImageUpload onFileSelect={handleFileSelect} preview={preview} loading={loading} />

          {/* Dress Type Hint */}
          <div className="bg-white rounded-2xl shadow-xs border border-[#EFEAE4] p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-2.5">
              Target Style
              <span className="ml-2 text-[10px] font-normal text-stone-400 font-sans">(Optional filter)</span>
            </h3>
            <div className="flex gap-2.5">
              {HINT_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setHintId(hintId === opt.id ? null : opt.id)}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                    hintId === opt.id
                      ? 'bg-[#FAF7F2] border-[#9B7036] text-[#9B7036] shadow-xs'
                      : 'bg-[#FAF7F2]/40 border-stone-200 text-stone-600 hover:border-[#ECD4A8]'
                  }`}
                >
                  <span className="text-sm">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
            {hintId && (
              <button onClick={() => setHintId(null)}
                className="mt-2 text-[11px] text-stone-400 hover:text-stone-700 cursor-pointer">
                Clear filter
              </button>
            )}
          </div>

          {/* Description Box */}
          <div className="bg-white rounded-2xl shadow-xs border border-[#EFEAE4] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 flex items-center gap-1.5">
                Outfit Key Details
                <span className="text-[#800020] text-xs font-bold">*</span>
              </h3>
              <span className="text-[10px] text-stone-400 font-medium">Min 4 words</span>
            </div>
            <p className="text-[11px] text-stone-500 font-sans leading-relaxed">
              Describe the primary color, embroidery technique, or fabric (e.g. "crimson raw silk lehenga with gold dabka and zardozi work").
            </p>
            <textarea
              value={userDescription}
              onChange={(e) => setUserDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleRecommend();
                }
              }}
              placeholder="e.g. royal crimson bridal lehenga handcrafted zardozi embroidery silk choli"
              rows={3}
              className={`w-full border rounded-xl p-3 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#ECD4A8] transition-colors leading-relaxed ${
                words >= 4 ? 'border-emerald-300 bg-emerald-50/20' : 'border-stone-200 bg-[#FAF7F2]/30'
              }`}
            />
            
            {/* Quick Suggested Tags */}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['Zardozi', 'Raw Silk', 'Pastel Lehenga', 'Velvet Sherwani', 'Dabka Work'].map(tag => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setUserDescription(prev => prev ? `${prev} ${tag}` : tag)}
                  className="px-2.5 py-1 rounded-lg bg-[#FAF7F2] hover:bg-[#FAF7F2] border border-[#EADBCC] text-[10px] font-semibold text-stone-700 transition-colors cursor-pointer"
                >
                  +{tag}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px]">
              <span className={words >= 4 ? 'text-emerald-700 font-medium' : 'text-stone-400'}>
                {words < 4 ? `${4 - words} more word${4 - words !== 1 ? 's' : ''} needed` : '✓ Description ready'}
              </span>
              <span className="text-stone-400 font-mono">{words} words</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <button
              onClick={handleRecommend}
              disabled={!canSearch}
              className={`w-full py-3 rounded-xl font-bold text-xs transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer ${
                canSearch
                  ? 'bg-[#9B7036] hover:bg-[#7E5724] text-white shadow-md'
                  : 'bg-stone-200 text-stone-400 cursor-not-allowed'
              }`}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Analyzing visual signatures…
                </span>
              ) : !selectedFile ? 'Select inspiration image'
                : words < 4 ? 'Add at least 4 descriptive words'
                : 'Search Matching Collections'}
            </button>

            <button onClick={handleReset}
              className="w-full py-2 text-xs font-semibold text-stone-500 hover:text-stone-800 transition-colors cursor-pointer">
              Reset search
            </button>
          </div>
        </div>

        {/* ── Right Column ────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">

          {/* Success results */}
          {result?.status === 'success' && (
            <ResultsGrid result={result} onNavigateToProduct={onNavigateToProduct} />
          )}

          {/* Error / rejection display */}
          {error && stageDisplay && (
            <div className={`rounded-2xl p-6 border animate-slide-up ${stageDisplay.color}`}>
              <div className="flex items-start gap-3.5">
                <span className="text-2xl">{stageDisplay.icon}</span>
                <div className="flex-1 space-y-2">
                  <h3 className="font-bold text-stone-900 text-sm">{stageDisplay.title}</h3>
                  <p className="text-stone-600 text-xs leading-relaxed">{error.reason}</p>

                  {error.suggestion && (
                    <p className="text-stone-700 text-xs bg-white/80 rounded-xl p-3 border border-stone-200/60 leading-relaxed font-sans">
                      💡 {error.suggestion}
                    </p>
                  )}

                  {error.stage === 'similarity_gate' && error.best_score !== undefined && (
                    <div className="mt-3 space-y-1">
                      <div className="flex justify-between text-[11px] text-stone-500">
                        <span>Best Match Score</span>
                        <span className="font-bold">{Math.round(error.best_score * 100)}% (threshold {Math.round(error.threshold * 100)}%)</span>
                      </div>
                      <div className="w-full bg-stone-200 rounded-full h-2 overflow-hidden">
                        <div className="bg-amber-600 h-full rounded-full"
                          style={{ width: `${Math.round(error.best_score * 100)}%` }} />
                      </div>
                    </div>
                  )}

                  {error.closest_category && (
                    <p className="text-xs text-stone-600 pt-1">
                      Identified Category: <strong className="text-stone-900 capitalize">{error.closest_category.replace(/_/g, ' ')}</strong>
                      {' '}({(error.detected_confidence * 100).toFixed(1)}% confidence)
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Idle state hint */}
          {!result && !error && !loading && (
            <div className="bg-white rounded-2xl shadow-xs border border-[#EFEAE4] p-12 text-center text-stone-400 space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-[#FAF7F2] text-[#9B7036] border border-[#EADBCC] flex items-center justify-center mx-auto shadow-xs">
                <Camera size={26} />
              </div>
              <h3 className="text-base font-bold font-serif text-stone-800">No Image Uploaded Yet</h3>
              <p className="text-xs text-stone-500 max-w-sm mx-auto font-sans leading-relaxed">
                Upload a bridal dress or groom sherwani photo on the left to begin searching our boutique database.
              </p>
            </div>
          )}

          <ServiceStatus />
        </div>
      </div>
    </div>
  );
}
