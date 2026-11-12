export function createStockfishClient() {
  const worker = new Worker('/stockfish/stockfish.wasm.js');
  let pending;
  let closed = false;
  let ready = false;
  let timer;

  function settle(error, value) {
    clearTimeout(timer);
    const job = pending;
    pending = null;
    if (error) job?.reject(error);
    else job?.resolve(value);
  }

  function close(error = new DOMException('Analysis cancelled', 'AbortError')) {
    if (closed) return;
    closed = true;
    worker.terminate();
    settle(error);
  }

  worker.onerror = () => close(new Error('Stockfish could not start or stopped unexpectedly.'));
  worker.onmessage = ({ data }) => {
    if (typeof data !== 'string') return;
    if (data === 'uciok') worker.postMessage('isready');
    else if (data === 'readyok') {
      ready = true;
      if (pending) start();
    } else if (pending && data.startsWith('info ')) {
      const score = data.match(/\bscore (cp|mate) (-?\d+)/);
      if (!score || /\b(?:upperbound|lowerbound)\b/.test(data)) return;
      pending.result = {
        evaluation: { type: score[1], value: Number(score[2]) },
        depth: Number(data.match(/\bdepth (\d+)/)?.[1] ?? 0),
        pv: data.split(' pv ')[1]?.trim().split(/\s+/) ?? [],
      };
      pending.onInfo?.(pending.result);
    } else if (pending && data.startsWith('bestmove ')) {
      settle(null, { ...pending.result, bestMove: data.split(/\s+/)[1] });
    }
  };
  worker.postMessage('uci');

  function start() {
    worker.postMessage(`position fen ${pending.fen}`);
    const restriction = pending.searchMove ? ` searchmoves ${pending.searchMove}` : '';
    worker.postMessage(`go depth ${pending.depth}${restriction}`);
  }

  function analyze(fen, depth, onInfo, { searchMove } = {}) {
    if (closed || pending) return Promise.reject(new Error('Stockfish is unavailable.'));
    if (searchMove && !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(searchMove)) {
      return Promise.reject(new Error('Invalid search move.'));
    }
    return new Promise((resolve, reject) => {
      pending = { fen, depth, onInfo, searchMove, resolve, reject };
      timer = setTimeout(() => close(new Error('Stockfish timed out. Try a lower depth.')), 120_000);
      if (ready) start();
    });
  }

  return { analyze, close };
}
