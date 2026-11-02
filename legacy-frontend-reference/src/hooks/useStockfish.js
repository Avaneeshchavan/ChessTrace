import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Client-side WASM Stockfish. Never touches the Node backend — this is
 * what keeps engine analysis free at any scale (Deliverable 3).
 *
 * Parses standard UCI `info` lines for score/depth/pv and exposes them as
 * state, plus a controllable `depth` slider that's re-sent as `go depth N`
 * whenever it changes (rather than a fixed search).
 */
export function useStockfish() {
  const workerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [depth, setDepth] = useState(14);
  const [evaluation, setEvaluation] = useState(null); // { type: 'cp'|'mate', value: number }
  const [bestLine, setBestLine] = useState([]); // array of UCI moves, e.g. ['e2e4', 'e7e5']
  const [searchDepthReached, setSearchDepthReached] = useState(0);
  const currentFenRef = useRef(null);

  useEffect(() => {
    const worker = new Worker('/stockfish/stockfish-worker.js');
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : '';

      if (line === 'ct-worker-ready') {
        worker.postMessage('uci');
        return;
      }
      if (line === 'uciok') {
        worker.postMessage('isready');
        return;
      }
      if (line === 'readyok') {
        setReady(true);
        return;
      }
      if (line.startsWith('info')) {
        parseInfoLine(line, { setEvaluation, setBestLine, setSearchDepthReached });
      }
      // 'bestmove ...' lines are intentionally not treated as terminal —
      // the eval bar tracks the latest 'info' line as depth increases,
      // per the "live evaluation" requirement rather than a one-shot result.
    };

    return () => {
      worker.terminate();
    };
  }, []);

  const evaluatePosition = useCallback(
    (fullFen) => {
      const worker = workerRef.current;
      if (!worker || !ready) return;
      currentFenRef.current = fullFen;
      worker.postMessage('stop');
      worker.postMessage(`position fen ${fullFen}`);
      worker.postMessage(`go depth ${depth}`);
    },
    [ready, depth]
  );

  // Re-run search at the same position whenever the depth slider moves.
  useEffect(() => {
    if (currentFenRef.current) {
      evaluatePosition(currentFenRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depth]);

  return {
    ready,
    depth,
    setDepth,
    evaluation,
    bestLine,
    searchDepthReached,
    evaluatePosition,
  };
}

function parseInfoLine(line, { setEvaluation, setBestLine, setSearchDepthReached }) {
  const tokens = line.split(' ');

  const depthIdx = tokens.indexOf('depth');
  if (depthIdx !== -1) {
    setSearchDepthReached(Number(tokens[depthIdx + 1]));
  }

  const scoreIdx = tokens.indexOf('score');
  if (scoreIdx !== -1) {
    const type = tokens[scoreIdx + 1]; // 'cp' or 'mate'
    const value = Number(tokens[scoreIdx + 2]);
    if (type === 'cp' || type === 'mate') {
      setEvaluation({ type, value });
    }
  }

  const pvIdx = tokens.indexOf('pv');
  if (pvIdx !== -1) {
    setBestLine(tokens.slice(pvIdx + 1));
  }
}
