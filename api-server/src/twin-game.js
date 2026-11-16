const { Chess } = require('chess.js');
const { Prisma } = require('@prisma/client');
const { fenCore, positionKey } = require('./compact-position');
const { gamePgn } = require('./compact-search');
const { storageProfile } = require('../config/storage');

const DEFAULT_THRESHOLD = 3;
const MAX_PLIES = 600;

function twinThreshold() {
  const value = process.env.TWIN_MIN_GAMES;
  return /^[1-9]\d{0,3}$/.test(value ?? '') ? Number(value) : DEFAULT_THRESHOLD;
}

function parseTwinGame(pgn) {
  if (typeof pgn !== 'string' || !pgn.trim() || pgn.length > 100_000) {
    throw new Error('Enter a single PGN game under 100,000 characters.');
  }
  const chess = new Chess();
  try { chess.loadPgn(pgn); }
  catch { throw new Error('The PGN could not be read. Check the moves and try again.'); }
  const variant = chess.getHeaders().Variant;
  if (variant && !['standard', 'chess', 'normal', 'classical'].includes(variant.toLowerCase())) {
    throw new Error('Twin Game supports standard chess.');
  }
  const history = chess.history({ verbose: true });
  if (!history.length || history.length > MAX_PLIES) {
    throw new Error(`Use a PGN with 1 to ${MAX_PLIES} half-moves.`);
  }
  return history;
}

function positionInput(history) {
  const root = history[0].before;
  // The corpus indexes post-move positions. Find starts via legal first moves.
  const openingPositions = new Chess(root).moves({ verbose: true }).map(move => move.after);
  return [...openingPositions.map(fen => [0, fen]), ...history.map(({ after }, index) => [index + 1, after])]
    .map(([ply, fen]) => ({ ply, core: fenCore(fen), key: String(positionKey(fen)) }));
}

async function queryTwinGame(prisma, input, threshold, profile, compact) {
  const occurrences = compact ? Prisma.sql`
    SELECT i.ply, pg.game_id, pg.ply::int AS corpus_ply
    FROM input i JOIN position_v2 p ON p.key = i.key AND p.fen_core = i.core
    JOIN position_game pg ON pg.key = p.key
    WHERE i.ply > 0 OR pg.ply = 1` : Prisma.sql`
    SELECT i.ply, p."gameId" AS game_id, p."halfMove" AS corpus_ply
    FROM input i JOIN "Position" p ON p."fenCore" = i.core
    WHERE i.ply > 0 OR p."halfMove" = 1`;
  const counts = compact ? Prisma.sql`
    SELECT i.ply, coalesce(p.games_count, 0)::int AS games
    FROM input i LEFT JOIN position_v2 p ON p.key = i.key AND p.fen_core = i.core WHERE i.ply > 0` : Prisma.sql`
    SELECT i.ply, count(DISTINCT o.game_id)::int AS games
    FROM input i LEFT JOIN matched o ON o.ply = i.ply WHERE i.ply > 0 GROUP BY i.ply`;
  const corpus = compact ? Prisma.sql`compact_game` : Prisma.sql`"Game"`;
  const compression = compact ? Prisma.sql`cg.pgn_gzip` : Prisma.sql`NULL::bytea`;
  const compactJoin = compact ? Prisma.sql`JOIN compact_game cg USING (game_id)` : Prisma.empty;

  return prisma.$queryRaw`
    WITH input AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(input)}::jsonb) AS i(ply int, core text, key bigint)
    ), matched AS MATERIALIZED (
      SELECT o.* FROM (${occurrences}) o WHERE o.ply > 0
    ), counts AS MATERIALIZED (${counts}), departure AS (
      SELECT coalesce(max(ply) FILTER (WHERE games >= ${threshold}), 0)::int AS ply FROM counts
    ), occurrences AS MATERIALIZED (
      SELECT * FROM matched
      UNION ALL
      SELECT o.* FROM (${occurrences}) o CROSS JOIN departure d WHERE o.ply = 0 AND d.ply = 0
    ), anchored AS (
      SELECT o.game_id, CASE WHEN d.ply = 0 THEN 0 ELSE min(o.corpus_ply)::int END AS anchor
      FROM departure d JOIN occurrences o ON o.ply = d.ply GROUP BY o.game_id, d.ply
    ), ranked AS (
      SELECT a.game_id, a.anchor, max(o.ply) AS deepest, count(DISTINCT o.ply) AS shared,
        g."whiteName", g."blackName", g.result, g."playedAt", g."whiteElo" + g."blackElo" AS rating
      FROM anchored a JOIN occurrences o USING (game_id) JOIN "Game" g ON g.id = a.game_id CROSS JOIN departure d
      WHERE o.ply = d.ply
        OR (o.ply < d.ply AND o.corpus_ply < a.anchor)
        OR (o.ply > d.ply AND o.corpus_ply > a.anchor)
      GROUP BY a.game_id, a.anchor, g.id
      ORDER BY deepest DESC, shared DESC, rating DESC NULLS LAST, g."playedAt" DESC NULLS LAST, g.id
      LIMIT ${profile.occurrenceCap}
    )
    SELECT (SELECT count(*)::int FROM ${corpus}) AS "corpusGames", d.ply AS departure,
      (SELECT jsonb_agg(jsonb_build_array(ply, games) ORDER BY ply) FROM counts) AS timeline,
      coalesce((SELECT games FROM counts WHERE ply = d.ply), 0)::int AS "anchorGames",
      (SELECT jsonb_agg(to_jsonb(sample) ORDER BY sample.deepest DESC, sample.shared DESC, sample.rating DESC NULLS LAST,
          sample."playedAt" DESC NULLS LAST, sample.game_id)
        FROM (
          SELECT r.*, g.pgn, encode(${compression}, 'base64') AS gzip
          FROM ranked r JOIN "Game" g ON g.id = r.game_id ${compactJoin}
        ) sample) AS candidates
    FROM departure d`;
}

