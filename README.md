# ChessTrace

ChessTrace is a chess study app that connects a position on your screen to games you can replay. Upload a board screenshot, correct the detected pieces and game state, then search for the same position or a structurally similar one. Open a match at the relevant move to see how the game continued.

![Origin Lens showing a reconstructed board and matching games](client-ui/public/product/origin-lens.webp)

## What you can do

- **Origin Lens** reconstructs a board from a screenshot and flags squares that need review. You can correct pieces, orientation, side to move, and castling rights before searching.
- **Sandbox** lets you play legal moves from a FEN, analyze the position with Stockfish, and find similar positions. Filter results by opening or decade and replay a matched game from its matching move.
- **Turning Points** accepts a Lichess game link, a completed Chess.com game, or pasted PGN. It analyzes the moves in a browser worker and surfaces up to three of the largest evaluation drops as puzzles.
- **Pattern Vault** saves puzzles with multiple motif tags, schedules reviews using SM-2, and charts weekly self-reported solve rates.

## Stack and architecture

| Layer | Technologies | Role |
| --- | --- | --- |
| [Client](client-ui/) | React, Vite, Tailwind CSS, Chessground, chess.js, Stockfish WASM | Board review, replay, study tools, and local engine analysis |
| [API](api-server/) | Node.js, Express, Prisma, JWT, bcrypt | Authentication, game import, position search, and puzzle review |
| Database | Neon PostgreSQL, pgvector | Game PGNs, position vectors, accounts, and saved puzzles |
| [Vision service](vision-engine/) | Python, FastAPI, OpenCV, NumPy, python-chess, optional Tesseract OCR | Board detection, per-square sprite matching, orientation, and provisional FEN |

```mermaid
flowchart LR
    Client["React client"] -->|Screenshot| Vision["FastAPI vision service"]
    Vision -->|Detected board and review flags| Client
    Client -->|Reviewed position, games, and puzzles| API["Express API"]
    API -->|Prisma and vector queries| DB[("Neon PostgreSQL and pgvector")]
    Client <-->|In-browser analysis| Engine["Stockfish WASM worker"]
```

Exact search looks up the first three FEN fields: piece placement, side to move, and castling rights. Similarity search compares 32-dimensional structural vectors using L2 distance and an HNSW index. Stored PGNs and half-move numbers let the client replay each match in context.

## Run locally

Use Node.js 22.12 or newer, Python with virtual environment support, and a PostgreSQL database with pgvector enabled. Run each service in its own terminal from the repository root.

1. **API.** In `api-server/`, copy `.env.example` to `.env`. Set `DATABASE_URL`, `DIRECT_URL`, and `JWT_SECRET`. For Neon, use a pooled URL for `DATABASE_URL` and a direct URL for `DIRECT_URL`. Set `CORS_ORIGIN` to the client origin, normally `http://localhost:5173`.

   ```sh
   cd api-server
   npm ci
   npx prisma generate
   npx prisma migrate deploy
   npm start
   ```

   The migration command above assumes a fresh database or one already managed by this project's migration history. For an existing database with a different history, see the [migration guide](docs/MIGRATIONS.md). A fresh database needs [game data](docs/DATA.md) before search can return matches.

2. **Vision service.** The service uses port 8000 and allows `http://localhost:5173` by default. Set `ALLOWED_ORIGINS` if the client runs elsewhere. Tesseract is optional for coordinate-label recognition.

   ```sh
   cd vision-engine
   python -m venv .venv
   source .venv/bin/activate
   python -m pip install -r requirements.txt
   python -m uvicorn app.main:app --port 8000
   ```

3. **Client.** The defaults point to the local API on port 5001 and vision service on port 8000. Set `VITE_API_BASE_URL` and `VITE_VISION_ENGINE_URL` in `client-ui/.env.local` if using different URLs.

   ```sh
   cd client-ui
   npm ci
   npm run dev
   ```

   Open the URL printed by Vite. Hosting configuration for [Render](render.yaml) and [Vercel](client-ui/vercel.json) is included.

## Verification and measured results

| Area | Result |
| --- | --- |
| Search benchmark | On a temporary Neon corpus of 1,000 games and 79,855 positions, PostgreSQL execution p95 was **0.500 ms exact** and **0.449 ms approximate** across 1,000 lookups. These timings exclude the network and API. |
| Board recognition | On 108 synthetic boards, the detector reached **99.71% per-square accuracy** and **90.74% exact piece placement**. Real screenshot accuracy has yet to be measured. |
| Landing page | Mobile Lighthouse on the local production build scored **98 performance** and **100 accessibility, best practices, and SEO**. |

Run `npm test` in `api-server/`, `npm run build` in `client-ui/`, and `python tests/test_pipeline.py` plus `python tests/test_detect.py` in `vision-engine/`.

See the [benchmark methodology](docs/BENCHMARKS.md), [vision evaluation](docs/VISION_EVAL.md), [UI screenshots](docs/ui/README.md), and [project status](docs/STATUS.md) for more detail.
