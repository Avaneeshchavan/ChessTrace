import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

export const user = { id: 'fixture-user', email: 'fixture@example.test', displayName: 'Mobile tester', createdAt: '2026-01-01' };
const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const pgn = '1. f3 e5 2. g4 Qh4# 0-1';
const squares = [...'rnbqkbnrpppppppp................................PPPPPPPPRNBQKBNR']
  .map((piece, i) => ({
    square: 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8)),
    piece: piece === '.' ? null : (piece === piece.toUpperCase() ? 'w' : 'b') + piece.toUpperCase(),
    needs_review: i === 52,
    confidence: i === 52 ? .72 : 1,
  }));
const puzzle = { id: 'fixture-puzzle', fen, initialMove: 'f3', solutionPgn: '1. e4', tags: [], nextReviewAt: '2026-01-01', createdAt: '2026-01-01' };
const game = { id: 'fixture-game', whiteName: 'Test White', blackName: 'Test Black', event: 'Test match', result: '0-1' };
const contentTypes = {
  '.html': 'text/html', '.js': 'application/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.css': 'text/css', '.wasm': 'application/wasm', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

function start(port, handler) {
  const server = createServer(handler);
  return new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(port, 'localhost', () => done(server));
  });
}

export async function startMobileFixture({ dist = 'client-ui/dist', baseline, apiPort = 5001, visionPort = 8000 } = {}) {
  const requests = [];
  let updatedWorker = false;
  async function api(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
    const path = new URL(req.url, 'http://localhost').pathname;
    const buffers = [];
    for await (const part of req) buffers.push(part);
    const body = Buffer.concat(buffers);
    requests.push({ path, method: req.method, body });
    const routes = {
      'GET /health': { status: 'ok' },
      'POST /api/auth/login': { token: 'mobile-fixture', user },
      'POST /parse-screenshot': { fen, orientation: 'white_bottom', theme_match_confidence: .98, squares },
      'GET /api/search': { matchType: 'exact', matches: [{ id: 'match', gameId: game.id, halfMove: 1, game }] },
      'GET /api/search/games/fixture-game': { pgn },
      'GET /api/dashboard/summary': { stats: {}, streak: 0, heatmap: [], recentActivity: [] },
      'POST /api/dashboard/activity': {},
      'GET /api/users/me/summary': { ...user, memberSince: user.createdAt, totalPuzzlesSaved: 1, currentStreakDays: 0 },
      'GET /api/vault': { puzzles: [puzzle] },
      'GET /api/vault/review-stats': { weeks: [], dueNow: 1 },
      'GET /api/vault/review-queue': { queue: [puzzle] },
      'POST /api/vault': puzzle,
      'POST /api/vault/fixture-puzzle/review': { ...puzzle, repetitions: 1 },
    };
    const data = routes[req.method + ' ' + path];
    res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' }).end(JSON.stringify(data ?? { error: 'Missing fixture' }));
  }

  function staticFiles(directory) {
    const root = resolve(directory);
    return async (req, res) => {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (pathname.startsWith('/api/') || pathname === '/parse-screenshot') return api(req, res);
      if (pathname === '/share-image') requests.push({ path: pathname, method: req.method });
      if (req.method !== 'GET') { res.writeHead(405).end(); return; }
      if (pathname === '/fixture-session.html') { res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Test session</title>'); return; }
      const path = resolve(root, '.' + pathname);
      if (path !== root && !path.startsWith(root + '/')) { res.writeHead(404).end(); return; }
      const file = extname(path) ? path : resolve(root, 'index.html');
      try {
        let data = await readFile(file);
        if (updatedWorker && pathname === '/sw.js') {
          data = data.toString().replace(/"version":"[^"]+"/, '"version":"fixture-update"');
        }
        res.writeHead(200, { 'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
        res.end(data);
      } catch {
        res.writeHead(404).end();
      }
    };
  }

  const servers = [];
  try {
    if (apiPort) servers.push(await start(apiPort, api));
    if (visionPort && visionPort !== apiPort) servers.push(await start(visionPort, api));
    servers.push(await start(0, staticFiles(dist)));
    if (baseline) servers.push(await start(0, staticFiles(baseline)));
  } catch (error) {
    servers.forEach(server => server.close());
    throw error;
  }
  const url = server => 'http://localhost:' + server.address().port;
  const frontendIndex = Number(Boolean(apiPort)) + Number(Boolean(visionPort && visionPort !== apiPort));
  return {
    origin: url(servers[frontendIndex]),
    baselineOrigin: baseline ? url(servers[frontendIndex + 1]) : undefined,
    requests,
    updateWorker: () => { updatedWorker = true; },
    close: () => servers.forEach(server => server.close()),
  };
}
