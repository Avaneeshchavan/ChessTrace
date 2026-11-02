# ChessTrace System Context & Workspace State Document
**Document Target:** Claude / LLM System Ingestion  
**Workspace Root:** `/Users/avaneeshchavan/VS Code/ChessTrace`  
**Generated Date:** September 2026 (Analyzed November 2026)  
**Project Classification:** Full-Stack Computer Vision & AI Chess Analysis Platform  

---

## 1. System Architecture & Tech Stack Map

ChessTrace is a hybrid three-tier architecture combining computer vision, high-performance vector search in PostgreSQL (`pgvector`), client-side WASM engine computation, and a responsive React single-page application.

```
                          ┌────────────────────────┐
                          │   Client UI (Vite)     │
                          │ React 19 + Chessground │
                          │ Client-side Stockfish  │
                          └──────┬───────────┬─────┘
                     Image Upload│           │REST API (JSON)
                                 ▼           ▼
       ┌───────────────────────────┐       ┌──────────────────────────────┐
       │   Vision Engine (FastAPI) │       │      API Server (Express)    │
       │ OpenCV + Template Match   │       │ Prisma ORM + JWT Auth + SM-2 │
       │ Strict FEN & Orientation  │       └──────────────┬───────────────┘
       └───────────────────────────┘                      │
                                                          │ SQL / HNSW Vector L2
                                                          ▼
                                           ┌──────────────────────────────┐
                                           │    PostgreSQL (Neon)         │
                                           │  pgvector (32-dim vector)    │
                                           │  Game, Position, User, Vault │
                                           └──────────────────────────────┘
```

### 1.1 Microservices & Tech Stacks

| Service Directory | Runtime / Tech Stack | Primary Responsibilities | Deployment Target | Port / Base URL |
| :--- | :--- | :--- | :--- | :--- |
| **`client-ui/`** | React 19, Vite 8, Tailwind CSS 4, Chessground 9, chess.js 1.4, Web Worker WASM Stockfish | Web SPA, board rendering, client-side live engine evaluation, screenshot upload UX, review flows, dashboard | Vercel (`dist/`, rewrites to `index.html`) | `http://localhost:5173` |
| **`api-server/`** | Node.js (>=18), Express 5, Prisma 5.19, PostgreSQL 16 + `pgvector` (Neon), `chess.js` (beta.8), `bcrypt`, `jsonwebtoken` | User authentication, game ingestion, two-tier vector position retrieval, spaced-repetition vault API, user metrics | Render (`web` service) | `http://localhost:5001` |
| **`vision-engine/`** | Python 3.12/3.13, FastAPI, Uvicorn, OpenCV (`opencv-python-headless`), NumPy, `python-chess`, PyTesseract | Digital chessboard screenshot detection, contour detection, square slicing, silhouette template matching, orientation OCR, FEN generation | Render (`web` service) | `http://localhost:8000` |
| **`legacy-frontend-reference/`** | React 18, Vite, Tailwind | Earlier prototype reference codebase (superseded by `client-ui`) | Deprecated / Reference | N/A |
| **`chess-trace (V0)/`** | Next.js / v0 export | Design prototype / reference export | Archive | N/A |
| **`chess.com-boards-and-pieces-2.x/`**| Python 3, assets collection | Local repository of chess.com board textures and piece sets (`neo_wood`, `neon`, `classic`, etc.) | Asset store | N/A |

---

## 2. Directory Tree & File Inventory

