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
    fetchService(url, '/api/auth/register', { method: 'POST' }),
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
