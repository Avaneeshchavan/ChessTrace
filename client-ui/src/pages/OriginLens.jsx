import { fetchService, wakeScanner } from '../config/serviceRequest';
import { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, AlertTriangle, Search, Loader2, ArrowUpRight, Camera } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { GameReplay } from '../components/Board/GameReplay';
import { BoardCrop } from '../components/Board/BoardCrop';
import { ScreenshotReview } from '../components/Board/ScreenshotReview';
import { useOnline } from '../hooks/useOnline';
import { takeSharedImage } from '../utils/sharedImage';

import { API_BASE_URL as API_URL, VISION_ENGINE_URL as VISION_URL } from '../config/api';

import { sampleBoard, sampleFen, sampleMatches } from '../data/guidedSample';

function replayRecord(match) {
  const game = match.game ?? match;
  return { id: match.id, gameId: match.gameId ?? game.id, halfMove: match.halfMove,
    whiteName: game.whiteName, blackName: game.blackName, pgn: match.replayPgn };
}

export default function OriginLens({ sample = false }) {
  const online = useOnline();
  const [walkthrough, setWalkthrough] = useState(sample);
  const [scanStarted, setScanStarted] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [scanError, setScanError] = useState(null);
  const [scanCancelled, setScanCancelled] = useState(false);
  const lastUpload = useRef(null);
  const [proposal, setProposal] = useState(null);
  const [manualFen, setManualFen] = useState(null);
  // Pipeline states
  const [phase, setPhase] = useState(sample ? 'done' : 'idle');
  const [dragOver, setDragOver] = useState(false);
  const [params, setParams] = useSearchParams();
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const requestRef = useRef(null);
  const sharedRequest = useRef(null);

  // Vision engine response
  const [visionResult, setVisionResult] = useState(sample ? sampleBoard : null);

  // Search response
  const [searchResult, setSearchResult] = useState(sample ? sampleMatches : null);
  const [replay, setReplay] = useState(() => sample ? replayRecord(sampleMatches.matches[0]) : null);
  const [visibleMatches, setVisibleMatches] = useState(5);

  // Error state
  const [errorMessage, setErrorMessage] = useState('');

  // Preview image
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);
  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (scanStarted === null) return;
    const timer = setInterval(() => setElapsed(Math.floor((performance.now() - scanStarted) / 1000)), 250);
    return () => clearInterval(timer);
  }, [scanStarted]);

  const scanFile = useCallback(async (file, expectedFen, crop = null) => {
    if (!file) return;
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    lastUpload.current = { file, expectedFen, crop };
    wakeScanner(VISION_URL);
    setScanError(null);
    setScanCancelled(false);
    setElapsed(0);
    setScanStarted(performance.now());
    if (!crop) {
      setPreviewUrl(URL.createObjectURL(file));
      setProposal(null);
      setManualFen(null);
    }
    setErrorMessage('');
    setSearchResult(null);
    setReplay(null);
    setVisionResult(null);
    setPhase(crop ? 'uploading' : 'locating');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const path = crop ? '/parse-screenshot?' + new URLSearchParams({
        x: crop.x, y: crop.y, width: crop.size, height: crop.size,
      }) : '/locate-board';
      const response = await fetchService(VISION_URL, path, { method: 'POST', body: formData, signal: request.signal },
        { timeoutMs: 90_000, skipHealth: true });
      const result = await response.json();
      if (request.signal.aborted) return;
      if (!crop) {
        setProposal(result);
        setPhase('crop');
        return;
      }
      if (expectedFen && result.fen.split(' ')[0] === expectedFen.split(' ')[0]) result.fen = expectedFen;
      setVisionResult(result);
      setPhase('review');
      return result;
    } catch (err) {
      if (request.signal.aborted) return;
      setPhase('error');
      setScanError(err);
    } finally {
      if (requestRef.current === request) setScanStarted(null);
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
      if (file) scanFile(file);
      else {
        setErrorMessage('This shared image is unavailable. Choose a PNG, JPEG, or WebP screenshot up to 8 MiB.');
        setPhase('error');
      }
    });
    return () => { active = false; };
  }, [params, setParams, scanFile]);

  const searchPosition = useCallback(async (fen, replayFirst = false, broader = false) => {
    requestRef.current?.abort();
    const request = new AbortController();
    requestRef.current = request;
    setErrorMessage('');
    setSearchResult(null);
    setReplay(null);
    setPhase('searching');
    try {
      const path = broader ? '/api/search/placement?' + new URLSearchParams({ placement: fen.split(' ')[0] })
        : '/api/search?' + new URLSearchParams({ fen, includeCorpusCount: '1' });
      const searchRes = await fetchService(API_URL, path, { signal: request.signal });

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

  async function scanSample() {
    wakeScanner(VISION_URL);
    setWalkthrough(false);
    setErrorMessage('');
    setScanError(null);
    setScanCancelled(false);
    setPhase('uploading');
    const request = new AbortController();
    requestRef.current?.abort();
    requestRef.current = request;
    try {
      const response = await fetch('/product/guided-e4.png', { signal: request.signal });
      if (!response.ok) throw new Error('The sample image could not load.');
      const image = await response.blob();
      if (request.signal.aborted) return;
      await scanFile(new File([image], 'guided-e4.png', { type: 'image/png' }), sampleFen);
    } catch (error) {
      if (request.signal.aborted) return;
      setPhase('error');
      setScanError(error);
    }
  }

  async function confirmCrop(crop) {
    const { file, expectedFen } = lastUpload.current;
    const vision = await scanFile(file, expectedFen, crop);
    if (expectedFen && vision?.fen === expectedFen) await searchPosition(expectedFen, true);
  }

  function showWalkthrough() {
    requestRef.current?.abort();
    setWalkthrough(true);
    setScanStarted(null);
    setScanError(null);
    setScanCancelled(false);
    setErrorMessage('');
    setPreviewUrl(null);
    setProposal(null);
    setManualFen(null);
    setVisibleMatches(5);
    setVisionResult(sampleBoard);
    setSearchResult(sampleMatches);
    setReplay(replayRecord(sampleMatches.matches[0]));
    setPhase('done');
  }

  function cancelScan() {
    requestRef.current?.abort();
    setScanStarted(null);
    setPhase('idle');
    setScanCancelled(true);
  }

  function retryScan() {
    if (!lastUpload.current) { scanSample(); return; }
    const { file, expectedFen } = lastUpload.current;
    if (lastUpload.current.crop) confirmCrop(lastUpload.current.crop);
    else scanFile(file, expectedFen);
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    scanFile(file);
  }, [scanFile]);

  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file after a failed upload
    scanFile(file);
  }, [scanFile]);

  function clearSearch() {
    if (phase === 'searching') requestRef.current?.abort();
    setSearchResult(null);
    setReplay(null);
    setErrorMessage('');
    setPhase('review');
  }

  const uploading = phase === 'uploading' || phase === 'locating';
  const uploadDisabled = !online || uploading;

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
      {!online && !walkthrough && !scanError && <p role="status" className="ct-panel mb-4 p-3 text-sm">Reconnect to scan a screenshot and search the corpus.</p>}
      <div className="lens-layout">
        <section className="space-y-3 min-w-0" aria-label="Position input">
          {!sample && <div className="ct-panel lens-upload" data-has-result={!!visionResult}
            onDrop={event => { if (uploadDisabled) event.preventDefault(); else handleDrop(event); }}
            onDragOver={event => { event.preventDefault(); if (!uploadDisabled) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}>
            <button type="button" className="lens-upload-action" data-dragging={dragOver}
              disabled={uploadDisabled} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 size={22} className="text-accent animate-spin" aria-hidden="true" /> : <Upload size={22} className="text-accent" aria-hidden="true" />}
              <span className="font-semibold">{uploading ? 'Reading the screenshot…' : previewUrl ? 'Replace screenshot' : 'Upload a board screenshot'}</span>
              {!visionResult && <span className="text-xs text-slate-500">Drop or choose a PNG, JPEG, or WebP · up to 8 MiB</span>}
            </button>
            <input ref={fileRef} type="file" aria-label="Board screenshot" accept="image/png,image/jpeg,image/webp"
              className="hidden" onChange={handleFileSelect} />
            <div className="lens-camera">
              <button type="button" className="ct-quiet" disabled={uploadDisabled} onClick={() => { wakeScanner(VISION_URL); cameraRef.current?.click(); }}>
                <Camera size={18} aria-hidden="true" /> Take a photo
              </button>
              <input ref={cameraRef} type="file" aria-label="Camera image" accept="image/*" capture="environment"
                className="hidden" onChange={handleFileSelect} />
              <p className="text-xs text-slate-500">Screenshots are more reliable than photos of screens.</p>
            </div>
            {previewUrl && !visionResult && phase !== 'crop' && (
              <div className="lens-preview">
                <img src={previewUrl} alt="Board screenshot preview" />
                {uploading && <span className="lens-scan" aria-hidden="true" />}
              </div>
            )}
            {uploading && <span className="sr-only" role="status">Analyzing board screenshot.</span>}
          </div>}
          {sample && <div className="ct-panel lens-upload">
            <ol className="sample-steps" aria-label="Sample progress">
              <li data-done={walkthrough || !!previewUrl}>1. Screenshot</li>
              <li data-done={!!visionResult}>2. Board review</li>
              <li data-done={!!searchResult}>3. Match</li>
              <li data-done={!!replay}>4. Replay</li>
            </ol>
            <div className="lens-preview">
              <img src="/product/guided-e4.png" width="596" height="572" alt="Generated chessboard after White plays e4" />
              {uploading && <span className="lens-scan" aria-hidden="true" />}
            </div>
            {walkthrough && <p className="mt-2 text-sm">Walkthrough using a prepared board and three saved replays. The game record supplies Black to move and the castling rights.</p>}
            {walkthrough && <button type="button" className="ct-quiet mt-2" disabled={!online} onClick={scanSample}>Scan it live</button>}
            {!walkthrough && <button type="button" className="ct-quiet mt-2" onClick={showWalkthrough}>Back to walkthrough</button>}
            {!walkthrough && visionResult?.fen === sampleFen && <p className="mt-2 text-sm">Piece placement matches the example. Review any flagged squares before searching again.</p>}
          </div>}

          {phase === 'crop' && <BoardCrop preview={previewUrl} proposal={proposal} offline={!online} onConfirm={confirmCrop} />}
          {proposal && visionResult && phase !== 'crop' && !walkthrough && <button type="button" className="ct-quiet"
            onClick={() => { clearSearch(); setPhase('crop'); }}>Adjust crop</button>}
          {(uploading || scanError || scanCancelled) && <div className="ct-panel space-y-2 p-3 text-sm">
            {uploading && <p role="status">{elapsed >= 3
              ? `Taking longer than usual (${elapsed} s). The first scan after inactivity can take about a minute.`
              : 'Reading the board…'}</p>}
            {uploading && <button type="button" className="ct-quiet" onClick={cancelScan}>Cancel scan</button>}
            {scanError && <p role="alert">{scanError.message}</p>}
            {scanCancelled && <p role="status">Scan canceled. Your screenshot is still here.</p>}
            {!uploading && <button type="button" className="ct-quiet" disabled={!online} onClick={retryScan}>Retry scan</button>}
          </div>}

          {phase === 'error' && errorMessage && (
            <div role="alert" className="ct-panel flex gap-2 p-3 text-sm text-red-700">
              <AlertTriangle size={18} className="shrink-0" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
          )}

          <Link className="ct-quiet" to="/sandbox?setup=1" state={{ boardFen: manualFen }}>
            Set up the position by hand
          </Link>

          {visionResult && phase !== 'crop' && (
            <>
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
              <ScreenshotReview key={walkthrough ? 'walkthrough' : previewUrl} result={visionResult} searching={phase === 'searching'} offline={!online} onSearch={searchPosition} onEdit={clearSearch}
                knownMetadata={walkthrough || (sample && visionResult.fen === sampleFen)} onPositionChange={setManualFen} />
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
              {walkthrough && searchResult === sampleMatches && <p className="mt-2 text-sm">Three example replays</p>}
              {searchResult.matchType === 'exact' && Number.isInteger(searchResult.matchingGameCount) &&
                <p className="mt-2 font-mono text-xs text-accent">{searchResult.matchingGameCount.toLocaleString()} {searchResult.matchingGameCount === 1 ? 'matching game' : 'matching games'} · {searchResult.replayCount.toLocaleString()} {searchResult.replayCount === 1 ? 'replay available' : 'replays available'}</p>}
              {searchResult.matchType === 'similar' && <div className="my-3 space-y-2 text-sm text-slate-500">
                <p>No exact match found{Number.isInteger(searchResult.corpusGames)
                  ? ` in ${searchResult.corpusGames.toLocaleString()} ${searchResult.corpusGames === 1 ? 'game' : 'games'}` : ''}.
                  Check whose turn it is and which castling rights remain, then search again.</p>
                <a href="#review-game-state" className="inline-block underline">Review turn and castling</a>
                <button type="button" className="ct-quiet" disabled={!manualFen || !online}
                  onClick={() => searchPosition(manualFen, false, true)}>Search ignoring castling and turn</button>
                <p>{matches.length ? 'Similar positions are shown below.' : 'No similar positions were available.'}</p>
              </div>}
              {searchResult.matchType === 'placement' && <p className="my-3 text-sm">
                {matches.length ? `${matches.length} available ${matches.length === 1 ? 'replay has' : 'replays have'} this piece layout. The turn and castling rights may differ.`
                  : 'No available replay has this piece layout, even ignoring castling and turn.'}
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
