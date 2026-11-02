const { ValidationError } = require('../errors/AppError');
const { LANGUAGES, FOCUS_AREAS } = require('../prompts/review.prompt');

/**
 * Validate and normalise the body of POST /api/v1/reviews.
 * Collects every problem (not just the first) so the UI can show them all at once.
 * @returns {{ code: string, language: string, focus: string[] }}
 */
function validateReviewRequest(body, { maxCodeChars }) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object.', [
      { field: 'body', message: 'Expected a JSON object.' },
    ]);
  }

  const { code, language, focus } = body;

  if (typeof code !== 'string' || code.trim() === '') {
    errors.push({ field: 'code', message: 'code is required and must be a non-empty string.' });
  } else if (code.length > maxCodeChars) {
    errors.push({ field: 'code', message: `code must be at most ${maxCodeChars} characters (got ${code.length}).` });
  }

  const normalisedLanguage = typeof language === 'string' ? language.trim().toLowerCase() : '';
  if (!LANGUAGES.includes(normalisedLanguage)) {
    errors.push({ field: 'language', message: `language must be one of: ${LANGUAGES.join(', ')}.` });
  }

  let normalisedFocus = [];
  if (focus !== undefined) {
    if (!Array.isArray(focus) || focus.some((f) => !FOCUS_AREAS.includes(f))) {
      errors.push({ field: 'focus', message: `focus must be an array containing only: ${FOCUS_AREAS.join(', ')}.` });
    } else {
      normalisedFocus = [...new Set(focus)];
    }
  }

  if (errors.length) throw new ValidationError('Invalid review request.', errors);

  return { code, language: normalisedLanguage, focus: normalisedFocus };
}

module.exports = { validateReviewRequest };
