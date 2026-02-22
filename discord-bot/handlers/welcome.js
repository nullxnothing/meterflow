import { BOT_CONFIG } from '../config.js';

async function handleMemberJoin(member) {
  if (!BOT_CONFIG.WELCOME_CHANNEL) return;

  try {
    const channel = await member.guild.channels.fetch(BOT_CONFIG.WELCOME_CHANNEL);
    if (!channel) return;

    await channel.send(
      `Welcome **${member.user.username}**\n\n` +
      `INFINITE is token-gated AI access on Solana. Hold $INFINITE to unlock Claude, Gemini, and GPT APIs funded by creator fees — no subscriptions.\n\n` +
      `**Get started:**\n` +
      `1. Buy $INFINITE on [pump.fun](https://pump.fun) or [Jupiter](https://jup.ag)\n` +
      `2. Connect your wallet at [infinite.sh/dashboard](https://infinite.sh/dashboard)\n` +
      `3. Your tier is auto-detected — start using AI immediately\n\n` +
      `**Server guide:**\n` +
      `- <#1471262888709591143> — Read the rules first\n` +
      `- <#1471262904685695016> — Main chat for holders\n` +
      `- <#1471262938038800629> — Need help? Ask here\n` +
      `- Mention \`@INFINITE MOD\` anywhere to ask the AI assistant\n\n` +
      `**Links:** [Website](https://infinite.sh) \u2022 [X/Twitter](https://x.com/infinitexkeys) \u2022 [How It Works](https://infinite.sh/how-it-works)`
    );
  } catch (err) {
    console.error('[WELCOME] Failed to send:', err.message);
  }
}

export { handleMemberJoin };