```
ChessTrace/
├── Claude_Context_State.md             # This document
├── render.yaml                         # Render blueprint (api-server + vision-engine)
├── Test.png                            # Test screenshot asset
├── ChessTrace Logo.png                 # Brand logo
├── api-server/                         # Node.js Express + Prisma backend
│   ├── .env                            # Active Neon database credentials
│   ├── .env.example                    # Environment template
│   ├── package.json                    # Express 5, Prisma 5, bcrypt, jwt, axios
│   ├── verify_db.js                    # Diagnostic script for Neon pg_tables and pg_indexes
│   ├── apply_migration.js              # Direct SQL script to enable pgvector extension & HNSW index
│   ├── data/
│   │   ├── test.pgn                    # Sample PGN for testing
│   │   └── legendary_sacrifices.pgn    # Tactical reference games
│   ├── prisma/
│   │   ├── schema.prisma               # Models: Game, Position, User, SavedPuzzle, Tag, ActivityLog
│   │   └── migrations/
│   │       └── 0001_manual_vector_index/
│   │           └── migration.sql       # HNSW index: idx_position_vector_hnsw (m=16, ef_construction=64)
│   ├── scripts/
│   │   ├── ingest.js                   # High-throughput streaming PGN parser & bulk vector ingester
│   │   ├── smoke-test.js               # Validates legality checks and 32-dim vector generation
│   │   ├── test-search.js              # Runs exact and ANN vector distance search against DB
│   │   └── gen-test-pgn.js             # Utility to generate test PGNs
│   └── src/
│       ├── index.js                    # Server entry, CORS, health checks, route wiring
│       ├── vector.js                   # 32-dimensional king-safety and tactical feature extractor
│       ├── attacks.js                  # Pure geometric 8x8 attack-map generator (bypasses chess.js turn checks)
│       ├── legality.js                 # Syntactic board legality validator
│       ├── search.js                   # Two-tier search engine: Tier 1 (Hash) & Tier 2 (pgvector HNSW)
│       ├── middleware/
│       │   └── authMiddleware.js       # Bearer JWT token extractor and validator
│       ├── utils/
│       │   └── streak.js               # Daily consecutive activity streak calculator
│       ├── lib/
│       │   ├── sm2.js                  # SuperMemo-2 (SM-2) spaced repetition algorithm
│       │   └── sm2.test.js             # SM-2 unit test suite (INCOMPLETE: missing test harness imports)
│       └── routes/
│           ├── authRoutes.js           # POST /register, POST /login
│           ├── gameRoutes.js           # POST /fetch (Lichess game PGN export; Chess.com 501 stub)
│           ├── searchRoutes.js         # GET/POST / (Two-tier exact + vector search)
│           ├── vaultRoutes.js          # GET/POST /, GET /review-queue, POST /:id/review (SCHEMA MISMATCH)
│           ├── dashboardRoutes.js      # GET /summary (90-day heatmap, stats, streak), POST /activity
│           └── userRoutes.js           # PATCH /me, POST /me/password, GET /me/summary
├── client-ui/                          # React + Vite Frontend
│   ├── package.json                    # React 19, Vite 8, chessground, chess.js, lucide-react
│   ├── vite.config.js                  # Vite configuration
│   ├── tailwind.config.js              # Tailwind configuration
│   ├── vercel.json                     # SPA client-side routing rewrites
│   ├── DEPLOY_CHECKLIST.md             # Verification procedures for deployment cold-starts and features
│   ├── public/
│   │   ├── stockfish/                  # WASM Stockfish engine files
│   │   │   ├── stockfish.js
│   │   │   ├── stockfish.wasm
│   │   │   └── stockfish-worker.js     # WebWorker bridge translating UCI protocol
│   │   └── synthetic_chesscom_neo.png
│   └── src/
│       ├── main.jsx                    # Entry point
│       ├── App.jsx                     # Router, ProtectedRoute, Service waking notification banner
│       ├── index.css                   # Global styles
│       ├── config/
│       │   └── api.js                  # API_BASE_URL and VISION_ENGINE_URL environment bindings
│       ├── context/
│       │   └── AuthContext.jsx         # Auth state provider (JWT token & user localStorage)
│       ├── hooks/
│       │   ├── useStockfish.js         # Client-side WASM engine evaluator hook
│       │   ├── useServiceHealth.js     # Polling hook for Render free-tier wake-up handling
│       │   └── useDashboard.js         # Dashboard statistics & activity fetching hook
│       ├── utils/
│       │   └── validation.js           # Password validation utilities
│       ├── components/
│       │   ├── Shell.jsx               # Navigation layout with sidebar
│       │   ├── ChessTraceLogo.jsx      # SVG brand logo
│       │   ├── ActivityHeatmap.jsx     # 90-day contribution grid heatmap component
│       │   ├── Board/                  # Chessground wrapper with theme support & low-confidence markers
│       │   │   ├── Board.jsx
│       │   │   └── Board.css
│       │   └── EnginePanel/            # Live evaluation bar and engine depth controller
│       │       ├── EnginePanel.jsx
│       │       └── EvalBar.jsx
│       └── pages/
│           ├── Auth.jsx                # Login / Registration toggle page
│           ├── Dashboard.jsx           # Main stats, streak, heatmap, and quick launch
│           ├── OriginLens.jsx          # Screenshot upload -> Vision Engine -> Two-tier DB search
│           ├── Sandbox.jsx             # Interactive analysis board with live Stockfish evaluation
│           ├── TurningPoints.jsx       # PGN analysis, blunder detector, and vault bookmarking
│           ├── PatternVault.jsx        # Saved puzzle library with motif filters and review banner
│           ├── VaultReview.jsx         # Flashcard-style SM-2 spaced repetition review page
│           └── Settings.jsx            # Account summary, display name changer, password updater
├── vision-engine/                      # Python FastAPI Computer Vision Service
│   ├── requirements.txt                # fastapi, uvicorn, opencv-python-headless, python-chess, pytesseract
│   ├── EXPLANATION.md                  # Comprehensive CV rationale and threshold benchmarks
│   ├── app/
│   │   ├── main.py                     # POST /parse-screenshot endpoint, CORS, health check
│   │   ├── schemas.py                  # Pydantic response models: ParseScreenshotResponse, SquareResult
│   │   └── pipeline/
│   │       ├── board_detection.py      # Bilateral filter + Canny contour detection for chessboard bounds
│   │       ├── grid_slicing.py         # 8x8 uniform grid crop with theme margin offsets
│   │       ├── template_library.py     # Binary silhouette extraction & fill intensity scoring
│   │       ├── template_matching.py    # cv2.TM_CCOEFF_NORMED multi-scale template matcher
│   │       ├── orientation.py          # PyTesseract coordinate OCR for White/Black bottom detection
│   │       ├── fen_assembly.py         # 64-square algebraic matrix to FEN builder
│   │       └── fen_validate.py         # python-chess strict FEN validation
│   ├── templates/                      # Generated binary template silhouettes for Neo and CBurnett
│   │   ├── chesscom_neo/
│   │   └── lichess_cburnett/
│   ├── scripts/
│   │   ├── generate_templates.py       # Template generator from DejaVu Sans chess unicode glyphs
│   │   └── make_synthetic_test_board.py
│   └── tests/
│       ├── test_pipeline.py            # End-to-end CV test against synthetic images (100% PASSING)
│       └── real_test.png
```

