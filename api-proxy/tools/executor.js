import { executeUrlReader } from './url-reader.js';
import { executeCodeRunner } from './code-runner.js';
import { executeGithubLookup } from './github-lookup.js';
import { executeGoogleLookup } from './google-lookup.js';
import { executeNotionLookup } from './notion-lookup.js';
import { SERVER_TOOL_NAMES, AUTH_REQUIRED_TOOLS } from './definitions.js';
import { getToken } from '../oauth/store.js';
import { ensureValidGoogleToken } from '../oauth/routes.js';

const handlers = {
  url_reader: (args) => executeUrlReader(args),
  code_runner: (args) => executeCodeRunner(args),
  github_lookup: (args, token) => executeGithubLookup(args, token),
  google_lookup: (args, token) => executeGoogleLookup(args, token),
  notion_lookup: (args, token) => executeNotionLookup(args, token),
};

export function isServerTool(name) {
  return SERVER_TOOL_NAMES.includes(name);
}

export async function executeTool(name, args, apiKey) {
  const handler = handlers[name];
  if (!handler) {
    return { error: `Unknown tool: ${name}` };
  }

  try {
    const provider = AUTH_REQUIRED_TOOLS[name];
    let token = null;

    if (provider && apiKey) {
      if (provider === 'google') {
        token = await ensureValidGoogleToken(apiKey);
      } else {
        token = getToken(apiKey, provider);
      }
    }

    const result = await handler(args, token);
    return result;
  } catch (err) {
    return { error: `Tool execution failed: ${err.message}` };
  }
}
