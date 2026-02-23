const BLOCKED_PATTERNS = [
  // NSFW
  /\b(porn|xxx|onlyfans|nsfw|nude|hentai)\b/i,
  // Political
  /\b(maga|trump|biden|democrat|republican|liberal|conservative)\b/i,
  /\b(abortion|gun\s*control|immigration\s*ban)\b/i,
  // Scam signals
  /send\s+\d+\s*(sol|eth|btc)/i,
  /dm\s+me\s+(to|for)\s+(earn|make|win)/i,
  /guaranteed\s+(return|profit|gains)/i,
  /free\s+(airdrop|giveaway|mint)/i,
  /connect\s+wallet\s+to\s+claim/i,
  /validate\s+your?\s+wallet/i,
  // Slurs (broad catch)
  /\b(retard|faggot|nigger|kike|spic|tranny)\b/i,
];

function isTweetSafe(text) {
  if (!text) return false;
  return !BLOCKED_PATTERNS.some(pattern => pattern.test(text));
}

function isReplySafe(text) {
  if (!text) return false;
  return !BLOCKED_PATTERNS.some(pattern => pattern.test(text));
}

export { isTweetSafe, isReplySafe };
