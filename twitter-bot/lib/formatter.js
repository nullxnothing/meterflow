const MAX_TWEET_LENGTH = 280;

function extractCompleteSentences(text) {
  const sentences = text.match(/[^.!?]*[.!?]+/g);
  if (!sentences) return null;
  return sentences
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .join(' ')
    .trim();
}

function formatReply(text) {
  if (!text) return null;

  let body = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[""]/g, '')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Ensure we have complete sentences
  const complete = extractCompleteSentences(body);
  if (!complete || complete.length < 30) return null;

  // If it fits, use as-is
  if (complete.length <= MAX_TWEET_LENGTH) {
    return complete;
  }

  // Trim to fit by removing sentences from the end
  const sentences = complete.match(/[^.!?]*[.!?]+/g);
  if (sentences) {
    let trimmed = '';
    for (const s of sentences) {
      const candidate = (trimmed + s).trim();
      if (candidate.length <= MAX_TWEET_LENGTH) {
        trimmed += s;
      } else {
        break;
      }
    }
    if (trimmed.trim().length >= 30) {
      return trimmed.trim();
    }
  }

  return null;
}

export { formatReply, MAX_TWEET_LENGTH };
