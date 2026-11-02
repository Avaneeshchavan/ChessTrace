// Worker entry point for client-side Stockfish. Loaded by useStockfish.js
// via `new Worker('/stockfish/stockfish-worker.js')`.
//
// Expects stockfish.wasm's own JS glue file (e.g. `stockfish.js` or
// `stockfish-nnue-16.js` depending on which build you fetch — see
// README.md in this folder) to sit alongside this file. That glue file,
// when imported into a worker, exposes a global `Stockfish()` factory
// (multi-threaded builds) or behaves as a classic Emscripten worker that
// takes UCI commands over `postMessage` directly (single-threaded builds).
// This entry handles both shapes so useStockfish.js doesn't need to care
// which binary you dropped in.

/* eslint-disable no-restricted-globals */
let engine = null;
let usingFactoryApi = false;

async function boot() {
  importScripts('./stockfish.js');

  if (typeof self.Stockfish === 'function') {
    // Multi-threaded / factory-style build (needs COOP/COEP headers —
    // see vite.config.js comment. Falls back gracefully if unsupported.)
    usingFactoryApi = true;
    engine = await self.Stockfish();
    engine.addMessageListener((line) => self.postMessage(line));
  } else {
    // Classic single-threaded Emscripten build: importing the script
    // already wired up self.onmessage/self.postMessage as the UCI pipe.
    usingFactoryApi = false;
  }

  self.postMessage('ct-worker-ready');
}

const bootPromise = boot();

self.onmessage = async (e) => {
  await bootPromise;
  if (usingFactoryApi && engine) {
    engine.postMessage(e.data);
  }
  // else: classic build already owns self.onmessage internally once
  // imported; this handler only exists pre-boot, and factory-mode after.
};
