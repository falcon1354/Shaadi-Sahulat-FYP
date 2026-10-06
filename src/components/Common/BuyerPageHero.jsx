import React from 'react';

/**
 * Shared cream/dark hero banner for buyer portal pages.
 * Keeps editorial layout consistent while letting each page pass its own art.
 */
export default function BuyerPageHero({
  badge,
  title,
  subtitle,
  image,
  imageAlt = '',
  variant = 'cream', // 'cream' | 'dark'
  rightSlot = null,
  className = '',
}) {
  const isDark = variant === 'dark';

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border shadow-sm ${
        isDark
          ? 'bg-gradient-to-tr from-[#1a0a1e] via-[#2d2d44] to-[#3d3455] border-white/10 text-white'
          : 'bg-gradient-to-br from-[#FAF7F2] via-[#FDFBF7] to-[#F5EFEB] border-[#EADBCC]/80 shadow-[0_4px_24px_rgba(163,123,61,0.06)]'
      } ${className}`}
    >
      {image && (
        <>
          <div
            className={`absolute inset-0 bg-cover bg-center pointer-events-none ${
              isDark ? 'opacity-45' : 'opacity-35'
            }`}
            style={{ backgroundImage: `url(${image})` }}
            aria-hidden
          />
          <div
            className={`absolute inset-0 pointer-events-none ${
              isDark
                ? 'bg-gradient-to-r from-[#1a0a1e] via-[#1a0a1e]/85 to-[#1a0a1e]/35'
                : 'bg-gradient-to-r from-[#FAF7F2] via-[#FAF7F2]/92 to-[#FAF7F2]/45'
            }`}
          />
          <img src={image} alt={imageAlt} className="sr-only" />
        </>
      )}

      <div className="relative z-10 p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          {badge && (
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold tracking-wider uppercase border ${
                isDark
                  ? 'bg-white/15 border-white/20 text-slate-200'
                  : 'bg-white/80 border-[#EADBCC] text-[#9B7036]'
              }`}
            >
              {badge}
            </span>
          )}
          <h1
            className={`text-3xl font-serif font-bold tracking-tight ${
              isDark ? 'text-white' : 'text-stone-900'
            }`}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className={`text-sm font-light leading-relaxed max-w-xl ${
                isDark ? 'text-slate-300' : 'text-stone-600'
              }`}
            >
              {subtitle}
            </p>
          )}
        </div>

        {(rightSlot || image) && (
          <div className="shrink-0 flex items-center gap-3">
            {rightSlot}
            {image && (
              <div
                className={`hidden sm:block w-36 h-24 md:w-44 md:h-28 rounded-2xl overflow-hidden border shadow-md ${
                  isDark ? 'border-white/20' : 'border-[#EADBCC]'
                }`}
              >
                <img
                  src={image}
                  alt={imageAlt || title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