---

## 3. Database Schema & Data Models

Managed via Prisma (`api-server/prisma/schema.prisma`) targeting PostgreSQL with Neon connection pooling:

```prisma
model Game {
  id         Int        @id @default(autoincrement())
  whiteName  String
  blackName  String
  whiteElo   Int?
  blackElo   Int?
  playedAt   DateTime?
  event      String?
  result     String
  pgn        String     @db.Text
  positions  Position[]
  createdAt  DateTime   @default(now())

  @@index([whiteName])
  @@index([blackName])
  @@index([event])
}

model Position {
  id       BigInt                     @id @default(autoincrement())
  gameId   Int
  game     Game                       @relation(fields: [gameId], references: [id], onDelete: Cascade)
  halfMove Int
  fenCore  String                     @db.VarChar(90) // placement + turn + castling (drops ep & clocks)
  vector   Unsupported("vector(32)")? // 32-dim normalized king-safety & material vector

  @@index([fenCore], map: "idx_position_fencore_hash", type: Hash)
  @@index([gameId])
}

model User {
  id           String        @id @default(uuid())
  email        String        @unique
  passwordHash String
  displayName  String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
  savedPuzzles SavedPuzzle[]
  activityLogs ActivityLog[]
}

model SavedPuzzle {
  id              String   @id @default(uuid())
  userId          String
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  fen             String
  initialMove     String?
  solutionPgn     String?
  reviewStatus    String   @default("DUE_TODAY")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  tags            Tag[]    @relation("PuzzleTags")
  
  // NOTE: Schema gap identified here. See Section 4.2.
}

model Tag {
  id       String        @id @default(uuid())
  name     String        @unique
  puzzles  SavedPuzzle[] @relation("PuzzleTags")
}

model ActivityLog {
  id        String       @id @default(cuid())
  userId    String
  user      User         @relation(fields: [userId], references: [id])
  type      ActivityType // LENS_SEARCH, SANDBOX_SESSION, TURNING_POINTS_RUN, PUZZLE_SAVED, PUZZLE_REVIEWED
  refId     String?
  metadata  Json?
  createdAt DateTime     @default(now())

  @@index([userId, createdAt])
}
```

