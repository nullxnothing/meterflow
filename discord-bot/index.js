import { Client, GatewayIntentBits, Partials, ActivityType } from 'discord.js';
import { createServer } from 'http';
import { BOT_CONFIG } from './config.js';
import { handleMessage } from './handlers/message.js';
import { handleMemberJoin } from './handlers/welcome.js';
import { handleTicket } from './handlers/tickets.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Message, Partials.Channel],
  presence: {
    status: 'online',
    activities: [{ name: '$INFINITE', type: ActivityType.Watching }],
  },
});

let isReady = false;

client.once('ready', () => {
  isReady = true;
  console.log(`[BOT] Logged in as ${client.user.tag}`);
  console.log(`[BOT] Serving ${client.guilds.cache.size} guild(s)`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ca') {
    await interaction.reply('`DhsN1JmBZCvcL9P7cK1R9NLy5VB1kQcecUG7JbKQpump`');
  }

  if (interaction.commandName === 'ticket') {
    const issueText = interaction.options.getString('issue');
    await interaction.deferReply();

    // Create a synthetic message-like object for the ticket handler
    const pseudoMessage = {
      content: issueText,
      author: interaction.user,
      channel: interaction.channel,
      startThread: (opts) => interaction.channel.threads.create({
        name: opts.name,
        autoArchiveDuration: opts.autoArchiveDuration,
        startMessage: interaction.id,
      }),
    };

    try {
      // Create thread and run diagnosis
      const title = issueText.slice(0, 90) + (issueText.length > 90 ? '...' : '');
      const thread = await interaction.channel.threads.create({
        name: `Ticket: ${title}`,
        autoArchiveDuration: 1440,
      });

      await interaction.editReply(`Ticket created! Follow up in ${thread}.`);

      // Import and run diagnosis directly
      const { diagnoseIssue, sendDevReport } = await import('./handlers/tickets.js');
      const username = interaction.user.displayName || interaction.user.username;

      await thread.send(`**Issue reported by ${username}:**\n${issueText}\n\nAnalyzing and checking server logs...`);

      const diagnosis = await diagnoseIssue(issueText, username);

      if (!diagnosis) {
        await thread.send('Could not generate a diagnosis right now. The team has been notified.');
      } else {
        const { splitMessage } = await import('./handlers/ai.js');
        const severityMatch = diagnosis.match(/\*\*Severity:\*\*\s*.+/);
        const summaryMatch = diagnosis.match(/\*\*Summary:\*\*\s*.+/);
        const parts = [];
        if (severityMatch) parts.push(severityMatch[0]);
        if (summaryMatch) parts.push(summaryMatch[0]);
        const quickAssessment = parts.join('\n') || 'Issue received and under review.';

        const userReply = `Your issue has been logged and analyzed. A developer will review it shortly.\n\n**Quick Assessment:**\n${quickAssessment}`;
        for (const chunk of splitMessage(userReply)) {
          await thread.send(chunk);
        }
      }

      await sendDevReport(client, { ...pseudoMessage, channel: interaction.channel }, username, issueText, diagnosis);
    } catch (err) {
      console.error('[TICKET] Slash command error:', err.message);
      await interaction.editReply('Failed to create ticket. Please try again or post in the support channel.');
    }
  }
});

client.on('messageCreate', (message) => {
  handleMessage(message, client).catch(err => {
    console.error('[BOT] Unhandled message error:', err.message);
  });
});

client.on('guildMemberAdd', (member) => {
  handleMemberJoin(member).catch(err => {
    console.error('[BOT] Welcome error:', err.message);
  });
});

client.on('error', (err) => {
  console.error('[BOT] Client error:', err.message);
});

// Health server
const health = createServer((req, res) => {
  if (req.url === '/health') {
    const status = isReady ? 200 : 503;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: isReady ? 'ok' : 'starting',
      uptime: process.uptime(),
      guilds: client.guilds?.cache.size || 0,
      ping: client.ws.ping,
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

health.listen(BOT_CONFIG.HEALTH_PORT, () => {
  console.log(`[HEALTH] Listening on :${BOT_CONFIG.HEALTH_PORT}`);
});

client.login(BOT_CONFIG.DISCORD_TOKEN);
