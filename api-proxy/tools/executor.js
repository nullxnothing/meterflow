import { executeUrlReader } from './url-reader.js';
import { executeCodeRunner } from './code-runner.js';
import { executeGithubLookup } from './github-lookup.js';
import { SERVER_TOOL_NAMES } from './definitions.js';

const handlers = {
  url_reader: executeUrlReader,
  code_runner: executeCodeRunner,
  github_lookup: executeGithubLookup,
};

export function isServerTool(name) {
  return SERVER_TOOL_NAMES.includes(name);
}

export async function executeTool(name, args) {
  const handler = handlers[name];
  if (!handler) {
    return { error: `Unknown tool: ${name}` };
  }

  try {
    const result = await handler(args);
    return result;
  } catch (err) {
    return { error: `Tool execution failed: ${err.message}` };
  }
}
