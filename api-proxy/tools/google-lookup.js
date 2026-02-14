const GOOGLE_API = 'https://www.googleapis.com';
const FETCH_TIMEOUT_MS = 15000;

async function googleFetch(url, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  const response = await fetch(url, {
    signal: controller.signal,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });

  clearTimeout(timer);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Google API ${response.status}: ${body.slice(0, 200)}`);
  }

  return response.json();
}

async function searchFiles(query, token) {
  const q = encodeURIComponent(query);
  const data = await googleFetch(
    `${GOOGLE_API}/drive/v3/files?q=fullText+contains+'${q}'&fields=files(id,name,mimeType,modifiedTime,webViewLink)&pageSize=10&orderBy=modifiedTime+desc`,
    token
  );
  return {
    files: (data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      type: f.mimeType,
      modified: f.modifiedTime,
      url: f.webViewLink,
    })),
  };
}

async function readDocument(fileId, token) {
  const data = await googleFetch(
    `https://docs.googleapis.com/v1/documents/${fileId}`,
    token
  );

  let text = '';
  for (const element of data.body?.content || []) {
    if (element.paragraph) {
      for (const el of element.paragraph.elements || []) {
        text += el.textRun?.content || '';
      }
    }
  }

  return {
    title: data.title,
    content: text.slice(0, 8000),
    truncated: text.length > 8000,
  };
}

async function readSpreadsheet(fileId, token) {
  const meta = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${fileId}?fields=properties.title,sheets.properties.title`,
    token
  );

  const firstSheet = meta.sheets?.[0]?.properties?.title || 'Sheet1';
  const values = await googleFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${fileId}/values/${encodeURIComponent(firstSheet)}?majorDimension=ROWS`,
    token
  );

  const rows = values.values || [];
  return {
    title: meta.properties?.title,
    sheet: firstSheet,
    headers: rows[0] || [],
    rows: rows.slice(1, 51),
    totalRows: rows.length - 1,
    truncated: rows.length > 51,
  };
}

export async function executeGoogleLookup({ action, query, fileId }, token) {
  if (!token) {
    return { error: 'Google account not connected. Connect it in Dashboard > Connections.' };
  }

  if (!action) return { error: 'action is required (search_files, read_document, read_spreadsheet)' };

  try {
    switch (action) {
      case 'search_files':
        if (!query) return { error: 'query is required for search_files' };
        return await searchFiles(query, token);
      case 'read_document':
        if (!fileId) return { error: 'fileId is required for read_document' };
        return await readDocument(fileId, token);
      case 'read_spreadsheet':
        if (!fileId) return { error: 'fileId is required for read_spreadsheet' };
        return await readSpreadsheet(fileId, token);
      default:
        return { error: `Unknown action: ${action}. Use: search_files, read_document, read_spreadsheet` };
    }
  } catch (err) {
    if (err.name === 'AbortError') return { error: 'Google API request timed out' };
    return { error: err.message };
  }
}
