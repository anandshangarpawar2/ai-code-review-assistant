process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiError } = require('@google/genai');
const { GeminiProvider } = require('../src/llm/GeminiProvider');

const args = { systemPrompt: 'sys', userPrompt: 'user', schema: { type: 'object' } };
const ok = (text) => ({ text, candidates: [{ finishReason: 'STOP' }] });
const apiError = (status) => new ApiError({ message: `status ${status}`, status });

/** Fake SDK client whose generateContent plays back the given results in order. */
function fakeClient(results) {
  const calls = [];
  return {
    calls,
    models: {
      async generateContent(req) {
        calls.push(req);
        const next = results.shift();
        if (typeof next === 'function') return next(req);
        if (next instanceof Error) throw next;
        return next;
      },
    },
  };
}

const provider = (client, opts = {}) =>
  new GeminiProvider({ model: 'gemini-test', timeoutMs: 1000, maxRetries: 2, client, ...opts });

test('returns parsed JSON and passes JSON-mode config', async () => {
  const client = fakeClient([ok('{"a":1}')]);
  assert.deepEqual(await provider(client).generateJson(args), { a: 1 });
  const { config, model, contents } = client.calls[0];
  assert.equal(model, 'gemini-test');
  assert.equal(contents, 'user');
  assert.equal(config.systemInstruction, 'sys');
  assert.equal(config.responseMimeType, 'application/json');
  assert.deepEqual(config.responseJsonSchema, { type: 'object' });
});

test('retries a transient 503 then succeeds', async () => {
  const client = fakeClient([apiError(503), ok('{"a":2}')]);
  assert.deepEqual(await provider(client).generateJson(args), { a: 2 });
  assert.equal(client.calls.length, 2);
});

test('gives up after maxRetries and surfaces LLM_RATE_LIMITED', async () => {
  const client = fakeClient([apiError(429), apiError(429), apiError(429)]);
  await assert.rejects(provider(client).generateJson(args), { code: 'LLM_RATE_LIMITED', statusCode: 429 });
  assert.equal(client.calls.length, 3);
});

test('does not retry an invalid API key', async () => {
  const client = fakeClient([apiError(401)]);
  await assert.rejects(provider(client).generateJson(args), { code: 'LLM_UNAVAILABLE', retryable: false });
  assert.equal(client.calls.length, 1);
});

test('maps blocked prompts and truncation to LLM_BAD_RESPONSE', async () => {
  await assert.rejects(
    provider(fakeClient([{ promptFeedback: { blockReason: 'SAFETY' } }])).generateJson(args),
    { code: 'LLM_BAD_RESPONSE' }
  );
  await assert.rejects(
    provider(fakeClient([{ text: '{"a"', candidates: [{ finishReason: 'MAX_TOKENS' }] }])).generateJson(args),
    { code: 'LLM_BAD_RESPONSE' }
  );
});

test('retries malformed JSON', async () => {
  const client = fakeClient([ok('not json'), ok('{"fixed":true}')]);
  assert.deepEqual(await provider(client).generateJson(args), { fixed: true });
});

test('times out a hanging call via the abort signal', async () => {
  const hang = (req) =>
    new Promise((_, reject) => {
      req.config.abortSignal.addEventListener('abort', () =>
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      );
    });
  await assert.rejects(provider(fakeClient([hang]), { timeoutMs: 20, maxRetries: 0 }).generateJson(args), {
    code: 'LLM_TIMEOUT',
    statusCode: 504,
  });
});
