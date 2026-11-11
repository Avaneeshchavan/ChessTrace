BEGIN;
ALTER TABLE compact_game ADD COLUMN movetext_hash bytea UNIQUE, ADD COLUMN source_id text;
CREATE UNLOGGED TABLE corpus_game_stage (
  hash text, "whiteName" text, "blackName" text, "whiteElo" int, "blackElo" int,
  "playedAt" timestamp, event text, result text, pgn text, gzip text,
  opening text, eco text, "startFen" text, "originalHash" text
);
CREATE UNLOGGED TABLE corpus_position_stage (
  key bigint, "gameId" int, ply smallint, "fenCore" text, vector text
);
COMMIT;
