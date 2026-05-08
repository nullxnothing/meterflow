import { BOT_CONFIG } from '../config.js';

async function handleMemberJoin(member) {
  if (!BOT_CONFIG.WELCOME_CHANNEL) return;

  try {
    const channel = await member.guild.channels.fetch(BOT_CONFIG.WELCOME_CHANNEL);
    if (!channel) return;

    await channel.send(
      `Welcome **${member.user.username}**\n\n` +
      `Meterflow is a Solana-native payment meter for APIs, AI tools, and autonomous agents. Connect a wallet, create meters, set budgets, and inspect every paid request from one control plane.\n\n` +
      `**Get started:**\n` +
      `1. Open the Meterflow dashboard\n` +
      `2. Connect your Solana wallet\n` +
      `3. Create a meter or agent budget and send requests through the gateway\n\n` +
      `**Server guide:**\n` +
      `- <#1471262888709591143> — Read the rules first\n` +
      `- <#1471262904685695016> — Main chat for builders\n` +
      `- <#1471262938038800629> — Need help? Ask here\n` +
      `- Mention the moderator bot anywhere to ask the AI assistant\n\n` +
      `**Links:** [Website](https://meterflow.fun) \u2022 [X/Twitter](https://x.com/meterflowsol) \u2022 [How It Works](https://meterflow.fun/how-it-works)`
    );
  } catch (err) {
    console.error('[WELCOME] Failed to send:', err.message);
  }
}

export { handleMemberJoin };
