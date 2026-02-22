import { BOT_CONFIG } from '../config.js';
import { detectSpam, escalate } from './spam.js';
import { getAIResponse, classifySpam, splitMessage } from './ai.js';

async function logModAction(client, message, reason) {
  if (!BOT_CONFIG.MOD_LOG_CHANNEL) return;

  try {
    const channel = await client.channels.fetch(BOT_CONFIG.MOD_LOG_CHANNEL);
    if (!channel) return;

    const truncated = message.content.length > 200
      ? message.content.slice(0, 200) + '...'
      : message.content;

    await channel.send(
      `**Auto-Mod** | Deleted message from **${message.author.tag}** (${message.author.id}) in <#${message.channel.id}>\n` +
      `**Reason:** ${reason}\n` +
      `**Content:** \`\`\`${truncated}\`\`\``
    );
  } catch (err) {
    console.error('[MOD] Failed to log action:', err.message);
  }
}

function shouldRespond(message, clientId) {
  // Direct @mention
  if (message.mentions.has(clientId)) return true;

  // Reply to bot's own message
  if (message.reference?.messageId) {
    const repliedMsg = message.channel.messages.cache.get(message.reference.messageId);
    if (repliedMsg?.author.id === clientId) return true;
  }

  // Message in designated AI channel
  if (BOT_CONFIG.AI_CHANNELS.has(message.channel.id)) return true;

  return false;
}

function stripMention(content, clientId) {
  return content.replace(new RegExp(`<@!?${clientId}>`, 'g'), '').trim();
}

async function handleMessage(message, client) {
  // Skip bots and DMs
  if (message.author.bot) return;
  if (!message.guild) return;


  // --- Spam check ---
  const spamResult = detectSpam(message);

  if (spamResult === 'DELETE') {
    try {
      await message.delete();
      const action = await escalate(message);
      await logModAction(client, message, `Heuristic spam — ${action}`);
    } catch (err) {
      console.error('[MOD] Failed to handle spam:', err.message);
    }
    return;
  }

  if (spamResult === 'FLAG') {
    const classification = await classifySpam(message.content);
    if (classification === 'SPAM') {
      try {
        await message.delete();
        const action = await escalate(message);
        await logModAction(client, message, `AI spam classification — ${action}`);
      } catch (err) {
        console.error('[MOD] Failed to handle flagged spam:', err.message);
      }
      return;
    }
  }

  // --- AI response ---
  if (!shouldRespond(message, client.user.id)) return;

  const userContent = stripMention(message.content, client.user.id);
  if (!userContent) return;

  try {
    await message.channel.sendTyping();

    const reply = await getAIResponse(
      message.channel.id,
      userContent,
      message.author.displayName || message.author.username,
    );

    if (!reply) {
      await message.reply('Couldn\'t generate a response right now. Try again in a moment.');
      return;
    }

    const chunks = splitMessage(reply);
    for (let i = 0; i < chunks.length; i++) {
      if (i === 0) {
        await message.reply(chunks[i]);
      } else {
        await message.channel.send(chunks[i]);
      }
    }
  } catch (err) {
    console.error('[MSG] Failed to respond:', err.message);
  }
}

export { handleMessage };
