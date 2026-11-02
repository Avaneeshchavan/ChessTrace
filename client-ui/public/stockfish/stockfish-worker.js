// Worker entry point for client-side Stockfish (classic single-threaded build).
// Loaded by useStockfish.js via `new Worker('/stockfish/stockfish-worker.js')`.
//
// The classic stockfish.js (nmrugg/stockfish.js v10) wires itself directly
// to self.onmessage/postMessage after importScripts — so we hook self.postMessage
// BEFORE importing to intercept engine output, then forward incoming commands
// via the mechanism Stockfish sets up.

/* eslint-disable no-restricted-globals */

// Intercept outgoing messages from stockfish to detect 'uciok'/'readyok'
// and relay them all back to the main thread.
const originalPostMessage = self.postMessage.bind(self);
let stockfishReady = false;
let pendingCommands = [];

// Override postMessage so we can intercept engine output
self.postMessage = function(msg) {
  originalPostMessage(msg);
};

importScripts('./stockfish.js');

// After importScripts, Stockfish has replaced self.onmessage with its own handler.
// Save a reference to it so we can forward commands to the engine.
const stockfishHandler = self.onmessage;

// Now replace self.onmessage with our own that forwards to Stockfish
self.onmessage = function(e) {
  if (stockfishHandler) {
    stockfishHandler(e);
  }
};

// Signal to useStockfish.js that the worker is alive
originalPostMessage('ct-worker-ready');
