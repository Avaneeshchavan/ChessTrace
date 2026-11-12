# Stockfish 10 browser engine

ChessTrace starts the single-threaded WASM worker at `/stockfish/stockfish.wasm.js`.
The loader is the unmodified file from the upstream `stockfish.js@10.0.2` npm
package. The existing `stockfish.wasm` matches the binary in that package
(SHA-256 `45816b436eb8c180acb2c5b9fda0148101f411edbfa6bf919918e0a362eafca8`).
The older JavaScript engine and wrapper remain available at their original paths.

[GPLv3 license](COPYING.txt) · [Corresponding source and build instructions](https://github.com/lichess-org/stockfish.js/tree/e105072e84cf8ee5dd5219e2c5be29c3b8bf8a5a)
