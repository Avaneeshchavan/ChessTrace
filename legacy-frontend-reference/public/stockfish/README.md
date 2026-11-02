# Stockfish binary — not included

I couldn't fetch the actual `.wasm`/glue-JS binary from this environment
(no network access in the sandbox that generated this scaffold). You need
to drop two files into this folder before `useStockfish.js` will boot:

1. `stockfish.js` — the Emscripten glue/loader
2. `stockfish.wasm` — the compiled engine

**Free, zero-cost source:** the `lichess-org/stockfish.wasm` or
`nmrugg/stockfish.js` GitHub releases both ship prebuilt files under
GPL-compatible/permissive terms for this use. Either the single-threaded
"lite" build or the multi-threaded NNUE build works — `stockfish-worker.js`
in this folder detects which one you dropped in and adapts (see comment
at the top of that file). The multi-threaded build is faster but needs
the COOP/COEP headers already configured in `vite.config.js`.

Once both files are here, `useStockfish.js` needs no changes.
