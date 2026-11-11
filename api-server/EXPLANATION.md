# ChessTrace Phase 1 — Design Explanation

This explains *why* each piece is built the way it is. It assumes you know
PostgreSQL and Node well, but have never used pgvector or built a retrieval
system before.

## 1. Why fenCore, and why a separate structural vector

### The problem with matching on the full board

A FEN string encodes the whole board, whose turn it is, castling rights, an
en-passant square, and two move counters. If you hash the *entire* FEN and
look for exact matches, you can only ever find a position that is byte-for-
byte identical to the one you're searching for — including the halfmove
clock and fullmove number, which have nothing to do with whether two
positions represent "the same tactical idea."

So the first cut is `fenCore`: we drop the halfmove clock and fullmove
number (they only matter for the 50-move rule and move numbering, never for
"is this the same position"), and we also drop the en-passant target square
(it only matters for one narrow tactical detail — capturing en passant —
and keeping it would make two positions that are otherwise pixel-identical
fail to match just because a pawn happened to move two squares last turn).
What's left — piece placement, turn, castling rights — is exactly "the same
position, playable from here," which is what Tier 1 exact-match search
should mean.

### Why exact match still isn't enough

Even a perfect `fenCore` hash only finds positions that are *identical*.
But the interesting question in a tactics-pattern tool is usually "has this
kind of attack happened before," not "has this exact board happened
before." The same smothered-mate pattern, the same back-rank weakness, the
same exposed king with a rook and queen swinging in — these recur across
thousands of totally different games, with different pawn structures on
the other side of the board, different move orders, different piece
placements everywhere except the handful of squares that actually matter
to the attack. An exact hash will never connect any of those; every one of
them is a unique 64-square string.

This is why we need a second representation that only encodes the features
that matter to king safety and rough material state, and throws away
everything else. That's the structural vector.

### Why these specific features

A checkmating attack is fundamentally a local, king-relative phenomenon:
it depends on (a) what's physically around the king (can it move, is it
walled in by its own pieces), (b) whether its pawn cover is intact or has
been pushed/traded away, (c) how many attackers are converging on the
squares next to it versus how many defenders are covering those same
squares, and (d) roughly how much material each side has to throw at the
attack or defend with. Nothing else about the board — what's happening on
the other wing, exact piece placement three ranks away — changes whether
"this is a mating attack" in any first-order way. So the vector is built
from exactly those four ingredients: king-zone occupancy, pawn shield,
attacker/defender counts on the king zone, and material balance. See the
top of `src/vector.js` for the exact 32-slot layout.

