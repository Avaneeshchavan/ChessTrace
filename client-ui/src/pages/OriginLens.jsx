import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, AlertTriangle, Search, Loader2, ArrowUpRight } from 'lucide-react';
import { GameReplay } from '../components/Board/GameReplay';
import { ScreenshotReview } from '../components/Board/ScreenshotReview';
import { useServiceHealth } from '../hooks/useServiceHealth';

import { API_BASE_URL as API_URL, VISION_ENGINE_URL as VISION_URL } from '../config/api';

export default function OriginLens() {
  const { status: visionHealthStatus } = useServiceHealth(VISION_URL);
  // Pipeline states
  const [phase, setPhase] = useState('idle'); // idle | uploading | review | searching | done | error
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const requestRef = useRef(null);

  // Vision engine response
  const [visionResult, setVisionResult] = useState(null);

  // Search response
  const [searchResult, setSearchResult] = useState(null);
  const [replay, setReplay] = useState(null);

  // Error state
  const [errorMessage, setErrorMessage] = useState('');

  // Preview image
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);
  useEffect(() => () => requestRef.current?.abort(), []);

  // ---- Upload Handler ----
  const processFile = useCallback(async (file) => {
    if (!file) return;

    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    // Show preview
    setPreviewUrl(URL.createObjectURL(file));
    setErrorMessage('');
    setSearchResult(null);
    setReplay(null);
    setVisionResult(null);

    // Step 1: POST image to vision-engine
    setPhase('uploading');
    try {
      const formData = new FormData();
      formData.append('file', file);

      const visionRes = await fetch(`${VISION_URL}/parse-screenshot`, {
        method: 'POST',
        body: formData,
        signal: request.signal,
      });

      if (!visionRes.ok) {
        const errBody = await visionRes.json().catch(() => ({}));
        throw new Error(errBody.detail || `Vision engine returned ${visionRes.status}`);
      }

      const vision = await visionRes.json();
      if (request.signal.aborted) return;
      setVisionResult(vision);
      setPhase('review');
    } catch (err) {
      if (request.signal.aborted) return;
      setPhase('error');
      setErrorMessage(err.message || 'Could not analyze the screenshot.');
    }
  }, []);

  const searchPosition = useCallback(async (fen) => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setErrorMessage('');
    setSearchResult(null);
    setReplay(null);
    setPhase('searching');
    try {
      const searchRes = await fetch(
        `${API_URL}/api/search?fen=${encodeURIComponent(fen)}`,
        { signal: request.signal },
      );

      if (!searchRes.ok) {
        const body = await searchRes.json().catch(() => ({}));
        throw new Error(body.error || `Search API returned ${searchRes.status}`);
      }

      const search = await searchRes.json();
      if (request.signal.aborted) return;
      setSearchResult(search);
      setPhase('done');
    } catch (err) {
      if (request.signal.aborted) return;
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
    e.target.value = ""; // allow re-selecting the same file after a failed upload
    processFile(file);
  }, [processFile]);

  function clearSearch() {
    if (phase === 'searching') requestRef.current?.abort();
    setSearchResult(null);
    setReplay(null);
    setErrorMessage('');
    setPhase('review');
  }

  const uploading = phase === 'uploading';
  const uploadDisabled = visionHealthStatus === 'waking' || visionHealthStatus === 'error';
  const confidence = Math.round((visionResult?.theme_match_confidence ?? 0) * 100);
  const games = new Map();
  for (const match of searchResult?.matches ?? []) {
    const key = match.gameId ?? match.game?.id ?? match.id;
    if (!games.has(key)) games.set(key, match);
  }
  const matches = [...games.values()];

  return (
    <main className="ct-workspace">
      <header className="ct-workspace-header">
        <h1>Origin Lens</h1>
        <p>Find where a position appeared and replay the games that led to it.</p>
      </header>
      <div className="lens-layout">
        <section className="space-y-3 min-w-0" aria-label="Position input">
          {visionHealthStatus === 'waking' && (
            <p role="status" className="ct-panel p-3 text-sm text-accent">The vision service is waking up. Upload will be available shortly.</p>
          )}
          {visionHealthStatus === 'error' && (
            <p role="alert" className="ct-panel p-3 text-sm text-red-700">The vision service is unavailable. <button type="button" className="underline" onClick={() => window.location.reload()}>Retry connection</button></p>
          )}
          <div className="ct-panel lens-upload" data-has-result={!!visionResult}
            onDrop={event => { if (uploadDisabled) event.preventDefault(); else handleDrop(event); }}
            onDragOver={event => { event.preventDefault(); if (!uploadDisabled) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}>
            <button type="button" className="lens-upload-action" data-dragging={dragOver}
              disabled={uploadDisabled} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 size={22} className="text-accent animate-spin" aria-hidden="true" /> : <Upload size={22} className="text-accent" aria-hidden="true" />}
              <span className="font-semibold">{uploading ? 'Reading the board…' : previewUrl ? 'Replace screenshot' : 'Upload a board screenshot'}</span>
              {!visionResult && <span className="text-xs text-slate-500">Drop or choose a PNG, JPEG, or WebP · up to 8 MiB</span>}
            </button>
            <input ref={fileRef} type="file" aria-label="Board screenshot" accept="image/png,image/jpeg,image/webp"
              className="hidden" onChange={handleFileSelect} />
            {previewUrl && !visionResult && (
              <div className="lens-preview">
                <img src={previewUrl} alt="Board screenshot preview" />
                {uploading && <span className="lens-scan" aria-hidden="true" />}
              </div>
            )}
            {uploading && <span className="sr-only" role="status">Analyzing board screenshot.</span>}
          </div>

          {phase === 'error' && (
            <div role="alert" className="ct-panel flex gap-2 p-3 text-sm text-red-700">
              <AlertTriangle size={18} className="shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          {visionResult && (
            <>
              <p className="font-mono text-xs text-slate-500">Template match {confidence}% · {visionResult.orientation === 'black_bottom' ? 'Black' : 'White'} at bottom</p>
              <ScreenshotReview result={visionResult} searching={phase === 'searching'} onSearch={searchPosition} onEdit={clearSearch} />
            </>
          )}
        </section>

        <aside className="ct-panel lens-lineage" aria-label="Matching games">
          <h2>Matching games</h2>
          {phase === 'searching' ? (
            <div role="status" className="space-y-3 pt-4">
              <span className="sr-only">Searching the game database.</span>
              {[0, 1, 2].map(row => <div className="ct-skeleton h-12" key={row} />)}
            </div>
          ) : searchResult ? (
            <>
              <p className="mt-2 font-mono text-xs text-accent">{matches.length} {matches.length === 1 ? 'game' : 'games'} with {searchResult.matchType === 'exact' ? 'this position' : 'similar positions'}</p>
              {!matches.length && <p className="py-6 text-sm text-slate-500">No matching games found. Check the position and side to move.</p>}
              {replay && <div className="my-4"><GameReplay key={replay.id} match={replay} /></div>}
              <ol>
                {matches.map(match => {
                  const game = match.game ?? match;
                  const year = game.playedAt?.slice(0, 4);
                  const record = { id: match.id, gameId: match.gameId ?? game.id, halfMove: match.halfMove,
                    whiteName: game.whiteName, blackName: game.blackName };
                  return (
                    <li key={match.id} className="lens-match">
                      <p className="font-mono text-xs text-slate-500">{[game.event, year, game.result,
                        `Move ${Math.ceil(match.halfMove / 2)}${match.halfMove % 2 ? '.' : '…'}`].filter(Boolean).join(' · ')}</p>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-semibold">{game.whiteName} <span className="text-slate-500">vs.</span> {game.blackName}</h3>
                        {record.gameId && <button type="button" onClick={() => setReplay(record)}
                          className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm text-accent" aria-pressed={replay?.id === match.id}>
                          Replay <ArrowUpRight size={15} aria-hidden="true" />
                        </button>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <div className="py-8 text-slate-500">
              <Search size={21} className="mb-3 text-accent" aria-hidden="true" />
              <p className="text-sm">{visionResult ? 'Review the detected board and search to find matches.' : 'Upload a board screenshot to start tracing a position.'}</p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
