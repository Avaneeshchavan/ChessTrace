import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const fen = process.env.VERIFY_FEN
  || 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const statuses = [502, 503, 504];

function origin(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) {
    throw new Error('Use an HTTPS deployment URL or a local loopback address.');
  }
  return url.origin;
}

async function main() {
  if (!process.argv[2] || !process.env.API_URL || !process.env.VISION_URL) {
    throw new Error('Usage: API_URL=<api origin> VISION_URL=<vision origin> node scripts/verify-deploy.mjs <frontend origin>');
  }
  const frontend = origin(process.argv[2]);
  const api = origin(process.env.API_URL);
  const vision = origin(process.env.VISION_URL);

  async function request(base, path, options = {}) {
    return fetch(base + path, { redirect: 'error', ...options, signal: AbortSignal.timeout(30_000) });
  }

  async function warm(base, label) {
    const deadline = Date.now() + 90_000;
    do {
      try {
        const response = await request(base, '/health');
        if (!statuses.includes(response.status) && response.ok && (await response.json()).status === 'ok') {
          console.log(`PASS ${label} health`);
          return;
        }
      } catch {
        // A sleeping service may return a proxy page or time out.
      }
      await new Promise(resolve => setTimeout(resolve, 2500));
    } while (Date.now() < deadline);
    throw new Error(`${label} did not become ready.`);
  }

  async function json(base, path, { method = 'GET', body, token, status = 200 } = {}) {
    const headers = { Origin: frontend };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body && !(body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    const response = await request(base, path, { method, headers, body });
    assert.equal(response.status, status, `${method} ${path} returned HTTP ${response.status}`);
    assert.equal(response.headers.get('access-control-allow-origin'), frontend, `CORS for ${path}`);
    return response.json();
  }

  for (const path of ['/lens', '/vault']) {
    const response = await request(frontend, path);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /id="root"/);
    console.log(`PASS deep link ${path}`);
  }
  const wasm = await request(frontend, '/stockfish/stockfish.wasm', { method: 'HEAD' });
  assert.equal(wasm.status, 200);
  assert.match(wasm.headers.get('content-type') || '', /^application\/wasm\b/);
  assert.match(wasm.headers.get('cache-control') || '', /max-age=[1-9]/);
  console.log('PASS Stockfish WASM MIME and caching');

  await Promise.all([warm(api, 'API'), warm(vision, 'vision')]);
  for (const [base, path, headers] of [[api, '/api/vault', 'authorization,content-type'], [vision, '/parse-screenshot', 'content-type']]) {
    const response = await request(base, path, { method: 'OPTIONS', headers: {
      Origin: frontend, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': headers,
    } });
    assert.ok(response.ok, `Preflight ${path}`);
    assert.equal(response.headers.get('access-control-allow-origin'), frontend);
    assert.match(response.headers.get('access-control-allow-methods') || '', /POST/i);
    for (const header of headers.split(',')) {
      assert.ok(response.headers.get('access-control-allow-headers')?.toLowerCase().includes(header));
    }
    console.log(`PASS preflight ${path}`);
  }

  const query = new URLSearchParams({ fen });
  const exact = await json(api, '/api/search?' + query);
  assert.equal(exact.matchType, 'exact');
  assert.ok(exact.matches.length);
  console.log('PASS exact search');
  const similar = await json(api, '/api/search/similar?' + query);
  assert.ok(similar.matches.length);
  console.log('PASS similarity search');
  const gameId = exact.matches[0].gameId ?? exact.matches[0].game?.id;
  const replay = await json(api, '/api/search/games/' + gameId);
  assert.ok(replay.pgn?.trim());
  console.log('PASS replay fetch');

  const fixture = await readFile(new URL('../client-ui/public/synthetic_chesscom_neo.png', import.meta.url));
  const image = new FormData();
  image.set('file', new Blob([fixture], { type: 'image/png' }), 'synthetic-board.png');
  const detected = await json(vision, '/parse-screenshot', { method: 'POST', body: image });
  assert.equal(detected.squares.length, 64);
  assert.ok(detected.fen);
  console.log('PASS synthetic screenshot parse');

  const credentials = { email: `deploy-${randomUUID()}@example.invalid`, password: randomUUID() + 'aA1!' };
  const registered = await json(api, '/api/auth/register', { method: 'POST', body: {
    ...credentials, displayName: 'Deployment probe',
  }, status: 201 });
  const loggedIn = await json(api, '/api/auth/login', { method: 'POST', body: credentials });
  assert.ok(loggedIn.token);
  assert.equal(registered.user.id, loggedIn.user.id);
  console.log('PASS register and login');

  const saved = await json(api, '/api/vault', { method: 'POST', token: loggedIn.token, body: { fen }, status: 201 });
  assert.ok(saved.puzzle.id);
  console.log('PASS save puzzle');
  const due = await json(api, '/api/vault/review-queue', { token: loggedIn.token });
  assert.ok(due.queue.some(puzzle => puzzle.id === saved.puzzle.id));
  console.log('PASS due queue');
}

main().catch(error => {
  console.error('FAIL', error.message);
  process.exitCode = 1;
});