### The 32-Dimensional Vector Structure (`src/vector.js`)
All values normalized to approx $[-1.0, 1.0]$:
- **Indices `[0..7]`**: White king 8-compass neighboring zone occupancy (N, NE, E, SE, S, SW, W, NW).
- **Indices `[8..15]`**: Black king 8-compass neighboring zone occupancy.
- **Indices `[16..18]`**: White king pawn shield (3 squares directly ahead).
- **Indices `[19..21]`**: Black king pawn shield (3 squares directly ahead).
- **Index `[22]`**: Attackers on White king zone (geometric Black move threats).
- **Index `[23]`**: Defenders of White king zone (geometric White move protections).
- **Index `[24]`**: Attackers on Black king zone.
- **Index `[25]`**: Defenders of Black king zone.
- **Indices `[26..30]`**: Material differential per piece type: Pawn, Knight, Bishop, Rook, Queen.
- **Index `[31]`**: Total weighted material differential.

---

## 4. Current Development Stage & Detailed Diagnostic Audit

### 4.1 Working Features
1. **Frontend Architecture & Builds:**
   - `client-ui` compiles cleanly with zero Vite/Rollup errors (`npm run build` generates 360 kB bundle).
   - Client-side Stockfish engine initializes via WebWorker and evaluates positions (`Sandbox.jsx`, `useStockfish.js`).
   - Interactive board (`Board.jsx`) wraps Chessground with move generation, legal bounds, and theme rendering.
   - Authentication flow UI with login/registration, token persistence in localStorage, and ProtectedRoute guards.
   - User Settings page (`Settings.jsx`) updates display name, changes password, and fetches account statistics.
   - Service waking banners (`useServiceHealth.js`) automatically ping Render backends and notify users during cold starts.
2. **Vision Engine Pipeline:**
   - 100% passing test pipeline (`python tests/test_pipeline.py`) validating board contour detection, orientation label detection, grid slicing, template classification, FEN assembly, and strict FEN validation.
   - In-memory zero-retention image processing (no user screenshots saved to disk).
3. **Core Algorithmic Engines:**
   - `smoke-test.js` passes: syntactic legality check (`legality.js`) and 32-dimensional vector creation (`vector.js`) execute accurately.
   - Geometric attack detection (`attacks.js`) functions without encountering `chess.js` turn/in-check validation traps.
   - Streak calculation (`streak.js`) accounts for activity today and yesterday correctly.

---

### 4.2 Broken Endpoints & Database Schema Gaps

#### Critical Schema Mismatch: SM-2 Spaced Repetition in `vaultRoutes.js`
In `api-server/src/routes/vaultRoutes.js`:
- Lines 87–90 execute:
  ```js
  prisma.savedPuzzle.findMany({
    where: { userId: req.user.id, nextReviewAt: { lte: new Date() } },
    orderBy: { nextReviewAt: 'asc' }
  });
  ```
- Lines 121–136 execute:
  ```js
  calculateNextReview({
    easeFactor: puzzle.easeFactor,
    intervalDays: puzzle.intervalDays,
    repetitions: puzzle.repetitions,
    quality: Number(quality)
  });
  await prisma.savedPuzzle.update({
    where: { id },
    data: { easeFactor, intervalDays, repetitions, nextReviewAt, lastReviewedAt: new Date() }
  });
  ```
- **Error:** `SavedPuzzle` in `schema.prisma` is missing `easeFactor`, `intervalDays`, `repetitions`, `nextReviewAt`, and `lastReviewedAt`.
- **Consequence:** 
  - `GET /api/vault/review-queue` crashes with a 500 Prisma Client error (`Unknown argument 'nextReviewAt'`).
  - `POST /api/vault/:id/review` crashes with a 500 Prisma Client error.
  - `VaultReview.jsx` frontend will perpetually fail to load or submit reviews.

