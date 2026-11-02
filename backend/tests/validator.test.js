const test = require('node:test');
const assert = require('node:assert/strict');
const { validateReviewRequest } = require('../src/validators/review.validator');
const { ValidationError } = require('../src/errors/AppError');

const limits = { maxCodeChars: 50 };

test('accepts a valid request and normalises language and focus', () => {
  const out = validateReviewRequest({ code: 'let a = 1;', language: ' JavaScript ', focus: ['bugs', 'bugs'] }, limits);
  assert.deepEqual(out, { code: 'let a = 1;', language: 'javascript', focus: ['bugs'] });
});

test('defaults focus to an empty list', () => {
  assert.deepEqual(validateReviewRequest({ code: 'x', language: 'python' }, limits).focus, []);
});

test('reports every invalid field at once', () => {
  assert.throws(
    () => validateReviewRequest({ code: '   ', language: 'cobol', focus: ['style'] }, limits),
    (err) => {
      assert.ok(err instanceof ValidationError);
      assert.equal(err.statusCode, 400);
      assert.deepEqual(err.details.map((d) => d.field), ['code', 'language', 'focus']);
      return true;
    }
  );
});

test('rejects code over the character limit', () => {
  assert.throws(() => validateReviewRequest({ code: 'a'.repeat(51), language: 'go' }, limits), /Invalid review request/);
});

test('rejects non-object bodies', () => {
  for (const body of [null, [], 'code']) {
    assert.throws(() => validateReviewRequest(body, limits), ValidationError);
  }
});
