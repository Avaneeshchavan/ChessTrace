import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as wait } from 'node:timers/promises';
import { configureRequestDrivenService, fetchService, serviceHealth, ServiceRequestInterruptedError } from './serviceRequest.js';

test('signup shares the first health check even when a sleeping server takes 15 seconds', async t => {
  const url = 'https://slow-start.example.invalid';
  const timeout = AbortSignal.timeout;
  t.mock.method(AbortSignal, 'timeout', milliseconds => timeout(milliseconds / 100));
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (target, options) => {
    requests.push(target);
    if (target === url + '/health') {
      await wait(150, undefined, { signal: options.signal });
      return Response.json({ status: 'ok' });
    }
    return Response.json({}, { status: 201 });
  });

  const [response] = await Promise.all([
    fetchService(url, '/api/auth/register', { method: 'POST' }, { timeoutMs: 20_000 }),
    serviceHealth(url).check(),
  ]);
  assert.equal(response.status, 201);
  assert.deepEqual(requests, [url + '/health', url + '/api/auth/register']);
});

test('a failed registration response is never replayed automatically', async t => {
  const url = 'https://interrupted-signup.example.invalid';
  const requests = [];
  t.mock.method(globalThis, 'fetch', async target => {
    requests.push(target);
    if (target === url + '/health') return Response.json({ status: 'ok' });
    return new Response(null, { status: 503 });
  });

  await assert.rejects(fetchService(url, '/api/auth/register', { method: 'POST' }), ServiceRequestInterruptedError);
  await serviceHealth(url).check();
  assert.deepEqual(requests, [url + '/health', url + '/api/auth/register', url + '/health']);
});

test('request-driven signup submits immediately without polling or replaying the POST', async t => {
  const url = 'https://request-driven.example.invalid';
  configureRequestDrivenService(url);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (target, options) => {
    requests.push([target, options.method]);
    return new Response(null, { status: 503 });
  });

  await serviceHealth(url).check();
  await assert.rejects(fetchService(url, '/api/auth/register', { method: 'POST' }), ServiceRequestInterruptedError);
  assert.deepEqual(requests, [[url + '/api/auth/register', 'POST']]);
});

test('classifies busy and server responses, reads Retry-After, and retries only safe requests', async t => {
  const url = 'https://classified.example.invalid';
  configureRequestDrivenService(url);
  const responses = [new Response(null, { status: 429, headers: { 'Retry-After': '4' } }),
    new Response(null, { status: 503 }), Response.json({ ok: true })];
  const methods = [];
  t.mock.method(globalThis, 'fetch', async (_, options) => {
    methods.push(options.method);
    return responses.shift();
  });
  await assert.rejects(fetchService(url, '/scan', { method: 'POST' }), { kind: 'busy', retryAfter: 4, status: 429 });
  assert.equal((await fetchService(url, '/search', { method: 'GET' })).status, 200);
  assert.deepEqual(methods, ['POST', 'GET', 'GET']);
});

test('classifies deadlines and preserves explicit cancellation without replaying the upload', async t => {
  const url = 'https://deadline.example.invalid';
  configureRequestDrivenService(url);
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (_, { signal }) => {
    requests.push(signal);
    await wait(1000, undefined, { signal });
  });
  await assert.rejects(fetchService(url, '/scan', { method: 'POST' }, { timeoutMs: 20 }), { kind: 'timeout' });
  const cancel = new AbortController();
  const request = fetchService(url, '/scan', { method: 'POST', signal: cancel.signal });
  cancel.abort();
  await assert.rejects(request, { name: 'AbortError' });
  assert.equal(requests.length, 2);
  assert.equal(serviceHealth(url).snapshot(), 'error');
});

test('429 and validation failures are classified without guessing service state', async t => {
  const url = 'https://invalid.example.invalid';
  configureRequestDrivenService(url);
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'Select a board image.' }, { status: 422 }));
  await assert.rejects(fetchService(url, '/scan', { method: 'POST' }), {
    kind: 'invalid', status: 422, message: 'Select a board image.',
  });
});

test('a health probe started before a failing request cannot clear its failure', async t => {
  const url = 'https://stale-health.example.invalid';
  configureRequestDrivenService(url);
  let resolveProbe;
  t.mock.method(globalThis, 'fetch', target => {
    if (target.endsWith('/health')) return new Promise(resolve => { resolveProbe = resolve; });
    return Promise.resolve(new Response(null, { status: 503 }));
  });
  const probe = serviceHealth(url).check(true);
  await assert.rejects(fetchService(url, '/scan', { method: 'POST' }), { kind: 'server' });
  resolveProbe(Response.json({ status: 'ok' }));
  await probe;
  assert.equal(serviceHealth(url).snapshot(), 'error');
});
