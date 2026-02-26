const RENDER_API_BASE = 'https://api.render.com/v1';

const SERVICE_IDS = {
  'api-proxy': 'srv-d6bj9oumcj7s73ak3uug',
  'treasury-agent': 'srv-d6dk617fte5s73df40sg',
  'discord-bot': 'srv-d6e81lnfte5s73dsv9c0',
};

async function fetchLogs(apiKey, { serviceId, level, limit = 50, text } = {}) {
  const params = new URLSearchParams();
  params.append('resource[]', serviceId);
  if (limit) params.append('limit', String(limit));
  if (level) level.forEach(l => params.append('level[]', l));
  if (text) text.forEach(t => params.append('text[]', t));

  // Last 2 hours
  const start = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  params.append('startTime', start);
  params.append('direction', 'backward');

  const res = await fetch(`${RENDER_API_BASE}/logs?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[RENDER] Logs fetch failed (${res.status}): ${body}`);
    return [];
  }

  const data = await res.json();
  return data.logs || data || [];
}

async function fetchRecentErrors(apiKey) {
  const results = {};

  for (const [name, serviceId] of Object.entries(SERVICE_IDS)) {
    try {
      const errorLogs = await fetchLogs(apiKey, {
        serviceId,
        level: ['error', 'warning', 'warn', 'critical'],
        limit: 30,
      });
      results[name] = errorLogs;
    } catch (err) {
      console.error(`[RENDER] Failed to fetch logs for ${name}:`, err.message);
      results[name] = [];
    }
  }

  return results;
}

async function searchLogs(apiKey, keywords) {
  const results = {};

  for (const [name, serviceId] of Object.entries(SERVICE_IDS)) {
    try {
      const logs = await fetchLogs(apiKey, {
        serviceId,
        text: keywords,
        limit: 20,
      });
      results[name] = logs;
    } catch (err) {
      console.error(`[RENDER] Search failed for ${name}:`, err.message);
      results[name] = [];
    }
  }

  return results;
}

function formatLogsForAI(logsByService) {
  const sections = [];

  for (const [service, logs] of Object.entries(logsByService)) {
    if (!logs.length) {
      sections.push(`### ${service}\nNo relevant logs found.`);
      continue;
    }

    const formatted = logs.map(log => {
      const ts = log.timestamp || log.time || '';
      const level = log.level || '';
      const text = log.text || log.message || JSON.stringify(log);
      return `[${ts}] ${level}: ${text}`;
    }).join('\n');

    sections.push(`### ${service}\n\`\`\`\n${formatted}\n\`\`\``);
  }

  return sections.join('\n\n');
}

export { fetchRecentErrors, searchLogs, formatLogsForAI, SERVICE_IDS };
