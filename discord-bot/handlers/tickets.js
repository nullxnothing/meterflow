import { BOT_CONFIG, AI } from '../config.js';
import { fetchRecentErrors, searchLogs, formatLogsForAI } from '../render.js';
import { splitMessage } from './ai.js';

const DIAGNOSTIC_PROMPT = `You are a senior DevOps engineer triaging production issues for the Meterflow platform.

PLATFORM:
- meterflow-api-proxy: Node.js API proxy (handles AI chat, image, video, trading endpoints)
- meterflow-agent: Docker-based Solana treasury agent
- meterflow-discord-bot: Discord bot for community moderation and AI chat

YOUR JOB:
1. Analyze the user-reported issue
2. Cross-reference with the Render server logs provided
3. Identify the root cause (or top 2-3 likely causes)
4. Suggest a specific fix with file/endpoint/config details
5. Rate severity: CRITICAL / HIGH / MEDIUM / LOW

OUTPUT FORMAT:
**Severity:** [level]
**Service:** [which service is affected]
**Summary:** [1-2 sentence diagnosis]
**Root Cause:** [what's actually wrong based on logs + user report]
**Fix:** [specific actionable steps]
**Relevant Logs:** [quote the most relevant log lines]`;

function extractKeywords(text) {
  const keywords = [];

  // Common error patterns
  const errorPatterns = [
    /(\d{3})\s*error/i,
    /status\s*(\d{3})/i,
    /timeout/i,
    /ECONNREFUSED/i,
    /ENOTFOUND/i,
    /unauthorized/i,
    /forbidden/i,
    /rate.?limit/i,
    /out\s*of\s*memory/i,
    /crash/i,
    /500|502|503|504|401|403|404/,
  ];

  for (const pattern of errorPatterns) {
    const match = text.match(pattern);
    if (match) keywords.push(match[0]);
  }

  // Extract quoted strings or code blocks
  const codeBlocks = text.match(/`([^`]+)`/g);
  if (codeBlocks) {
    codeBlocks.forEach(block => {
      const clean = block.replace(/`/g, '').trim();
      if (clean.length > 2 && clean.length < 100) keywords.push(clean);
    });
  }

  // Extract endpoint paths
  const paths = text.match(/\/[\w\-/]+/g);
  if (paths) keywords.push(...paths.slice(0, 3));

  return [...new Set(keywords)].slice(0, 5);
}

async function diagnoseIssue(issueText, username) {
  if (!BOT_CONFIG.RENDER_API_KEY) {
    console.warn('[TICKET] RENDER_API_KEY not set — skipping log fetch');
    return getDiagnosisWithoutLogs(issueText, username);
  }

  // Fetch error logs + keyword-targeted search in parallel
  const keywords = extractKeywords(issueText);
  const [errorLogs, keywordLogs] = await Promise.all([
    fetchRecentErrors(BOT_CONFIG.RENDER_API_KEY),
    keywords.length > 0
      ? searchLogs(BOT_CONFIG.RENDER_API_KEY, keywords)
      : Promise.resolve({}),
  ]);

  const errorSection = formatLogsForAI(errorLogs);
  const keywordSection = Object.keys(keywordLogs).length
    ? formatLogsForAI(keywordLogs)
    : '';

  const logContext = keywordSection
    ? `## Recent Errors\n${errorSection}\n\n## Keyword-Matched Logs\n${keywordSection}`
    : `## Recent Errors\n${errorSection}`;

  return callDiagnosticAI(issueText, username, logContext);
}

async function getDiagnosisWithoutLogs(issueText, username) {
  return callDiagnosticAI(issueText, username, '*Render logs unavailable (no API key configured)*');
}

async function callDiagnosticAI(issueText, username, logContext) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch(`${BOT_CONFIG.API_PROXY_URL}/v1/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${BOT_CONFIG.BOT_API_KEY}`,
      },
      body: JSON.stringify({
        model: BOT_CONFIG.AI_MODEL,
        messages: [
          { role: 'user', content: `[System Instructions]\n${DIAGNOSTIC_PROMPT}` },
          { role: 'assistant', content: 'Ready to diagnose. Provide the user report and server logs.' },
          {
            role: 'user',
            content: `## User Report\n**From:** ${username}\n**Issue:**\n${issueText}\n\n## Server Logs (last 2 hours)\n${logContext}`,
          },
        ],
        max_tokens: 2048,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[TICKET] AI diagnosis failed (${res.status}): ${body}`);
      return null;
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content
      || data.content?.[0]?.text
      || null;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[TICKET] Diagnosis timed out');
    } else {
      console.error('[TICKET] Diagnosis failed:', err.message);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function handleTicket(message, client) {
  const issueText = message.content;
  const username = message.author.displayName || message.author.username;

  // Create a thread for this ticket
  let thread;
  try {
    const title = issueText.slice(0, 90) + (issueText.length > 90 ? '...' : '');
    thread = await message.startThread({
      name: `Ticket: ${title}`,
      autoArchiveDuration: 1440, // 24 hours
    });
  } catch (err) {
    console.error('[TICKET] Failed to create thread:', err.message);
    return;
  }

  await thread.send('Analyzing your issue and checking server logs... This may take a moment.');

  const diagnosis = await diagnoseIssue(issueText, username);

  if (!diagnosis) {
    await thread.send('Could not generate a diagnosis right now. The team has been notified of your issue.');
    await sendDevReport(client, message, username, issueText, null);
    return;
  }

  // Reply to user with a simplified acknowledgment
  const userReply = `Your issue has been logged and analyzed. A developer will review it shortly.\n\n**Quick Assessment:**\n${extractSeverityLine(diagnosis)}`;
  const userChunks = splitMessage(userReply);
  for (const chunk of userChunks) {
    await thread.send(chunk);
  }

  // Send full diagnostic to dev channel
  await sendDevReport(client, message, username, issueText, diagnosis);
}

function extractSeverityLine(diagnosis) {
  const severityMatch = diagnosis.match(/\*\*Severity:\*\*\s*.+/);
  const summaryMatch = diagnosis.match(/\*\*Summary:\*\*\s*.+/);
  const parts = [];
  if (severityMatch) parts.push(severityMatch[0]);
  if (summaryMatch) parts.push(summaryMatch[0]);
  return parts.join('\n') || 'Issue received and under review.';
}

async function sendDevReport(client, message, username, issueText, diagnosis) {
  if (!BOT_CONFIG.DEV_REPORT_CHANNEL) {
    console.warn('[TICKET] DEV_REPORT_CHANNEL not set — diagnostic not forwarded');
    return;
  }

  try {
    const channel = await client.channels.fetch(BOT_CONFIG.DEV_REPORT_CHANNEL);
    if (!channel) return;

    const timestamp = new Date().toISOString();
    const truncatedIssue = issueText.length > 500 ? issueText.slice(0, 500) + '...' : issueText;

    const header = `**New Ticket** — ${timestamp}\n` +
      `**Reporter:** ${username} (${message.author.id})\n` +
      `**Channel:** <#${message.channel.id}>\n` +
      `**Issue:**\n\`\`\`\n${truncatedIssue}\n\`\`\``;

    const body = diagnosis
      ? `\n**Diagnosis:**\n${diagnosis}`
      : '\n*AI diagnosis unavailable — manual review needed.*';

    const fullReport = header + body;
    const chunks = splitMessage(fullReport);

    for (const chunk of chunks) {
      await channel.send(chunk);
    }
  } catch (err) {
    console.error('[TICKET] Failed to send dev report:', err.message);
  }
}

export { handleTicket, diagnoseIssue, sendDevReport };
