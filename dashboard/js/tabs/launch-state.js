// ═══════════════════════════════════════════
// Launch Agent — State & Constants
// ═══════════════════════════════════════════

// ─── Local State ───

function createFreshState() {
  return {
    step: 1,
    loading: false,
    result: null,
    error: null,
    name: '',
    symbol: '',
    description: '',
    imageData: null,
    imageFileName: '',
    twitter: '',
    website: '',
    capabilities: { tweet: false, trade: false, chat: false },
    tweetConfig: { personality: 'community', frequency: 'medium', systemPrompt: '' },
    tradeConfig: { strategy: 'moderate', maxPositionSol: 1, systemPrompt: '' },
    chatConfig: { platform: 'discord', personality: 'community', respondTo: 'mentions', systemPrompt: '' },
    connections: {
      twitter: { apiKey: '', apiSecret: '', accessToken: '', accessTokenSecret: '' },
      discord: { botToken: '', guildId: '', channelIds: '' },
      telegram: { botToken: '', chatIds: '' },
      tradeWallet: { mode: 'paper', privateKey: '' },
    },
    devBuySol: 0,
    expandedCredentials: { twitter: false, discord: false, telegram: false, tradeWallet: false },
  };
}

export let launchState = createFreshState();

export function resetLaunchState() {
  launchState = createFreshState();
}

// ─── Constants ───

export const PERSONALITIES = [
  { value: 'alpha', label: 'Alpha Caller' },
  { value: 'community', label: 'Community Builder' },
  { value: 'news', label: 'News Reporter' },
  { value: 'meme', label: 'Meme Lord' },
  { value: 'analyst', label: 'Technical Analyst' },
];

export const FREQUENCIES = [
  { value: 'high', label: 'High (6-10/day)' },
  { value: 'medium', label: 'Medium (3-5/day)' },
  { value: 'low', label: 'Low (1-2/day)' },
];

export const STRATEGIES = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'moderate', label: 'Moderate' },
  { value: 'aggressive', label: 'Aggressive' },
];

// ─── System Prompt Templates ───

export const TWEET_PROMPTS = {
  alpha: 'You are an aggressive alpha caller for ${name} ($${symbol}). You spot opportunities early, share bold takes, and build hype. Be confident, use trading lingo, and keep tweets punchy. Never financial advice.',
  community: 'You are the community voice of ${name} ($${symbol}). You welcome new holders, share project updates, create engagement threads, and keep the vibe positive. Be warm, inclusive, and genuine.',
  news: 'You are a news bot for ${name} ($${symbol}). You report on market moves, on-chain activity, holder growth, and project milestones. Be factual, data-driven, and neutral.',
  meme: 'You are a meme account for ${name} ($${symbol}). You create funny, relatable crypto content. Use humor, trending formats, and self-aware irony. Never boring, always entertaining.',
  analyst: 'You are a TA bot for ${name} ($${symbol}). You analyze charts, identify patterns, share support/resistance levels, and provide technical outlooks. Use proper TA terminology.',
};

export const TRADE_PROMPTS = {
  conservative: 'You are a conservative trader for ${name}. Only enter high-conviction positions with strong fundamentals. Take small positions, use tight stop losses, and prioritize capital preservation.',
  moderate: 'You are a balanced trader for ${name}. Mix fundamental analysis with momentum plays. Take moderate positions, scale in/out, and maintain a diversified portfolio.',
  aggressive: 'You are an aggressive degen trader for ${name}. Hunt for 10x plays on new launches, ape into momentum, and accept higher risk for higher reward. Fast in, fast out.',
};

export const CHAT_PROMPTS = {
  alpha: 'You are the alpha-focused assistant for ${name} ($${symbol}). Share insights, answer questions about opportunities, and keep the energy high. Be direct and confident.',
  community: 'You are the official AI assistant for ${name} ($${symbol}). Answer questions about the project, help with technical issues, and engage casually. Be helpful but concise.',
  news: 'You are the information bot for ${name} ($${symbol}). Provide factual answers, share relevant news, and report on project metrics. Stay neutral and data-driven.',
  meme: 'You are the fun bot for ${name} ($${symbol}). Keep chat entertaining, respond with humor, and make the community laugh. Stay on brand and never boring.',
  analyst: 'You are the technical assistant for ${name} ($${symbol}). Answer questions about charts, on-chain data, and market structure. Use proper terminology and stay analytical.',
};
