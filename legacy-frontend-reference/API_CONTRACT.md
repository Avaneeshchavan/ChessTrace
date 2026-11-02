# ChessTrace — Phase 1 Express API contract (proposed)

`src/hooks/useDatabaseSearch.js` is written against this contract. Nothing
here is live yet on your side (per your note) — this is the shape I need
implemented in Express, wrapping the existing `findExactMatch` /
`findSimilarPositions` Prisma functions. All routes are `GET`, all
responses are JSON, base path `VITE_BACKEND_API_URL`.

## `GET /api/search/exact`

**Query params**
| param     | type   | required | notes                                   |
|-----------|--------|----------|------------------------------------------|
| fenCore   | string | yes      | piece-placement + turn + castling only, no en-passant/clocks, per EXPLANATION.md §1 |

**200 response** — zero or more exact matches (usually 0 or 1, since fenCore
collapses to "the same position"; array for forward-compatibility if that
ever changes):

```json
{
  "matches": [
    {
      "positionId": "string",
      "gameId": "string",
      "plyNumber": 14,
      "players": { "white": "Kasparov, Garry", "black": "Karpov, Anatoly" },
      "event": "World Championship 1985",
      "year": 1985,
      "moveSequence": ["e4", "e5", "Nf3", "..."]
    }
  ]
}
```

**Empty case is a normal 200**, not a 404:
```json
{ "matches": [] }
```

## `GET /api/search/similar`

**Query params**
| param       | type   | required | default | notes |
|-------------|--------|----------|---------|-------|
| fenCore     | string | yes      | —       | server derives the 32-float structural vector from this, per §1 |
| limit       | int    | no       | 10      | max ANN results |
| maxDistance | float  | no       | none    | optional cutoff on the `<->` L2 distance, for callers that want to hide low-quality matches rather than showing "10 nearest regardless of how far" |

**200 response**, ordered nearest-first:

```json
{
  "matches": [
    {
      "positionId": "string",
      "gameId": "string",
      "plyNumber": 22,
      "distance": 0.0841,
      "players": { "white": "Tal, Mikhail", "black": "Botvinnik, Mikhail" },
      "event": "World Championship 1960",
      "year": 1960,
      "moveSequence": ["e4", "c5", "..."]
    }
  ]
}
```

`distance` is surfaced (not hidden) so the UI can show match strength
rather than implying false precision.

**"Similarity found results, exact found none" is the expected common
case** per EXPLANATION.md §1 — the frontend treats a populated
`/similar` response alongside an empty `/exact` response as a normal
result state, not a fallback/error.

## `GET /api/games/:gameId`

Used by the "step through this game's moves" UI once a result card is
expanded, so the frontend isn't forced to re-derive the full game from a
single position's `moveSequence` if you'd rather keep that array
truncated in the search responses for payload size.

**200 response**:
```json
{
  "gameId": "string",
  "players": { "white": "string", "black": "string" },
  "event": "string",
  "year": 1985,
  "moveSequence": ["e4", "e5", "Nf3", "Nc6", "..."],
  "result": "1-0"
}
```

## Error shape (all routes)

```json
{ "error": { "code": "INVALID_FEN_CORE", "message": "human-readable string" } }
```
with a 4xx status. The frontend distinguishes this from the empty-matches
case (which is always a 200) so a malformed board never silently renders
as "no games found."

## Open question for you to confirm

`moveSequence` — is this SAN ("Nf3"), or do you want to send UCI
("g1f3") and let the frontend format it? I've built `src/lib/fen.js` and
the result-card stepper assuming **SAN strings**, since chess.js (already
a frontend dependency for legality checks) parses SAN natively for
replay. If Phase 1 stores UCI internally, converting to SAN server-side
once at query time is cheaper than every client re-deriving it.
