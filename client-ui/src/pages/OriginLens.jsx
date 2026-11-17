import { fetchService } from '../config/serviceRequest';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, AlertTriangle, Search, Loader2, ArrowUpRight, Camera } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { GameReplay } from '../components/Board/GameReplay';
import { ScreenshotReview } from '../components/Board/ScreenshotReview';
import ServiceHealthBanner from '../components/ServiceHealthBanner';
import { useServiceHealth } from '../hooks/useServiceHealth';
import { useOnline } from '../hooks/useOnline';
import { takeSharedImage } from '../utils/sharedImage';

import { API_BASE_URL as API_URL, VISION_ENGINE_URL as VISION_URL } from '../config/api';

const sampleFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';

function replayRecord(match) {
  const game = match.game ?? match;
  return { id: match.id, gameId: match.gameId ?? game.id, halfMove: match.halfMove,
    whiteName: game.whiteName, blackName: game.blackName };
}

export default function OriginLens({ sample = false }) {
  const online = useOnline();
  const [sampleRun, setSampleRun] = useState(0);
  const [sampleChecked, setSampleChecked] = useState(false);
  const { status: visionHealthStatus } = useServiceHealth(VISION_URL);
  // Pipeline states
  const [phase, setPhase] = useState('idle'); // idle | uploading | review | searching | done | error
  const [dragOver, setDragOver] = useState(false);
  const [params, setParams] = useSearchParams();
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const requestRef = useRef(null);
  const sharedRequest = useRef(null);

  // Vision engine response
  const [visionResult, setVisionResult] = useState(null);

  // Search response
  const [searchResult, setSearchResult] = useState(null);
  const [replay, setReplay] = useState(null);
  const [visibleMatches, setVisibleMatches] = useState(5);

  // Error state
  const [errorMessage, setErrorMessage] = useState('');

  // Preview image
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);
  useEffect(() => () => requestRef.current?.abort(), []);

  // ---- Upload Handler ----
  const processFile = useCallback(async (file, expectedFen) => {
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

      const visionRes = await fetchService(VISION_URL, `/parse-screenshot`, {
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
      if (expectedFen && vision.fen.split(' ')[0] === expectedFen.split(' ')[0]) vision.fen = expectedFen;
      setVisionResult(vision);
      setPhase('review');
      return vision;
    } catch (err) {
      if (request.signal.aborted) return;
      setPhase('error');
      setErrorMessage(err.message || 'Could not analyze the screenshot.');
    }
  }, []);

  useEffect(() => {
    const id = params.get('share');
    if (!id) return;
    if (sharedRequest.current?.id !== id) sharedRequest.current = { id, file: takeSharedImage(id) };
    let active = true;
    sharedRequest.current.file.then(file => {
      if (!active) return;
      const next = new URLSearchParams(params);
      next.delete('share');
      setParams(next, { replace: true });
      if (file) processFile(file);
      else {
        setErrorMessage('This shared image is unavailable. Choose a PNG, JPEG, or WebP screenshot up to 8 MiB.');
        setPhase('error');
      }
    });
    return () => { active = false; };
  }, [params, setParams, processFile]);

  const searchPosition = useCallback(async (fen, replayFirst = false) => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setErrorMessage('');
    setSearchResult(null);
    setReplay(null);
    setPhase('searching');
    try {
      const searchRes = await fetchService(API_URL, `/api/search?fen=${encodeURIComponent(fen)}&includeCorpusCount=1`,
        { signal: request.signal },
      );

      if (!searchRes.ok) {
        const body = await searchRes.json().catch(() => ({}));
        throw new Error(body.error || `Search API returned ${searchRes.status}`);
      }

      const search = await searchRes.json();
      if (request.signal.aborted) return;
      setSearchResult(search);
      setVisibleMatches(5);
      if (replayFirst && search.matchType === 'exact') {
        const first = search.matches.map(replayRecord).find(record => record.gameId);
        if (first) setReplay(first);
      }
      setPhase('done');
    } catch (err) {
      if (request.signal.aborted) return;
      setPhase('error');
      setErrorMessage(err.message || 'An unexpected error occurred.');
    }
  }, []);

  useEffect(() => {
    if (!sample || !online) return;
    const controller = new AbortController();
    async function guide() {
      setSampleChecked(false);
      setPhase('uploading');
      setErrorMessage('');
      try {
        const response = await fetch('/product/guided-e4.png', { signal: controller.signal });
        if (!response.ok) throw new Error('The sample image could not load.');
        const image = await response.blob();
        if (controller.signal.aborted) return;
        // The game record supplies the side to move and castling rights for the sample.
        const vision = await processFile(new File([image], 'guided-e4.png', { type: 'image/png' }), sampleFen);
        if (!vision || controller.signal.aborted) return;
        if (vision.fen !== sampleFen) return;
        setSampleChecked(true);
        await searchPosition(sampleFen, true);
      } catch (error) {
        if (controller.signal.aborted) return;
        setPhase('error');
        setErrorMessage(error.message);
      }
    }
    guide();
    return () => { controller.abort(); requestRef.current?.abort(); };
  }, [sample, online, sampleRun, processFile, searchPosition]);

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
  const uploadDisabled = !online || visionHealthStatus === 'waking' || visionHealthStatus === 'error';
  const confidence = Math.round((visionResult?.theme_match_confidence ?? 0) * 100);
  const games = new Map();
  for (const match of searchResult?.matches ?? []) {
    const key = match.gameId ?? match.game?.id ?? match.id;
    if (!games.has(key)) games.set(key, match);
  }
  const matches = [...games.values()];

  return (
    <main className="ct-workspace" data-sample={sample}>
      <header className="ct-workspace-header">
        <h1>{sample ? 'Trace a sample board' : 'Origin Lens'}</h1>
        <p>{sample ? 'Follow the screenshot from recognition to a replay. This example starts after 1. e4.'
          : 'Find where a position appeared and replay the games that led to it.'}</p>
        {sample && <Link className="ct-quiet mt-3" to="/">Back to ChessTrace</Link>}
      </header>
      {!online && <p role="status" className="ct-panel mb-4 p-3 text-sm">Reconnect to scan a screenshot and search the corpus.</p>}
      <div className="lens-layout">
        <section className="space-y-3 min-w-0" aria-label="Position input">
          <ServiceHealthBanner url={VISION_URL} label="image scanner" />
          {!sample && <div className="ct-panel lens-upload" data-has-result={!!visionResult}
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
            <div className="lens-camera">
              <button type="button" className="ct-quiet" disabled={uploadDisabled} onClick={() => cameraRef.current?.click()}>
                <Camera size={18} aria-hidden="true" /> Take a photo
              </button>
              <input ref={cameraRef} type="file" aria-label="Camera image" accept="image/*" capture="environment"
                className="hidden" onChange={handleFileSelect} />
              <p className="text-xs text-slate-500">Screenshots are more reliable than photos of screens.</p>
            </div>
            {previewUrl && !visionResult && (
              <div className="lens-preview">
                <img src={previewUrl} alt="Board screenshot preview" />
                {uploading && <span className="lens-scan" aria-hidden="true" />}
              </div>
            )}
            {uploading && <span className="sr-only" role="status">Analyzing board screenshot.</span>}
          </div>}
          {sample && <div className="ct-panel lens-upload">
            <ol className="sample-steps" aria-label="Sample progress">
              <li data-done={!!previewUrl}>1. Screenshot</li>
              <li data-done={!!visionResult}>2. Board review</li>
              <li data-done={!!searchResult}>3. Match</li>
              <li data-done={!!replay}>4. Replay</li>
            </ol>
            <div className="lens-preview">
              <img src="/product/guided-e4.png" width="596" height="572" alt="Generated chessboard after White plays e4" />
              {uploading && <span className="lens-scan" aria-hidden="true" />}
            </div>
            {uploading && <p role="status" className="mt-2 text-sm">Scanning the sample screenshot…</p>}
            {sampleChecked && <p className="mt-2 text-sm text-slate-500">Piece placement matches the example. The game record supplies Black to move and the castling rights. A flagged square still shows where the scanner was unsure. You can confirm it against the example.</p>}
            {visionResult && !sampleChecked && <p className="mt-2 text-sm">Review the detected pieces before searching.</p>}
            {phase === 'error' && online && <button type="button" className="ct-quiet mt-2" onClick={() => setSampleRun(value => value + 1)}>Retry sample</button>}
          </div>}

          {phase === 'error' && (
            <div role="alert" className="ct-panel flex gap-2 p-3 text-sm text-red-700">
              <AlertTriangle size={18} className="shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          {visionResult && (
            <>
              <p className="font-mono text-xs text-slate-500">
                Template fit {confidence}% · {visionResult.orientation === 'black_bottom' ? 'Black' : 'White'} at bottom
              </p>
              {visionResult.warnings?.map(warning => {
                const crop = warning.includes('centered square crop');
                const orientation = /coordinate labels|manual_orientation/.test(warning);
                const label = crop ? 'Check the crop' : orientation ? 'Check orientation' : 'Check the detected pieces';
                const message = crop ? 'The scanner used the center of the image because it could not locate the board. Use a tighter screenshot if the board looks wrong.'
                  : orientation ? 'The scanner could not confirm the board orientation. Check which side is at the bottom.' : warning;
                return <div key={warning} role="status" className="ct-panel p-3 text-sm text-amber-700">
                  <p><strong>Review needed · {label}</strong></p>
                  <p>{message}</p>
                  {crop && !sample
                    ? <button type="button" className="ct-quiet mt-2" onClick={() => fileRef.current?.click()}>Choose a tighter screenshot</button>
                    : <a href={orientation ? '#review-orientation' : '#detected-board'} className="mt-2 inline-block underline">{orientation ? 'Check orientation' : 'Review board'}</a>}
                </div>;
              })}
              <ScreenshotReview result={visionResult} searching={phase === 'searching'} offline={!online} onSearch={searchPosition} onEdit={clearSearch} />
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
              {searchResult.matchType === 'exact' && Number.isInteger(searchResult.matchingGameCount) &&
                <p className="mt-2 font-mono text-xs text-accent">{searchResult.matchingGameCount.toLocaleString()} {searchResult.matchingGameCount === 1 ? 'matching game' : 'matching games'} · {searchResult.replayCount.toLocaleString()} {searchResult.replayCount === 1 ? 'replay available' : 'replays available'}</p>}
              {searchResult.matchType === 'similar' && <p className="my-3 text-sm text-slate-500">
                No exact match found{Number.isInteger(searchResult.corpusGames)
                  ? ` in ${searchResult.corpusGames.toLocaleString()} ${searchResult.corpusGames === 1 ? 'game' : 'games'}` : ''}.
                {matches.length ? ' Similar positions are shown below.' : ' No similar positions were available.'}
                {' '}Check castling rights, side to move, and any flagged squares.
              </p>}
              {replay && <div className="my-4"><GameReplay key={replay.id} match={replay} /></div>}
              <ol>
                {matches.slice(0, visibleMatches).map(match => {
                  const game = match.game ?? match;
                  const year = game.playedAt?.slice(0, 4);
                  const record = replayRecord(match);
                  return (
                    <li key={match.id} className="lens-match" data-selected={replay?.id === match.id}>
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-semibold">{game.whiteName} <span className="text-slate-500">vs.</span> {game.blackName}</h3>
                        {record.gameId && <button type="button" onClick={() => setReplay(record)}
                          className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm text-accent" aria-pressed={replay?.id === match.id}>
                          {replay?.id === match.id ? 'Playing' : 'Replay'} <ArrowUpRight size={15} aria-hidden="true" />
                        </button>}
                      </div>
                      <p className="text-xs text-slate-500">{[game.result, game.event, year,
                        match.nextMove ? `Next move: ${match.nextMove}` : match.positionMove && `Move ${match.positionMove}`].filter(Boolean).join(' · ')}</p>
                      {match.similarityLabel && <p className="mt-1 text-sm">{match.similarityLabel}</p>}
                      {!!match.sharedFeatures?.length && <ul className="text-xs text-slate-500">{match.sharedFeatures.map(feature => <li key={feature}>{feature}</li>)}</ul>}
                    </li>
                  );
                })}
              </ol>
              {visibleMatches < matches.length && <button type="button" className="ct-quiet mt-3" onClick={() => setVisibleMatches(count => count + 5)}>Show more</button>}
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
