# ChessTrace — Phase 3 frontend

## Before anything else: the two briefs disagreed

You gave me two versions of the Phase 3 prompt with conflicting facts. I
built against the **second, more specific one** — flag me if that's wrong:

1. **Phase 1 API status.** Draft A assumed exact/similarity routes were
   already exposed. Draft B said the Express routes don't exist yet and
   asked me to design the contract. I designed it — see
   **`API_CONTRACT.md`** — and `useDatabaseSearch.js` is written against
   that proposed shape, not a confirmed live one.
2. **Phase 2 response shape.** Draft A gave a flat shape (`fen`,
   `piece_placement_field`, `theme_match_confidence`, ...). Draft B gave a
   richer, more specific shape (`best_effort_fields`, `orientation`,
   `squares[]`, `fen_validation_error`, ...) and said explicitly "you must
   use" it. I coded `useVisionParse.js` against Draft B's shape.

If Draft A is actually the current one, the fix is small (mostly in
`useVisionParse.js` and `App.jsx`'s `handleFile`) — just say so.

## Setup

```bash
npm install
cp .env.example .env   # fill in your two service URLs
npm run dev
```

**Stockfish binary isn't included** — I had no network access while
building this, so `public/stockfish/stockfish.js` and `.wasm` aren't
here. See `public/stockfish/README.md` for exactly what to drop in
(two files, free/permissive-licensed, no code changes needed after).

## What's real vs. what needs your next pass

| Piece | Status |
|---|---|
| Design system (tokens, Tailwind config, type pairing) | Done |
| chessground board wrapper + custom "stamp" piece set + bone/aubergine palette | Done |
| Low-confidence-square marking on the board itself | Done — via chessground's `highlight.custom` API |
| `useVisionParse` (Phase 2 integration) | Done, against Draft B's shape |
| `useDatabaseSearch` (Phase 1 integration) | Done, against the **proposed** contract in `API_CONTRACT.md` — needs your Express routes to actually exist |
| `useStockfish` + eval bar + depth slider | Logic done; needs the binary (see above) |
| Sandbox board editing (drag a piece → FEN updates) | **Stubbed** — `App.jsx`'s `handleMove` is a no-op with a comment explaining why: wiring chessground's post-drag state back into React state needs `cg.getFen()` read-back, which I left as the one deliberately incomplete piece rather than guess at chessground's exact instance API without being able to run it here |
| Move-sequence stepper on result cards | Done, assuming SAN move sequences (flagged as an open question for you in `API_CONTRACT.md`) |

## Design decisions worth knowing about

- **Palette**: aged ledger paper (`#e7ddc4`) + warm ink (`#1c1f1a`), with
  verdigris (oxidised copper, `#4f7566`) for live/found states and
  carmine (`#8a2f27`) reserved for corrections/warnings. Chose this over
  the two AI-default looks (warm-cream+terracotta, near-black+acid-green)
  deliberately — see comment at the top of `tokens.css`.
- **Board**: bone (`#ded1ae`) / aubergine-slate (`#4c4552`) — not
  green/brown.
- **Type**: Fraunces (slab-serif display) + Public Sans (body) + JetBrains
  Mono (FEN, coordinates, eval numbers).
- **Pieces**: a custom faceted "stamp" set (woodcut-style silhouettes),
  not Cburnett — see `src/components/Board/pieces/README.md` for the
  visual grammar.
- **Layout**: single dense workspace (board + eval + search rail all
  visible at once), no hero, no tabs/modals gating the core tool.
