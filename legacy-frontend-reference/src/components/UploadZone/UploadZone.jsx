import { useCallback, useRef, useState } from 'react';

export function UploadZone({ status, error, result, onFile }) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200 flex items-baseline justify-between">
        <span className="font-display text-h2 font-semibold text-slate-900">Read a screenshot</span>
        <span className="font-mono text-eyebrow tracking-[.09em] uppercase text-slate-600">
          vision · phase 2
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`m-4 cursor-pointer border-2 border-dashed p-6 text-center transition-colors rounded-lg ${
          dragOver ? 'border-[#3b82f6] bg-slate-50' : 'border-slate-300 hover:bg-slate-50'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />

        {status === 'idle' && (
          <p className="font-body text-body text-slate-600">
            Drop a chess-board screenshot here, or click to choose one.
          </p>
        )}

        {status === 'loading' && (
          <div aria-live="polite" className="flex flex-col items-center gap-2">
            <div className="ct-scanline w-40 h-10 border border-slate-300 bg-slate-50 relative overflow-hidden rounded-sm">
              <div className="ct-scanline-bar" />
            </div>
            <p className="font-mono text-data text-slate-600">reading squares…</p>
          </div>
        )}

        {status === 'success' && (
          <p className="font-mono text-data text-[#3b82f6]">
            board read — {(result.theme_match_confidence * 100).toFixed(0)}% confidence on{' '}
            {result.theme_used}
          </p>
        )}

        {status === 'error' && (
          <p className="font-mono text-data text-red-500">{error}</p>
        )}
      </div>

      {result && (
        <div className="px-4 pb-4 flex flex-wrap gap-x-4 gap-y-1 font-mono text-eyebrow uppercase tracking-[.09em] text-slate-600">
          <span>theme: {result.theme_used}</span>
          <span>orientation: {result.orientation}</span>
          {result.low_confidence_squares?.length > 0 && (
            <span className="text-red-500">
              {result.low_confidence_squares.length} square(s) need review
            </span>
          )}
        </div>
      )}
    </div>
  );
}
