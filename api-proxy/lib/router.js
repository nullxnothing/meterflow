const CODE_PATTERNS = /\b(function|const |let |var |import |export |class |def |async |await |return |console\.|\.map\(|\.filter\(|=>|```|typescript|javascript|python|rust|solidity)\b/i;
const MATH_PATTERNS = /\b(calculate|prove|equation|algorithm|optimize|mathematical|theorem|integral|derivative|probability)\b/i;
const CREATIVE_PATTERNS = /\b(write a poem|story|creative|imagine|brainstorm|fiction|narrative|metaphor|poetic)\b/i;
const ANALYSIS_PATTERNS = /\b(analyze|compare|evaluate|research|summarize|breakdown|assessment|audit|review|investigate)\b/i;

const CLAUDE_SONNET = 'claude-sonnet-4-6';
const GEMINI_FLASH = 'gemini-2.5-flash';
const GEMINI_PRO = 'gemini-2.5-pro';

export function detectOptimalModel(prompt, tierModels) {
  const text = typeof prompt === 'string'
    ? prompt
    : (prompt || []).map(m => m.content || '').join(' ');

  if (CODE_PATTERNS.test(text) || MATH_PATTERNS.test(text)) {
    const model = CLAUDE_SONNET;
    if (tierModels.includes(model)) {
      return { model, reason: 'Code/logic detected — routed to Claude for structured reasoning' };
    }
  }

  if (ANALYSIS_PATTERNS.test(text)) {
    const model = tierModels.includes(GEMINI_PRO) ? GEMINI_PRO : CLAUDE_SONNET;
    if (tierModels.includes(model)) {
      return { model, reason: 'Analysis task detected — routed to best available analytical model' };
    }
  }

  if (CREATIVE_PATTERNS.test(text)) {
    const model = GEMINI_FLASH;
    if (tierModels.includes(model)) {
      return { model, reason: 'Creative task detected — routed to Gemini for fast creative output' };
    }
  }

  const fallback = tierModels.includes(GEMINI_FLASH) ? GEMINI_FLASH : tierModels[0];
  return { model: fallback, reason: 'General query — routed to fastest available model' };
}
