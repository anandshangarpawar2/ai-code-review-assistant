const { LLMProvider } = require('./LLMProvider');

/**
 * Deterministic, offline LLMProvider.
 * Used by the test suite and for demos when no API key is available
 * (LLM_PROVIDER=mock). It applies a few simple heuristics so the output
 * looks realistic and changes with the input.
 */
class MockProvider extends LLMProvider {
  get name() {
    return 'mock';
  }

  async generateJson({ userPrompt }) {
    const issues = [];
    // Only look at the submitted code so line numbers match what the user sees.
    const code = userPrompt.match(/<code>\n([\s\S]*)\n<\/code>/)?.[1] ?? userPrompt;
    const lines = code.split('\n');

    lines.forEach((line, i) => {
      if (/\beval\s*\(/.test(line)) {
        issues.push({
          severity: 'critical',
          category: 'security',
          line: i + 1,
          title: 'Use of eval()',
          description: 'eval() executes arbitrary strings as code and is a common injection vector.',
          suggestion: 'Parse the data explicitly (e.g. JSON.parse) or use a lookup table instead of eval().',
        });
      }
      if (/console\.log\(/.test(line)) {
        issues.push({
          severity: 'minor',
          category: 'best-practice',
          line: i + 1,
          title: 'Leftover console.log',
          description: 'Debug logging left in code adds noise to production logs.',
          suggestion: 'Remove it or use a proper logger with levels.',
        });
      }
      if (/\bvar\s+/.test(line)) {
        issues.push({
          severity: 'minor',
          category: 'readability',
          line: i + 1,
          title: 'var declaration',
          description: '`var` is function-scoped and hoisted, which can cause subtle bugs.',
          suggestion: 'Use `const` (or `let` if reassigned).',
        });
      }
    });

    const penalty = issues.reduce((sum, it) => sum + (it.severity === 'critical' ? 4 : 1), 0);

    return {
      summary: issues.length
        ? `Found ${issues.length} issue(s). This is a mock review generated without calling an LLM.`
        : 'No obvious issues found. This is a mock review generated without calling an LLM.',
      overallScore: Math.max(1, 10 - penalty),
      issues,
      strengths: ['Code is short and focused.'],
    };
  }
}

module.exports = { MockProvider };
