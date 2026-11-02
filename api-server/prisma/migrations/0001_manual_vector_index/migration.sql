-- ChessTrace Phase 1: manual migration for pgvector.
--
-- Run this AFTER `npx prisma migrate dev` has created the Game/Position
-- tables. Prisma's schema DSL can declare a vector *column*
-- (Unsupported("vector(32)")) but cannot express an HNSW index with custom
-- build parameters, so we create that index by hand here.
--
-- On Neon free tier this requires no special setup — `vector` is available
-- as a pre-approved extension and CREATE EXTENSION works for the default role.

CREATE EXTENSION IF NOT EXISTS vector;

-- HNSW index on the structural similarity vector.
-- Distance operator: vector_l2_ops (Euclidean distance). We chose L2 over
-- cosine because our vector's dimensions are engineered, differently-scaled
-- features (occupancy codes, counts, material diff) rather than a direction-
-- only embedding — see EXPLANATION.md section 3 for the reasoning.
--
-- m = 16, ef_construction = 64 are pgvector's own defaults. At our scale
-- (1-5M rows, 32 dimensions) they are a reasonable starting point:
--   - m controls graph connectivity (higher = better recall, more memory)
--   - ef_construction controls build-time search effort (higher = better
--     graph quality, slower index builds)
-- Revisit only if recall/query-latency testing on real data says otherwise.
CREATE INDEX IF NOT EXISTS idx_position_vector_hnsw
  ON "Position" USING hnsw (vector vector_l2_ops)
  WITH (m = 16, ef_construction = 64);

-- Alternative considered and rejected for this phase (kept here for the
-- record — see EXPLANATION.md section 3 for the full tradeoff discussion):
--
-- CREATE INDEX idx_position_vector_ivfflat
--   ON "Position" USING ivfflat (vector vector_l2_ops)
--   WITH (lists = 100);
--
-- IVFFlat requires a representative sample of data to already be loaded
-- before the index is built (it clusters into `lists` buckets), and its
-- recall degrades as more data is inserted after that point without a
-- REINDEX. Since our ingestion script writes millions of rows over a single
-- run, HNSW's index-as-you-go behavior is a better operational fit.

-- Runtime search-quality knob for HNSW queries. Higher = better recall,
-- slower search. Applied per-session; set it in the search module before
-- running similarity queries (see src/search.js).
-- SET hnsw.ef_search = 40;
