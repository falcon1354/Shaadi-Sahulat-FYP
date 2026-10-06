import React, { useRef, useState } from 'react';
import { UploadCloud, Image as ImageIcon, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

export default function ImageUpload({ onFileSelect, preview, loading }) {
  const inputRef = useRef(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        onFileSelect(file);
      }
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xs border border-[#EFEAE4] p-5">
      <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700 mb-3 flex items-center gap-2">
        <UploadCloud size={16} className="text-[#9B7036]" /> Upload Inspiration Photo
      </h3>

      {!preview ? (
        <div
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
            dragActive
              ? 'border-[#9B7036] bg-[#FAF7F2]'
              : 'border-[#EADBCC] hover:border-[#9B7036] hover:bg-[#FAF7F2]/60 bg-[#FAF7F2]/30'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <div className="w-12 h-12 rounded-2xl bg-white text-[#9B7036] flex items-center justify-center mx-auto mb-3 border border-[#EADBCC] shadow-xs">
            <ImageIcon size={22} />
          </div>
          <p className="text-sm text-stone-800 font-semibold">
            Drag & drop your bridal or groom photo
          </p>
          <p className="text-xs text-stone-400 mt-1">
            or click to browse — JPG, PNG, WebP (up to 5MB)
          </p>
        </div>
      ) : (
        <div className="relative rounded-2xl overflow-hidden border border-[#EADBCC] bg-[#FAF7F2]">
          <img
            src={preview}
            alt="Uploaded dress"
            className={`w-full h-64 object-contain ${
              loading ? 'opacity-50' : ''
            }`}
          />
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-xs">
              <div className="bg-white rounded-2xl p-4 shadow-md border border-[#EADBCC] flex items-center gap-2.5">
                <div className="w-5 h-5 border-2 border-[#ECD4A8] border-t-[#9B7036] rounded-full animate-spin" />
                <span className="text-xs font-bold text-stone-800">Analyzing visual silhouette…</span>
              </div>
            </div>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="absolute bottom-3 right-3 bg-white/95 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-800 font-bold shadow-xs hover:bg-white cursor-pointer"
          >
            Replace Image
          </button>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        className="hidden"
      />

      <div className="mt-4 pt-3 border-t border-stone-100 text-[11px] text-stone-500 space-y-1.5 font-medium">
        <p className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-700 shrink-0" /> Full outfit photos in good lighting yield best accuracy</p>
        <p className="flex items-center gap-1.5"><CheckCircle2 size={13} className="text-emerald-700 shrink-0" /> Clear view of embroidery, silhouette, and primary shade</p>
        <p className="flex items-center gap-1.5 text-stone-400"><AlertCircle size={13} className="text-stone-400 shrink-0" /> Avoid extreme close-ups of fabric swatches or cropped faces</p>
      </div>
    </div>
  );
}