This is a hand-engineered feature vector, not a learned embedding. That's
a deliberate, zero-budget-appropriate choice: it needs no training data, no
GPU, no model-serving infrastructure, and it's fully interpretable (you can
look at any 32 numbers and know exactly what they mean). The tradeoff is
that it will miss similarity along dimensions we didn't think to encode
(e.g. open-file pressure on a king that's still fully "boxed in" by pawns).
That's an acceptable phase-1 limitation, not an oversight — a learned
embedding is a natural upgrade path for a later phase once there's a
labeled dataset to train against.

### Why raw geometric attack detection instead of chess.js's move list

Two places (the vector's attacker/defender count, and the legality
checker's "is the side not to move in check" test) need to answer "does
color X attack square S," for an X that may not be whoever's turn it
nominally is. The obvious approach — temporarily set the FEN's turn field
to X and ask chess.js for legal moves — turns out to be actively wrong for
this project: chess.js validates any FEN it's given and refuses to
construct one where the side *not* to move is in check. Flipping the turn
field to check "is the other king attacked" makes exactly that happen
whenever the *original* side to move was legitimately in check (a normal,
common event — that's just what "giving check" is). So that approach
would throw on a large fraction of the sharpest, most tactically
interesting positions in the dataset — precisely the ones this project
exists to find. `src/attacks.js` instead implements a small, direct
geometric "does this piece type, moving this way, reach this square"
check with no notion of turn or check-legality to trip over.

## 2. Why pgvector, and how the vector column is stored

Postgres has no native vector type. The `pgvector` extension adds one
(`vector(n)`), plus operators for computing distance between two vectors
(`<->` for Euclidean/L2, `<=>` for cosine, `<#>` for negative inner
product) and index types that make nearest-neighbor search on that column
fast instead of a full table scan.

Prisma doesn't have first-class support for pgvector as of this writing.
We use its `Unsupported("vector(32)")` escape hatch to declare the column
so `prisma migrate` creates it correctly, but Prisma deliberately does not
let you read or write `Unsupported` columns through the normal query API
(`create`, `createMany`, `findMany` `where` filters, etc.) — there's no
type-safe way for it to represent a pgvector value in TypeScript. That's
why every place that touches the vector column (`src/search.js`'s
similarity query, `scripts/ingest.js`'s bulk insert) goes through
`prisma.$queryRawUnsafe` / `prisma.$executeRawUnsafe` with parameterized
values, never the generated model methods.

## 3. Two-tier search: why hash + ANN, and which ANN index

**Tier 1 (`findExactMatch`)**: a Postgres hash index on `fenCore`. Hash
indexes only support `=` comparisons, but that's exactly what we need for
"has this exact position occurred before" — and a hash index is smaller
and marginally faster to build/query for pure equality than a btree, which
carries range-query capability we'll never use here.

**Tier 2 (`findSimilarPositions`)**: pgvector approximate nearest-neighbor
(ANN) search over the 32-dimensional structural vector. "Approximate"
matters here: an *exact* nearest-neighbor search means computing the
distance from your query vector to every single stored vector and sorting
— which is a full table scan, and gets slow once you have millions of
rows. An ANN index instead pre-builds a data structure that lets it find
"probably one of the closest few" vectors by only examining a small
fraction of the table, trading a small amount of recall (occasionally
missing the true single closest match) for a large speedup.

pgvector ships two ANN index types:

- **IVFFlat** clusters all vectors into `lists` buckets (like k-means) at
  index-build time, then a query only searches the handful of buckets
  closest to the query vector. It's cheap to build and memory-light, but
  it needs a *representative sample of the data already loaded* before you
  build it (the clustering is only as good as the sample it saw), and its
  recall quietly degrades as you insert more data after that point without
  periodically rebuilding the index.
- **HNSW** (Hierarchical Navigable Small World) builds a multi-layer graph
  where nearby vectors are linked, and a query walks the graph toward the
  nearest match. It generally gives better recall at a given speed than
  IVFFlat, needs no representative-sample step, and — importantly for
  us — handles incremental inserts gracefully, since new vectors are just
  added into the existing graph rather than needing a rebuild.

We chose **HNSW** for this project specifically because the ingestion
script writes millions of rows incrementally over one long-running
process, not from a single bulk-loaded, already-complete dataset. IVFFlat
would mean either building the index only after all data is loaded (fine
for a one-shot batch load, but awkward if we ever want to ingest more
games later and keep search accuracy up) or accepting degrading recall as
new games are added. HNSW's tradeoff is a heavier index build (more CPU
and memory at insert time) — at our stated scale (1-5 million rows, 32
dimensions), this is a reasonable and well-supported tradeoff; it is not
the "70 million rows on a full engine" scale where HNSW's memory footprint
would become a genuine capacity-planning problem on free-tier hosting.

One real free-tier caution worth flagging explicitly, not glossing over:
Neon's free tier has a limited compute/storage allowance, and HNSW indexes
are held substantially in memory for fast search. If ingestion or query
performance degrades noticeably as the dataset grows toward the high end
of the stated 1-5M range, the mitigation path is (a) lower the `m`
parameter in the index (trades some recall for memory), (b) shard the
dataset (e.g. only index master games above a certain year or Elo), or (c)
fall back to IVFFlat, which is lighter at rest at the cost of the
incremental-insert tradeoff described above. We call this out here rather
than presenting HNSW as risk-free, because "starts working, degrades
silently as data grows" is exactly the kind of problem that's cheap to
avoid by writing it down now and expensive to debug later.

`prisma/migrations/0001_manual_vector_index/migration.sql` creates the
HNSW index with pgvector's own defaults (`m = 16, ef_construction = 64`),
which are reasonable starting points rather than tuned values — tune them
only after measuring real recall/latency on your actual dataset, not
speculatively.

## 4. Bulk ingestion and deduplication

Prisma cannot write the unsupported pgvector field through its normal model API.
The ingester passes parameterized JSON batches to Postgres and casts vector
values on insert. A transaction commits the games and their positions together.
An advisory lock serializes cooperating ingesters targeting the same schema.
Matching PGN records reuse the existing game ID; existing half-moves are skipped
and missing ones are filled. The ingester does not rewrite historical rows.

## 5. Bounded streaming and resume

The ingester streams an uncompressed PGN by game, with a 2 MiB game-size guard.
Defaults are 25 games per transaction and 4,000 positions per insert. The atomic
checkpoint advances after each successful batch, recording a game ordinal. A
resume reads and skips the committed prefix without replaying its moves. If the
database commits before the checkpoint is saved, replaying that batch is safe.
See [DATA.md](../docs/DATA.md) for commands and filtering.

## 6. Why the legality checker doesn't attempt full reachability

"Is this FEN reachable from the starting position via a sequence of legal
moves" is a much harder question than "is this FEN internally consistent."
Answering it in general requires something like retrograde analysis —
reasoning backward about what sequence of moves could have produced this
exact arrangement — which for arbitrary positions has no known efficient
general algorithm and is the subject of specialized "retrograde chess
problem" solvers built for one hand-picked position at a time, not
something you can run at the scale of validating arbitrary input FENs.
`checkSyntacticLegality` in `src/legality.js` therefore checks only
necessary conditions for legality (piece counts, king counts, pawn
placement, castling-rights consistency, side-not-to-move not in check) —
conditions that every legally-reachable position must satisfy, but that a
carefully hand-constructed illegal position could also happen to satisfy.
This is stated directly in the code comments so it's never mistaken for a
stronger guarantee: a `true` result means "not obviously broken," not
"verified as a legal game position."