function summarizeTwin(history, row, threshold, compact, profile) {
  const departure = row.departure;
  const root = history[0].before;
  const anchorCore = fenCore(departure ? history[departure - 1].after : root);
  const counts = new Map(row.timeline);
  const userMove = history[departure];
  const legalContinuations = new Set(userMove ? new Chess(userMove.before).moves({ verbose: true }).map(move => move.lan) : []);
  const variations = new Map();
  let twin = null;
  let replaySample = 0;
  for (const candidate of row.candidates ?? []) {
    let moves;
    try {
      const chess = new Chess();
      chess.loadPgn(gamePgn({ pgn: candidate.pgn, pgn_gzip: candidate.gzip && Buffer.from(candidate.gzip, 'base64') }));
      moves = chess.history({ verbose: true });
    } catch { continue; }
    if (!moves.length) continue;
    const anchor = departure ? candidate.anchor : 0;
    if (fenCore(moves[0].before) !== fenCore(root) && !departure) continue;
    if (anchor && (!moves[anchor - 1] || fenCore(moves[anchor - 1].after) !== anchorCore)) continue;
    replaySample++;
    const transposed = anchor !== departure || history.slice(0, departure).some((move, index) => move.lan !== moves[index]?.lan)
      || fenCore(moves[0].before) !== fenCore(root);
    if (!twin) twin = { gameId: candidate.game_id, whiteName: candidate.whiteName, blackName: candidate.blackName,
      halfMove: anchor, transposed, matchedThroughPly: candidate.deepest };
    const next = moves[anchor];
    if (!next || !legalContinuations.has(next.lan)) continue;
    const variation = variations.get(next.lan) ?? { san: next.san, lan: next.lan, games: 0, whiteWins: 0, draws: 0, blackWins: 0, other: 0 };
    variation.games++;
    const result = { '1-0': 'whiteWins', '1/2-1/2': 'draws', '0-1': 'blackWins' }[candidate.result] ?? 'other';
    variation[result]++;
    variations.set(next.lan, variation);
  }
  return {
    threshold, corpusGames: row.corpusGames, compact, indexedPlies: compact ? profile.maxPly : null,
    departurePly: departure, anchorGames: departure ? row.anchorGames : null, replaySample,
    timeline: history.map((move, index) => ({
      ply: index + 1, san: move.san, lan: move.lan, color: move.color, moveNumber: Number(move.before.split(' ')[5]),
      games: counts.get(index + 1) ?? 0,
    })),
    variations: [...variations.values()].sort((a, b) => b.games - a.games || a.lan.localeCompare(b.lan)),
    twin,
  };
}

async function analyzeTwinGame(prisma, history, { threshold = twinThreshold(), compact = process.env.USE_COMPACT_STORAGE === 'true' } = {}) {
  const profile = storageProfile();
  const [row] = await queryTwinGame(prisma, positionInput(history), threshold, profile, compact);
  return summarizeTwin(history, row, threshold, compact, profile);
}

module.exports = { DEFAULT_THRESHOLD, analyzeTwinGame, parseTwinGame, positionInput, queryTwinGame };
