const { Chess } = require('chess.js');

const MOVE_UCI = /^[a-h][1-8][a-h][1-8][qrbn]?$/;
const MAX_EVAL_LOSS = 100_000;
const MAX_ATTEMPT_MILLIS = 86_400_000;
const DEFAULT_TOLERANCE = 50;

function attemptTolerance() {
  const value = process.env.PUZZLE_TOLERANCE_CP;
  return /^\d{1,3}$/.test(value ?? '') ? Number(value) : DEFAULT_TOLERANCE;
}

function savedSolution(puzzle) {
  if (!puzzle.solutionPgn || puzzle.solutionPgn.length > 100_000) return null;
  try {
    const root = new Chess(puzzle.fen);
    // The stored position is authoritative for both generated PGN and legacy movetext.
    const movetext = puzzle.solutionPgn.trimStart().replace(/^(?:\[[^\r\n]*\]\s*)+/, '');
    const chess = new Chess();
    chess.loadPgn(`[SetUp "1"]\n[FEN "${root.fen()}"]\n\n${movetext}`);
    const history = chess.history({ verbose: true });
    if (!history.length) return null;
    const mateIndex = history.findIndex(move => move.color === history[0].color && move.san.endsWith('#'));
    return {
      moves: history.map(({ lan, san, after }) => ({ lan, san, after })),
      mateIn: puzzle.mateIn ?? (mateIndex < 0 ? null : Math.floor(mateIndex / 2) + 1),
    };
  } catch {
    return null;
  }
}

function legalAttempt(fen, uci) {
  if (typeof uci !== 'string' || !MOVE_UCI.test(uci)) return false;
  try {
    const chess = new Chess(fen);
    return chess.moves({ verbose: true }).some(move => move.lan === uci);
  } catch {
    return false;
  }
}

function weeklyRates(entries) {
  const buckets = new Map();
  for (const { createdAt, motifs, correct } of entries) {
    const weekStart = new Date(createdAt);
    weekStart.setUTCDate(weekStart.getUTCDate() - (weekStart.getUTCDay() + 6) % 7);
    const week = weekStart.toISOString().slice(0, 10);
    for (const motif of new Set(motifs)) {
      const key = JSON.stringify([motif, week]);
      const bucket = buckets.get(key) ?? { motif, week, solved: 0, attempts: 0 };
      bucket.attempts++;
      if (correct) bucket.solved++;
      buckets.set(key, bucket);
    }
  }
  return [...buckets.values()].sort((a, b) => a.week.localeCompare(b.week));
}

module.exports = { attemptTolerance, legalAttempt, savedSolution, weeklyRates, MAX_ATTEMPT_MILLIS, MAX_EVAL_LOSS };