#### Incomplete Provider: Chess.com PGN Fetching
In `api-server/src/routes/gameRoutes.js` (lines 27–32):
- Requesting `POST /api/games/fetch` with a `chess.com` URL returns:
  ```json
  { "error": "Chess.com fetching not fully implemented in this stub" } // HTTP 501
  ```
- Only `lichess.org` game URLs (e.g. `https://lichess.org/{id}`) are parsed and fetched via Lichess export API. Raw PGN text pasting works.

#### Broken Unit Test: `api-server/src/lib/sm2.test.js`
- Executing `node --test src/lib/sm2.test.js` results in `ReferenceError: describe is not defined`.
- The test was written using Jest/Vitest conventions (`describe`, `it`, `expect`) but `api-server` uses Node's native test runner (`node:test`, `node:assert`).
- Furthermore, `api-server/package.json` specifies `"test": "node --test test/"`, but the `test/` folder does not exist.

---

### 4.3 Deployment Configuration Bugs (`render.yaml`)

1. **`api-server` Start Command Failure:**
   - `render.yaml` specifies `startCommand: npm start`.
   - `api-server/package.json` **has no `"start"` script**.
   - Running `npm start` in `api-server` fails (`npm error Missing script: "start"`).
   - `"main"` is also mistakenly pointed to `"src/search.js"` rather than `"src/index.js"`.
2. **`vision-engine` Uvicorn Module Path Error:**
   - `render.yaml` specifies `startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT` with `rootDir: vision-engine`.
   - In `vision-engine`, `main.py` is located in `app/main.py`.
   - Running `uvicorn main:app` from `vision-engine` throws:
     `Error loading ASGI app. Could not import module "main".`
   - Must be: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

---

### 4.4 Missing Local Git Repository
- The workspace `/Users/avaneeshchavan/VS Code/ChessTrace` contains no `.git` directory.
- `git init` was mistakenly executed in the user's home folder (`/Users/avaneeshchavan`), leaving the entire ChessTrace project as untracked files in the parent repo.
- Version control is uninitialized within the project root.

---

## 5. Chronological Development History & Most Recent Work

Based on file timestamps, commit patterns, and code diffs:

```
[Phase 1 & 2 Foundations] (Aug 26 - Aug 28, 2026)
└── Ingestion pipeline, pgvector HNSW manual migration, 32-dim king safety vector, FastAPI OpenCV pipeline.

[Frontend Skeleton & Stockfish WASM] (Sep 7, 2026)
└── Vite React 19 app created, Chessground Board wrapper, Stockfish WASM worker hooked into Sandbox.

[Spaced Repetition & Vault Backend] (Sep 11, 2026 | 16:45 - 17:00)
└── sm2.js written; sm2.test.js drafted; vaultRoutes.js updated with review-queue endpoints.

[Deployment Configuration & Health Checks] (Sep 11, 2026 | 18:30 - 18:55)
└── render.yaml and vercel.json created; useServiceHealth.js and DEPLOY_CHECKLIST.md added.

[Authentication & Dashboard Analytics] (Sep 11, 2026 | 22:15 - 23:15)
└── authMiddleware.js, streak.js, dashboardRoutes.js, userRoutes.js, Auth.jsx, Dashboard.jsx implemented.

[Most Recent Active Files] (Sep 12, 2026 | 00:44 - 00:45)
├── client-ui/src/pages/Settings.jsx       (Completed display name & password change handlers)
├── client-ui/src/pages/PatternVault.jsx   (Motif filter dropdown & review queue banner logic)
└── client-ui/src/hooks/useDashboard.js   (Integrated activity logging and status hooks)
```

### Unused Variables & Warnings Detected via `oxlint`:
- `client-ui/public/stockfish/stockfish-worker.js`: `stockfishReady`, `pendingCommands` declared but unused.
- `client-ui/src/pages/VaultReview.jsx`: `navigate` imported from `react-router-dom` but unused.
- `client-ui/src/pages/TurningPoints.jsx`: `useRef`, `useEffect` imported but unused.
- `client-ui/src/pages/Settings.jsx`: `displayFallback` computed but never rendered.
- `client-ui/src/hooks/useServiceHealth.js`: `isRetry` parameter declared but unused.

