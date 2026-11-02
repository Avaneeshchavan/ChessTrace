import { useState, useRef, useCallback } from 'react';
import { Upload, AlertTriangle, Search, Loader2 } from 'lucide-react';
import { useServiceHealth } from '../hooks/useServiceHealth';

import { API_BASE_URL as API_URL, VISION_ENGINE_URL as VISION_URL } from '../config/api';

export default function OriginLens() {
  const { status: visionHealthStatus } = useServiceHealth(VISION_URL);
  // Pipeline states
  const [phase, setPhase] = useState('idle'); // idle | uploading | validating | searching | done | error
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  // Vision engine response
  const [visionResult, setVisionResult] = useState(null);

  // Search response
  const [searchResult, setSearchResult] = useState(null);

  // Error state
  const [errorMessage, setErrorMessage] = useState('');

  // Preview image
  const [previewUrl, setPreviewUrl] = useState(null);

  // ---- Upload Handler ----
  const processFile = useCallback(async (file) => {
    if (!file) return;

    // Show preview
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMessage('');
    setSearchResult(null);
    setVisionResult(null);

    // Step 1: POST image to vision-engine
    setPhase('uploading');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const visionRes = await fetch(`${VISION_URL}/parse-screenshot`, {
        method: 'POST',
        body: formData,
      });

      if (!visionRes.ok) {
        const errBody = await visionRes.json().catch(() => ({}));
        throw new Error(errBody.detail || `Vision engine returned ${visionRes.status}`);
      }

      const vision = await visionRes.json();
      setVisionResult(vision);

      // Step 2: Validate FEN
      setPhase('validating');
      if (!vision.fen_valid) {
        setPhase('error');
        setErrorMessage(
          `Invalid FEN detected${vision.fen_validation_error ? `: ${vision.fen_validation_error}` : ''}. ` +
          `${vision.low_confidence_squares?.length || 0} low-confidence square(s) flagged.`
        );
        return;
      }

      // Step 3: Search api-server
      setPhase('searching');
      const searchRes = await fetch(
        `${API_URL}/api/search?fen=${encodeURIComponent(vision.fen)}`
      );

      if (!searchRes.ok) {
        throw new Error(`Search API returned ${searchRes.status}`);
      }

      const search = await searchRes.json();
      setSearchResult(search);
      setPhase('done');
    } catch (err) {
      setPhase('error');
      setErrorMessage(err.message || 'An unexpected error occurred.');
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    processFile(file);
  }, [processFile]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    processFile(file);
  }, [processFile]);

  const isProcessing = ['uploading', 'validating', 'searching'].includes(phase);
  const confidencePct = visionResult
    ? Math.round((visionResult.theme_match_confidence ?? 0) * 100)
    : null;

  return (
    <div className="p-8 flex gap-8 h-full">
      {/* Left: Upload Zone */}
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-md">
          {visionHealthStatus === 'waking' && (
            <div className="bg-slate-50 border border-[#3b759e]/30 rounded-lg p-3 text-sm mb-4 flex items-center gap-3">
              <Loader2 size={16} className="text-[#3b759e] animate-spin shrink-0" />
              <span className="text-slate-700">Waking up the vision engine — this can take up to a minute on first use today. Feel free to wait here.</span>
            </div>
          )}
          {visionHealthStatus === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm mb-4 flex items-center justify-between">
              <span className="text-red-700">The vision engine isn't responding — try again in a moment.</span>
              <button onClick={() => window.location.reload()} className="text-xs bg-white border border-red-200 text-red-700 px-2 py-1 rounded hover:bg-red-50">Retry</button>
            </div>
          )}

          {/* Drop zone */}
          <div
            onClick={() => (visionHealthStatus === 'awake' || visionHealthStatus === 'checking') && fileRef.current?.click()}
            onDrop={(e) => {
              if (visionHealthStatus !== 'awake' && visionHealthStatus !== 'checking') {
                e.preventDefault();
                return;
              }
              handleDrop(e);
            }}
            onDragOver={(e) => { 
              if (visionHealthStatus !== 'awake' && visionHealthStatus !== 'checking') return;
              e.preventDefault(); 
              setDragOver(true); 
            }}
            onDragLeave={() => setDragOver(false)}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-150 group ${
              (visionHealthStatus !== 'awake' && visionHealthStatus !== 'checking')
                ? 'border-slate-200 bg-slate-50 cursor-not-allowed opacity-60'
                : dragOver
                  ? 'border-[#3b759e] bg-[#3b759e]/10 cursor-pointer'
                  : 'border-slate-300 hover:border-[#3b759e]/60 hover:bg-[#3b759e]/5 cursor-pointer'
            }`}
          >
            {isProcessing ? (
              <Loader2 size={48} className="mx-auto mb-4 text-[#3b759e] animate-spin" />
            ) : (
              <Upload size={48} className="mx-auto mb-4 text-slate-400 group-hover:text-[#3b759e] transition-colors duration-150" />
            )}
            <h2 className="text-lg font-semibold tracking-tight text-slate-900 mb-2">
              {isProcessing ? phaseLabel(phase) : 'Upload Screenshot'}
            </h2>
            <p className="text-sm text-slate-500">
              {isProcessing
                ? 'Processing your board image…'
                : 'Drag and drop a chess position screenshot, or click to browse'}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* Preview thumbnail */}
          {previewUrl && (
            <div className="mt-4 rounded-xl overflow-hidden ring-1 ring-slate-900/5 shadow-[0_4px_20px_rgb(0,0,0,0.03)]">
              <img src={previewUrl} alt="Uploaded board" className="w-full object-contain max-h-64" />
            </div>
          )}

          {/* Vision confidence badge */}
          {visionResult && (
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md ${
                confidencePct >= 80
                  ? 'bg-[#3b759e]/10 ring-1 ring-[#3b759e]/30 text-[#3b759e]'
                  : confidencePct >= 50
                    ? 'bg-amber-50 ring-1 ring-amber-200 text-amber-700'
                    : 'bg-red-50 ring-1 ring-red-200 text-red-600'
              }`}>
                Theme confidence: {confidencePct}%
              </span>
              <span className="text-xs text-slate-400">
                Theme: {visionResult.theme_used} · Orientation: {visionResult.orientation}
              </span>
            </div>
          )}

          {/* Error state */}
          {phase === 'error' && (
            <div className="mt-4 p-4 bg-red-50 rounded-xl ring-1 ring-red-200">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700 mb-1">Recognition Failed</p>
                  <p className="text-sm text-red-600">{errorMessage}</p>
                  {visionResult?.low_confidence_squares?.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium uppercase tracking-wider text-red-500 mb-1">Low-confidence squares</p>
                      <div className="flex flex-wrap gap-1">
                        {visionResult.low_confidence_squares.map((sq) => (
                          <span key={sq} className="bg-red-100 text-red-700 text-xs font-mono px-2 py-0.5 rounded">
                            {sq}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Detected FEN display */}
          {visionResult?.fen_valid && (
            <div className="mt-4 bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-1">Detected FEN</p>
              <p className="font-mono text-xs text-slate-700 break-all">{visionResult.fen}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Results Panel */}
      <div className="w-96 bg-white rounded-xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] ring-1 ring-slate-900/5 p-6 flex flex-col">
        <h3 className="text-lg font-semibold tracking-tight text-slate-900 mb-1">Match Lineage</h3>
        {searchResult && (
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400 mb-4">
            {searchResult.matchType === 'exact' ? 'Exact Matches' : 'Similar Patterns'}
            {' · '}{searchResult.matches?.length || 0} result(s)
          </p>
        )}
        {!searchResult && phase !== 'done' && (
          <p className="text-xs text-slate-400 mb-4">Upload a screenshot to find historical matches.</p>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto pb-4">
          {searchResult?.matches?.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Search size={40} className="text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">No matching games found in the database.</p>
            </div>
          )}

          {searchResult?.matches?.map((match, i) => {
            // Exact matches have `game` nested; similarity matches have flat fields
            const game = match.game || match;
            const distance = match.distance;

            // Parse event for tournament/year
            const event = game.event || 'Unknown Event';
            const year = game.playedAt ? new Date(game.playedAt).getFullYear() : null;
            const white = game.whiteName || 'Unknown';
            const black = game.blackName || 'Unknown';
            const result = game.result;
            const halfMove = match.halfMove;

            // Confidence for similar matches: inverse distance (lower = better)
            const simConfidence = distance != null
              ? Math.max(0, Math.round((1 - Math.min(distance, 5) / 5) * 100))
              : null;

            return (
              <div key={match.id ?? i} className={`pb-5 ${i < (searchResult.matches.length - 1) ? 'border-b border-slate-100' : ''}`}>
                <div className="flex gap-4">
                  <div className="w-14 h-14 bg-slate-50 rounded-lg flex items-center justify-center text-xl ring-1 ring-slate-900/5 shrink-0">
                    {['♟', '♞', '♗', '♖', '♕', '♔'][i % 6]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-slate-900 truncate">
                      {white} vs. {black}
                    </div>
                    <div className="text-sm text-slate-500 truncate">
                      {event}{year ? `, ${year}` : ''}
                    </div>
                    {halfMove != null && (
                      <div className="text-xs text-slate-400 mt-0.5">
                        Move {Math.ceil(halfMove / 2)}{halfMove % 2 === 1 ? ' (White)' : ' (Black)'}
                      </div>
                    )}
                    <div className="mt-2 inline-flex items-center gap-2 flex-wrap">
                      {searchResult.matchType === 'exact' ? (
                        <span className="bg-[#3b759e] text-white text-xs font-semibold px-2 py-1 rounded">
                          Exact Match
                        </span>
                      ) : simConfidence != null ? (
                        <span className={`text-white text-xs font-semibold px-2 py-1 rounded ${
                          simConfidence >= 80 ? 'bg-[#3b759e]'
                            : simConfidence >= 50 ? 'bg-amber-700'
                              : 'bg-slate-400'
                        }`}>
                          {simConfidence}% Similar
                        </span>
                      ) : null}
                      {result && (
                        <span className="text-xs text-slate-400">{result}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function phaseLabel(phase) {
  switch (phase) {
    case 'uploading': return 'Analyzing Screenshot…';
    case 'validating': return 'Validating Position…';
    case 'searching': return 'Searching Database…';
    default: return 'Processing…';
  }
}
