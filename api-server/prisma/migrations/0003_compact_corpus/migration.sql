-- Requires pgvector 0.7 or newer. Legacy search tables remain available.
CREATE TABLE compact_game (
  game_id integer PRIMARY KEY REFERENCES "Game"(id) ON DELETE RESTRICT,
  pgn_hash bytea NOT NULL UNIQUE,
  pgn_gzip bytea,
  opening text,
  eco text,
  start_fen text
);

CREATE TABLE position_v2 (
  key bigint PRIMARY KEY,
  fen_core varchar(90) NOT NULL,
  games_count bigint NOT NULL CHECK (games_count > 0),
  vector halfvec(32)
);

CREATE TABLE position_game (
  key bigint NOT NULL REFERENCES position_v2(key) ON DELETE CASCADE,
  game_id integer NOT NULL REFERENCES compact_game(game_id) ON DELETE RESTRICT,
  ply smallint NOT NULL CHECK (ply > 0),
  PRIMARY KEY (key, game_id)
);

CREATE INDEX idx_position_v2_vector_hnsw
  ON position_v2 USING hnsw (vector halfvec_l2_ops) WHERE vector IS NOT NULL;

-- Metadata only. Old PGNs are retained and new PGNs use LZ4 where available.
-- The compact loader stores gzip in compact_game when LZ4 is unavailable.
DO $compression$
BEGIN
  IF current_setting('server_version_num')::int >= 140000 THEN
    BEGIN
      EXECUTE 'ALTER TABLE "Game" ALTER COLUMN pgn SET COMPRESSION lz4';
    EXCEPTION WHEN feature_not_supported THEN
      NULL;
    END;
  END IF;
END $compression$;
