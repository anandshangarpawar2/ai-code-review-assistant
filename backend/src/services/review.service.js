const { LLMResponseError } = require('../errors/AppError');
const {
  SYSTEM_PROMPT,
  REVIEW_SCHEMA,
  SEVERITIES,
  CATEGORIES,
  buildUserPrompt,
} = require('../prompts/review.prompt');

const SEVERITY_RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));
const MAX_ISSUES = 50;
const MAX_TEXT = 2000;

const clip = (s) => String(s).trim().slice(0, MAX_TEXT);

/**
 * Business logic for code reviews. Knows nothing about HTTP or about Gemini:
 * it depends only on the LLMProvider interface, injected through the constructor.
 */
class ReviewService {
  /** @param {{ llmProvider: import('../llm/LLMProvider').LLMProvider }} deps */
  constructor({ llmProvider }) {
    this.llm = llmProvider;
  }

  /**
   * @param {{ code: string, language: string, focus: string[] }} request  already validated
   */
  async review(request) {
    const startedAt = Date.now();

    const raw = await this.llm.generateJson({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt: buildUserPrompt(request),
      schema: REVIEW_SCHEMA,
    });

    const lineCount = request.code.split('\n').length;
    const review = this.#normalise(raw, lineCount);

    return {
      review,
      meta: {
        provider: this.llm.name,
        language: request.language,
        latencyMs: Date.now() - startedAt,
        reviewedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Never trust LLM output: even in JSON mode the model can drift from the schema.
   * Required fields must be present and well-typed (else 502); unknown enum values,
   * out-of-range lines and over-long text are repaired rather than rejected.
   */
  #normalise(raw, lineCount) {
    if (!raw || typeof raw !== 'object' || typeof raw.summary !== 'string' || !Array.isArray(raw.issues)) {
      throw new LLMResponseError('The AI response did not match the expected format.');
    }

    const score = Math.round(Number(raw.overallScore));
    const issues = raw.issues
      .filter((it) => it && typeof it === 'object' && typeof it.title === 'string')
      .slice(0, MAX_ISSUES)
      .map((it) => {
        const issue = {
          severity: SEVERITIES.includes(it.severity) ? it.severity : 'info',
          category: CATEGORIES.includes(it.category) ? it.category : 'best-practice',
          title: clip(it.title),
          description: clip(it.description ?? ''),
          suggestion: clip(it.suggestion ?? ''),
        };
        const line = Number(it.line);
        if (Number.isInteger(line) && line >= 1 && line <= lineCount) issue.line = line;
        return issue;
      })
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || (a.line ?? 0) - (b.line ?? 0));

    return {
      summary: clip(raw.summary),
      overallScore: Number.isFinite(score) ? Math.min(10, Math.max(1, score)) : 5,
      issues,
      strengths: Array.isArray(raw.strengths)
        ? raw.strengths.filter((s) => typeof s === 'string' && s.trim()).slice(0, 10).map(clip)
        : [],
    };
  }
}

module.exports = { ReviewService };
