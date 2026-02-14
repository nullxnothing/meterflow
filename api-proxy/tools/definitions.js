// Server-side tool schemas for each provider format

const TOOL_DEFINITIONS = {
  url_reader: {
    name: 'url_reader',
    description: 'Fetch and read the content of any URL. Returns the extracted text content from web pages, JSON APIs, or plain text. Use this when the user shares a URL or asks you to look at a webpage.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to fetch (must start with http:// or https://)' },
      },
      required: ['url'],
    },
  },
  code_runner: {
    name: 'code_runner',
    description: 'Execute JavaScript code in a secure sandbox. Use this to perform calculations, data transformations, string manipulation, or demonstrate code. Has access to Math, Date, JSON, and standard JS built-ins. Console output and return values are captured.',
    parameters: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'JavaScript code to execute. Use console.log() to output results.' },
      },
      required: ['code'],
    },
  },
  github_lookup: {
    name: 'github_lookup',
    description: 'Look up information from GitHub repositories. Can fetch repo info, read file contents, search code, or list issues. Works with public repos by default; if the user has connected their GitHub account, also accesses their private repos.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['repo_info', 'file_content', 'search_code', 'list_issues'], description: 'What to look up' },
        owner: { type: 'string', description: 'GitHub username or organization' },
        repo: { type: 'string', description: 'Repository name' },
        path: { type: 'string', description: 'File or directory path (for file_content action)' },
        query: { type: 'string', description: 'Search query (for search_code action)' },
      },
      required: ['action', 'owner', 'repo'],
    },
  },
  google_lookup: {
    name: 'google_lookup',
    description: 'Search and read the user\'s Google Drive files, Google Docs, and Google Sheets. Requires the user to connect their Google account first via Dashboard > Connections.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search_files', 'read_document', 'read_spreadsheet'], description: 'What to do' },
        query: { type: 'string', description: 'Search query (for search_files action)' },
        fileId: { type: 'string', description: 'Google file ID (for read_document or read_spreadsheet)' },
      },
      required: ['action'],
    },
  },
  notion_lookup: {
    name: 'notion_lookup',
    description: 'Search and read pages and databases from the user\'s Notion workspace. Requires the user to connect their Notion account first via Dashboard > Connections.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'read_page', 'query_database'], description: 'What to do' },
        query: { type: 'string', description: 'Search query (for search action)' },
        pageId: { type: 'string', description: 'Notion page ID (for read_page action)' },
        databaseId: { type: 'string', description: 'Notion database ID (for query_database action)' },
      },
      required: ['action'],
    },
  },
  image_generate: {
    name: 'image_generate',
    description: 'Generate an AI image based on a text prompt using Gemini. Use this when the user asks you to create, generate, draw, design, or visualize an image. Returns the generated image that will be displayed inline in the chat.',
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'A detailed description of the image to generate. Be specific about style, composition, lighting, colors, and subject matter.' },
      },
      required: ['prompt'],
    },
  },
};

// Tools that require OAuth tokens — maps tool name to provider
export const AUTH_REQUIRED_TOOLS = {
  github_lookup: 'github',
  google_lookup: 'google',
  notion_lookup: 'notion',
};

export const SERVER_TOOL_NAMES = Object.keys(TOOL_DEFINITIONS);

export function getAnthropicTools(toolNames) {
  return toolNames.map(name => {
    const def = TOOL_DEFINITIONS[name];
    if (!def) return null;
    return {
      name: def.name,
      description: def.description,
      input_schema: def.parameters,
    };
  }).filter(Boolean);
}

export function getGeminiTools(toolNames) {
  return toolNames.map(name => {
    const def = TOOL_DEFINITIONS[name];
    if (!def) return null;
    return {
      name: def.name,
      description: def.description,
      parameters: convertToGeminiSchema(def.parameters),
    };
  }).filter(Boolean);
}

export function getOpenAITools(toolNames) {
  return toolNames.map(name => {
    const def = TOOL_DEFINITIONS[name];
    if (!def) return null;
    return {
      type: 'function',
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters,
      },
    };
  }).filter(Boolean);
}

function convertToGeminiSchema(schema) {
  // Gemini uses a slightly different schema format — no 'required' at top level for some versions
  // but generally accepts JSON Schema subset
  const result = { type: schema.type, properties: {} };
  for (const [key, val] of Object.entries(schema.properties || {})) {
    result.properties[key] = { ...val };
  }
  if (schema.required) result.required = schema.required;
  return result;
}
