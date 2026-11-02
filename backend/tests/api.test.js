const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, postJson, testConfig } = require('./helpers');
const { loadConfig } = require('../src/config');
const { LLMUnavailableError } = require('../src/errors/AppError');

test('HTTP API', async (t) => {
  const server = await startServer();
  t.after(server.close);
  const url = (p) => server.baseUrl + p;

  await t.test('GET /api/health', async () => {
    const res = await fetch(url('/api/health'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.provider, 'mock');
  });

  await t.test('GET /api/v1/languages', async () => {
    const body = await (await fetch(url('/api/v1/languages'))).json();
    assert.ok(body.data.includes('python'));
  });

  await t.test('POST /api/v1/reviews returns a review', async () => {
    const res = await postJson(url('/api/v1/reviews'), { code: 'var x = eval(input);', language: 'javascript' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.requestId, res.headers.get('x-request-id'));
    assert.equal(body.data.meta.provider, 'mock');
    assert.equal(body.data.review.issues[0].severity, 'critical');
    assert.equal(body.data.review.issues[0].line, 1);
  });

  await t.test('400 VALIDATION_ERROR with field details', async () => {
    const res = await postJson(url('/api/v1/reviews'), { code: '', language: 'klingon' });
    assert.equal(res.status, 400);
    const { error } = await res.json();
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.equal(error.retryable, false);
    assert.deepEqual(error.details.map((d) => d.field), ['code', 'language']);
  });

  await t.test('400 INVALID_JSON for a malformed body', async () => {
    const res = await postJson(url('/api/v1/reviews'), '{"code": ');
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_JSON');
  });

  await t.test('413 PAYLOAD_TOO_LARGE for huge bodies', async () => {
    const res = await postJson(url('/api/v1/reviews'), { code: 'a'.repeat(100_000), language: 'go' });
    assert.equal(res.status, 413);
    assert.equal((await res.json()).error.code, 'PAYLOAD_TOO_LARGE');
  });

  await t.test('404 NOT_FOUND in the standard error shape', async () => {
    const res = await fetch(url('/api/nope'));
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.ok(body.requestId);
  });

  await t.test('echoes a caller-provided request id', async () => {
    const res = await fetch(url('/api/health'), { headers: { 'X-Request-Id': 'abc-123' } });
    assert.equal(res.headers.get('x-request-id'), 'abc-123');
  });
});

test('LLM failures map to HTTP errors without leaking internals', async (t) => {
  const failing = {
    name: 'broken',
    generateJson: async () => {
      throw new LLMUnavailableError(undefined, { retryable: true });
    },
  };
  const crashing = {
    name: 'crash',
    generateJson: async () => {
      throw new Error('secret stack detail');
    },
  };

  for (const [provider, status, code] of [
    [failing, 503, 'LLM_UNAVAILABLE'],
    [crashing, 500, 'INTERNAL_ERROR'],
  ]) {
    const server = await startServer({ llmProvider: provider });
    t.after(server.close);
    const res = await postJson(server.baseUrl + '/api/v1/reviews', { code: 'x', language: 'go' });
    assert.equal(res.status, status);
    const { error } = await res.json();
    assert.equal(error.code, code);
    assert.doesNotMatch(error.message, /secret/);
  }
});

test('rate limiter returns 429 RATE_LIMITED', async (t) => {
  const server = await startServer({ config: testConfig({ RATE_LIMIT_MAX: '2' }) });
  t.after(server.close);
  const send = () => postJson(server.baseUrl + '/api/v1/reviews', { code: 'x', language: 'go' });
  await send();
  await send();
  const res = await send();
  assert.equal(res.status, 429);
  const { error } = await res.json();
  assert.equal(error.code, 'RATE_LIMITED');
  assert.equal(error.retryable, true);
});

test('config fails fast without a Gemini key', () => {
  assert.throws(() => loadConfig({ LLM_PROVIDER: 'gemini' }), /GEMINI_API_KEY/);
});