---

## 6. Prioritized Action Plan for Full Production Deployment

### Priority 1: Fix Database Schema & Restore Vault Review Flow (BLOCKER)
1. **Update `api-server/prisma/schema.prisma`:**
   Add SM-2 scheduling fields to `SavedPuzzle`:
   ```prisma
   model SavedPuzzle {
     id              String    @id @default(uuid())
     userId          String
     user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
     fen             String
     initialMove     String?
     solutionPgn     String?
     reviewStatus    String    @default("DUE_TODAY")
     easeFactor      Float     @default(2.5)
     intervalDays    Int       @default(0)
     repetitions     Int       @default(0)
     nextReviewAt    DateTime  @default(now())
     lastReviewedAt  DateTime?
     createdAt       DateTime  @default(now())
     updatedAt       DateTime  @updatedAt
     tags            Tag[]     @relation("PuzzleTags")

     @@index([userId, nextReviewAt])
   }
   ```
2. Run `npx prisma migrate dev --name add_sm2_to_saved_puzzle` and `npx prisma generate`.

### Priority 2: Fix Deployment Specifications (`render.yaml` & `package.json`) (BLOCKER)
1. **In `api-server/package.json`:**
   - Add script: `"start": "node src/index.js"`.
   - Update main: `"main": "src/index.js"`.
2. **In `render.yaml`:**
   - Fix vision start command: `startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

### Priority 3: Fix Test Suite (`api-server`)
1. **In `api-server/src/lib/sm2.test.js`:**
   Replace Jest syntax with Node's native test runner:
   ```javascript
   const { describe, it } = require('node:test');
   const assert = require('node:assert/strict');
   const { calculateNextReview } = require('./sm2');

   describe('SM-2 Algorithm', () => {
     it('resets repetitions to 0 and interval to 1 on a fail (quality < 3)', () => {
       const res = calculateNextReview({ easeFactor: 2.5, intervalDays: 10, repetitions: 5, quality: 2 });
       assert.equal(res.repetitions, 0);
       assert.equal(res.intervalDays, 1);
       assert.equal(res.easeFactor, 2.5);
     });
     // ...
   });
   ```
2. Update `"test"` script in `api-server/package.json` to `"node --test src/**/*.test.js"`.

### Priority 4: Initialize Git Repository for Deployment
1. Navigate to `/Users/avaneeshchavan/VS Code/ChessTrace`.
2. Execute `git init`.
3. Add a root `.gitignore` ignoring `.env`, `node_modules/`, `venv/`, `dist/`, `.DS_Store`, and `chess-trace (V0).zip`.
4. Stage and commit workspace files.
5. Connect remote repository for Render and Vercel GitHub CI/CD integration.

### Priority 5: Implement Chess.com Game Import
1. In `api-server/src/routes/gameRoutes.js`, implement Chess.com Public API endpoint (`https://api.chess.com/pub/player/{username}/games/...`) or extract PGN from Chess.com live/callback URLs to complete the stub.

### Priority 6: Replace Synthetic CV Templates with Real Sprites
1. Extract true PNG piece sprites from `chess.com-boards-and-pieces-2.x/pieces/` or live screenshots.
2. Run `python -m scripts.generate_templates` to refresh `vision-engine/templates/` with production sprite masks for maximum real-world OCR/matching accuracy.

---

## 7. LLM Fast-Reference Cheat Sheet

- **Auth Token Passing:** `Authorization: Bearer <token>`
- **Prisma Client Instantiation:** `new PrismaClient()` (pooled via Neon)
- **Vector Search Execution:** Done via raw transaction with `$executeRawUnsafe("SET LOCAL hnsw.ef_search = 40")` followed by `$queryRawUnsafe("... p.vector <-> $1::vector ...")`.
- **FEN Storage Standard:** `fenCore` stores `piece_placement side_to_move castling_rights` (e.g. `rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq`).
- **Stockfish Engine Communication:** Web Worker postMessage using UCI strings (`uci`, `isready`, `position fen ...`, `go depth N`).
- **Health Check Routes:**
  - API Server: `GET /api/health` and `GET /health`
  - Vision Engine: `GET /health`
