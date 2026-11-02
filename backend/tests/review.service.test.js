const test = require('node:test');
const assert = require('node:assert/strict');
const { ReviewService } = require('../src/services/review.service');
const { LLMResponseError } = require('../src/errors/AppError');

function fakeProvider(output) {
  const provider = {
    name: 'fake',
    lastArgs: null,
    async generateJson(args) {
      provider.lastArgs = args;
      return output;
    },
  };
  return provider;
}

const request = { code: 'line1\nline2\nline3', language: 'javascript', focus: ['security'] };

test('sends system prompt, delimited code and schema to the provider', async () => {
  const provider = fakeProvider({ summary: 's', overallScore: 7, issues: [], strengths: [] });
  await new ReviewService({ llmProvider: provider }).review(request);
  assert.match(provider.lastArgs.systemPrompt, /untrusted/);
  assert.match(provider.lastArgs.userPrompt, /<code>\nline1\nline2\nline3\n<\/code>/);
  assert.match(provider.lastArgs.userPrompt, /security/);
  assert.equal(provider.lastArgs.schema.type, 'object');
});

test('normalises and sorts model output', async () => {
  const provider = fakeProvider({
    summary: '  ok  ',
    overallScore: 14,
    issues: [
      { severity: 'minor', category: 'readability', line: 2, title: 'b', description: 'd', suggestion: 's' },
      { severity: 'weird', category: 'nope', line: 99, title: 'c' },
      { severity: 'critical', category: 'security', line: 3, title: 'a', description: 'd', suggestion: 's' },
      'garbage',
    ],
    strengths: ['good', 42, ''],
  });
  const { review, meta } = await new ReviewService({ llmProvider: provider }).review(request);

  assert.equal(review.summary, 'ok');
  assert.equal(review.overallScore, 10);
  assert.deepEqual(review.issues.map((i) => i.title), ['a', 'b', 'c']);
  assert.equal(review.issues[2].severity, 'info');
  assert.equal(review.issues[2].category, 'best-practice');
  assert.equal(review.issues[2].line, undefined, 'out-of-range line is dropped');
  assert.deepEqual(review.strengths, ['good']);
  assert.equal(meta.provider, 'fake');
  assert.equal(meta.language, 'javascript');
});

test('throws LLMResponseError when required fields are missing', async () => {
  const service = new ReviewService({ llmProvider: fakeProvider({ issues: 'nope' }) });
  await assert.rejects(service.review(request), LLMResponseError);
});
