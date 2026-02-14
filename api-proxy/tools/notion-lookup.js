const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const FETCH_TIMEOUT_MS = 15000;

async function notionFetch(path, token, method = 'GET', body = null) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const options = {
    method,
    signal: controller.signal,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
  };

  if (body) options.body = JSON.stringify(body);

  const response = await fetch(`${NOTION_API}${path}`, options);
  clearTimeout(timer);

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Notion API ${response.status}: ${text.slice(0, 200)}`);
  }

  return response.json();
}

function extractPlainText(richTextArray) {
  return (richTextArray || []).map(rt => rt.plain_text || '').join('');
}

function extractBlockText(blocks) {
  const lines = [];
  for (const block of blocks) {
    const type = block.type;
    if (!type) continue;

    const content = block[type];
    if (!content) continue;

    if (content.rich_text) {
      const text = extractPlainText(content.rich_text);
      if (type.startsWith('heading')) lines.push(`\n## ${text}\n`);
      else if (type === 'bulleted_list_item') lines.push(`- ${text}`);
      else if (type === 'numbered_list_item') lines.push(`1. ${text}`);
      else if (type === 'to_do') lines.push(`- [${content.checked ? 'x' : ' '}] ${text}`);
      else if (type === 'code') lines.push(`\`\`\`\n${text}\n\`\`\``);
      else lines.push(text);
    }
  }
  return lines.join('\n');
}

async function search(query, token) {
  const data = await notionFetch('/search', token, 'POST', {
    query,
    page_size: 10,
    sort: { direction: 'descending', timestamp: 'last_edited_time' },
  });

  return {
    results: (data.results || []).map(r => ({
      id: r.id,
      type: r.object,
      title: r.object === 'page'
        ? extractPlainText(r.properties?.title?.title || r.properties?.Name?.title || []) || 'Untitled'
        : (r.title?.[0]?.plain_text || 'Untitled Database'),
      url: r.url,
      lastEdited: r.last_edited_time,
    })),
  };
}

async function readPage(pageId, token) {
  const [page, blocksData] = await Promise.all([
    notionFetch(`/pages/${pageId}`, token),
    notionFetch(`/blocks/${pageId}/children?page_size=100`, token),
  ]);

  const titleProp = Object.values(page.properties || {}).find(p => p.type === 'title');
  const title = extractPlainText(titleProp?.title || []) || 'Untitled';
  const content = extractBlockText(blocksData.results || []);

  return {
    title,
    url: page.url,
    content: content.slice(0, 8000),
    truncated: content.length > 8000,
    lastEdited: page.last_edited_time,
  };
}

async function queryDatabase(databaseId, token) {
  const data = await notionFetch(`/databases/${databaseId}/query`, token, 'POST', {
    page_size: 20,
  });

  const entries = (data.results || []).map(page => {
    const props = {};
    for (const [key, val] of Object.entries(page.properties || {})) {
      if (val.title) props[key] = extractPlainText(val.title);
      else if (val.rich_text) props[key] = extractPlainText(val.rich_text);
      else if (val.number !== undefined && val.number !== null) props[key] = val.number;
      else if (val.select) props[key] = val.select?.name || null;
      else if (val.multi_select) props[key] = (val.multi_select || []).map(s => s.name);
      else if (val.date) props[key] = val.date?.start || null;
      else if (val.checkbox !== undefined) props[key] = val.checkbox;
      else if (val.url) props[key] = val.url;
      else if (val.status) props[key] = val.status?.name || null;
    }
    return { id: page.id, url: page.url, properties: props };
  });

  return { entries, total: data.results?.length || 0 };
}

export async function executeNotionLookup({ action, query, pageId, databaseId }, token) {
  if (!token) {
    return { error: 'Notion account not connected. Connect it in Dashboard > Connections.' };
  }

  if (!action) return { error: 'action is required (search, read_page, query_database)' };

  try {
    switch (action) {
      case 'search':
        if (!query) return { error: 'query is required for search' };
        return await search(query, token);
      case 'read_page':
        if (!pageId) return { error: 'pageId is required for read_page' };
        return await readPage(pageId, token);
      case 'query_database':
        if (!databaseId) return { error: 'databaseId is required for query_database' };
        return await queryDatabase(databaseId, token);
      default:
        return { error: `Unknown action: ${action}. Use: search, read_page, query_database` };
    }
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'Notion API request timed out' };
    return { error: err.message };
  }
}
