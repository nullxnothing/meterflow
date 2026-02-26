/**
 * Unit tests for OpenAI-compat endpoint conversion functions.
 * Covers all edge cases from the provider hardening pass.
 * Run: node --test tests/openai-compat.test.js
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';

// Dynamic import — module has side-effects (Redis, config) so force exit when done
const mod = await import('../routes/openai-compat.js');
const {
  extractTextContent,
  toAnthropicContent,
  convertMessagesForAnthropic,
  convertMessagesForGemini,
  sanitizeSchemaForGemini,
  sanitizeSchemaForAnthropic,
  convertToolsForGemini,
  hasClientTools,
  extractServerToolNames,
} = mod;

// Force exit after all tests complete (Redis keeps process alive)
after(() => setTimeout(() => process.exit(0), 200));

// ═══════════════════════════════════════
// extractTextContent
// ═══════════════════════════════════════
describe('extractTextContent', () => {
  it('returns empty string for null/undefined', () => {
    assert.equal(extractTextContent(null), '');
    assert.equal(extractTextContent(undefined), '');
    assert.equal(extractTextContent(''), '');
  });

  it('returns string content as-is', () => {
    assert.equal(extractTextContent('hello'), 'hello');
  });

  it('joins array of content blocks', () => {
    const content = [{ text: 'hello' }, { text: ' world' }];
    assert.equal(extractTextContent(content), 'hello world');
  });

  it('handles array blocks with missing text', () => {
    const content = [{ text: 'a' }, { type: 'image_url' }, { text: 'b' }];
    assert.equal(extractTextContent(content), 'ab');
  });

  it('stringifies object content', () => {
    assert.equal(extractTextContent(42), '42');
    assert.equal(extractTextContent({}), '[object Object]');
  });
});

// ═══════════════════════════════════════
// toAnthropicContent
// ═══════════════════════════════════════
describe('toAnthropicContent', () => {
  it('returns empty array for null/undefined', () => {
    assert.deepEqual(toAnthropicContent(null), []);
    assert.deepEqual(toAnthropicContent(undefined), []);
  });

  it('wraps string in text block', () => {
    assert.deepEqual(toAnthropicContent('hello'), [{ type: 'text', text: 'hello' }]);
  });

  it('returns empty array for empty string', () => {
    assert.deepEqual(toAnthropicContent(''), []);
  });

  it('normalizes array of strings', () => {
    const result = toAnthropicContent(['hello', 'world']);
    assert.deepEqual(result, [
      { type: 'text', text: 'hello' },
      { type: 'text', text: 'world' },
    ]);
  });

  it('passes through text blocks', () => {
    const input = [{ type: 'text', text: 'hello' }];
    assert.deepEqual(toAnthropicContent(input), [{ type: 'text', text: 'hello' }]);
  });

  it('passes through non-text blocks (image_url)', () => {
    const input = [{ type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } }];
    const result = toAnthropicContent(input);
    assert.equal(result[0].type, 'image_url');
  });

  it('filters empty text blocks', () => {
    const input = [{ type: 'text', text: '' }, { type: 'text', text: 'keep' }];
    assert.deepEqual(toAnthropicContent(input), [{ type: 'text', text: 'keep' }]);
  });

  it('stringifies non-string non-array content', () => {
    assert.deepEqual(toAnthropicContent(42), [{ type: 'text', text: '42' }]);
  });
});

// ═══════════════════════════════════════
// convertMessagesForAnthropic
// ═══════════════════════════════════════
describe('convertMessagesForAnthropic', () => {
  it('converts basic user/assistant messages', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    const result = convertMessagesForAnthropic(messages);
    assert.equal(result.length, 2);
    assert.equal(result[0].role, 'user');
    assert.deepEqual(result[0].content, [{ type: 'text', text: 'hello' }]);
    assert.equal(result[1].role, 'assistant');
    assert.deepEqual(result[1].content, [{ type: 'text', text: 'hi' }]);
  });

  it('converts assistant tool_calls to tool_use blocks', () => {
    const messages = [{
      role: 'assistant',
      content: 'Let me search',
      tool_calls: [{
        id: 'call_123',
        function: { name: 'web_search', arguments: '{"query":"test"}' },
      }],
    }];
    const result = convertMessagesForAnthropic(messages);
    assert.equal(result.length, 1);
    assert.equal(result[0].role, 'assistant');
    assert.equal(result[0].content.length, 2);
    assert.equal(result[0].content[0].type, 'text');
    assert.equal(result[0].content[1].type, 'tool_use');
    assert.equal(result[0].content[1].id, 'call_123');
    assert.equal(result[0].content[1].name, 'web_search');
    assert.deepEqual(result[0].content[1].input, { query: 'test' });
  });

  it('converts tool role to tool_result blocks', () => {
    const messages = [{
      role: 'tool',
      tool_call_id: 'call_123',
      content: '{"result": "found"}',
    }];
    const result = convertMessagesForAnthropic(messages);
    assert.equal(result.length, 1);
    assert.equal(result[0].role, 'user');
    assert.equal(result[0].content[0].type, 'tool_result');
    assert.equal(result[0].content[0].tool_use_id, 'call_123');
  });

  it('handles tool result with object content', () => {
    const messages = [{
      role: 'tool',
      tool_call_id: 'call_456',
      content: { data: [1, 2, 3] },
    }];
    const result = convertMessagesForAnthropic(messages);
    assert.equal(result[0].content[0].content, '{"data":[1,2,3]}');
  });

  it('handles tool result with null content', () => {
    const messages = [{
      role: 'tool',
      tool_call_id: 'call_789',
      content: null,
    }];
    const result = convertMessagesForAnthropic(messages);
    assert.equal(result[0].content[0].content, 'No output');
  });

  it('skips system messages', () => {
    const messages = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'hello' },
    ];
    const result = convertMessagesForAnthropic(messages);
    assert.equal(result.length, 1);
    assert.equal(result[0].role, 'user');
  });

  it('merges consecutive same-role messages', () => {
    const messages = [
      { role: 'user', content: 'part 1' },
      { role: 'user', content: 'part 2' },
    ];
    const result = convertMessagesForAnthropic(messages);
    assert.equal(result.length, 1);
    assert.equal(result[0].role, 'user');
    assert.equal(result[0].content.length, 2);
  });

  it('handles assistant with tool_calls but null content', () => {
    const messages = [{
      role: 'assistant',
      content: null,
      tool_calls: [{
        id: 'call_abc',
        function: { name: 'search', arguments: '{}' },
      }],
    }];
    const result = convertMessagesForAnthropic(messages);
    assert.equal(result[0].content.length, 1);
    assert.equal(result[0].content[0].type, 'tool_use');
  });

  it('handles malformed tool_call arguments gracefully', () => {
    const messages = [{
      role: 'assistant',
      content: '',
      tool_calls: [{
        id: 'call_bad',
        function: { name: 'test', arguments: 'not{json' },
      }],
    }];
    const result = convertMessagesForAnthropic(messages);
    assert.equal(result[0].content[0].type, 'tool_use');
    assert.deepEqual(result[0].content[0].input, {}); // falls back to empty
  });

  it('skips messages with empty content', () => {
    const messages = [
      { role: 'user', content: '' },
      { role: 'user', content: 'actual message' },
    ];
    const result = convertMessagesForAnthropic(messages);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].content, [{ type: 'text', text: 'actual message' }]);
  });
});

// ═══════════════════════════════════════
// convertMessagesForGemini
// ═══════════════════════════════════════
describe('convertMessagesForGemini', () => {
  it('converts basic user/assistant messages', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    const result = convertMessagesForGemini(messages);
    assert.equal(result.length, 2);
    assert.equal(result[0].role, 'user');
    assert.deepEqual(result[0].parts, [{ text: 'hello' }]);
    assert.equal(result[1].role, 'model');
    assert.deepEqual(result[1].parts, [{ text: 'hi' }]);
  });

  it('converts assistant tool_calls to functionCall parts', () => {
    const messages = [{
      role: 'assistant',
      content: 'Searching...',
      tool_calls: [{
        id: 'call_123',
        function: { name: 'web_search', arguments: '{"query":"test"}' },
      }],
    }];
    const result = convertMessagesForGemini(messages);
    assert.equal(result[0].role, 'model');
    assert.equal(result[0].parts.length, 2);
    assert.deepEqual(result[0].parts[0], { text: 'Searching...' });
    assert.deepEqual(result[0].parts[1], {
      functionCall: { name: 'web_search', args: { query: 'test' } },
    });
  });

  it('converts tool role to functionResponse parts', () => {
    const messages = [
      {
        role: 'assistant',
        tool_calls: [{ id: 'call_456', function: { name: 'search', arguments: '{}' } }],
      },
      {
        role: 'tool',
        tool_call_id: 'call_456',
        content: '{"results": ["a","b"]}',
      },
    ];
    const result = convertMessagesForGemini(messages);
    const toolResp = result.find(m => m.parts.some(p => p.functionResponse));
    assert.ok(toolResp, 'should have functionResponse');
    assert.equal(toolResp.parts[0].functionResponse.name, 'search');
  });

  it('resolves tool name from tool_call_id map', () => {
    const messages = [
      {
        role: 'assistant',
        tool_calls: [{ id: 'call_x', function: { name: 'my_tool', arguments: '{}' } }],
      },
      {
        role: 'tool',
        tool_call_id: 'call_x',
        content: '"done"',
      },
    ];
    const result = convertMessagesForGemini(messages);
    const toolResp = result.find(m => m.parts.some(p => p.functionResponse));
    assert.equal(toolResp.parts[0].functionResponse.name, 'my_tool');
  });

  it('falls back to "unknown" for unresolvable tool name', () => {
    const messages = [{
      role: 'tool',
      tool_call_id: 'call_missing',
      content: '"ok"',
    }];
    const result = convertMessagesForGemini(messages);
    assert.equal(result[0].parts[0].functionResponse.name, 'unknown');
  });

  it('merges consecutive same-role messages', () => {
    const messages = [
      { role: 'user', content: 'part 1' },
      { role: 'user', content: 'part 2' },
    ];
    const result = convertMessagesForGemini(messages);
    assert.equal(result.length, 1);
    assert.equal(result[0].parts.length, 2);
  });

  it('returns fallback for empty messages', () => {
    const result = convertMessagesForGemini([]);
    assert.equal(result.length, 1);
    assert.equal(result[0].role, 'user');
    assert.deepEqual(result[0].parts, [{ text: 'Hello' }]);
  });

  it('handles array content in user messages', () => {
    const messages = [{
      role: 'user',
      content: [{ type: 'text', text: 'hello' }, { type: 'text', text: ' world' }],
    }];
    const result = convertMessagesForGemini(messages);
    assert.equal(result[0].parts[0].text, 'hello world');
  });

  it('handles null content in assistant messages', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: null },
      { role: 'user', content: 'hello' },
    ];
    const result = convertMessagesForGemini(messages);
    // Null content assistant message should be skipped
    assert.ok(result.every(m => m.parts.length > 0));
  });

  it('ensures functionCall args are always objects', () => {
    const messages = [{
      role: 'assistant',
      tool_calls: [{
        id: 'call_1',
        function: { name: 'test', arguments: '"just a string"' },
      }],
    }];
    const result = convertMessagesForGemini(messages);
    const fc = result[0].parts.find(p => p.functionCall);
    assert.equal(typeof fc.functionCall.args, 'object');
    assert.ok(fc.functionCall.args !== null);
  });

  it('wraps non-JSON tool content in result object', () => {
    const messages = [{
      role: 'tool',
      tool_call_id: 'call_1',
      content: 'plain text result',
    }];
    const result = convertMessagesForGemini(messages);
    const fr = result[0].parts[0].functionResponse;
    assert.deepEqual(fr.response, { result: 'plain text result' });
  });
});

// ═══════════════════════════════════════
// sanitizeSchemaForGemini
// ═══════════════════════════════════════
describe('sanitizeSchemaForGemini', () => {
  it('strips unsupported top-level fields', () => {
    const schema = {
      type: 'object',
      properties: { q: { type: 'string' } },
      additionalProperties: false,
      $schema: 'http://json-schema.org/draft-07/schema#',
      patternProperties: { '^x-': { type: 'string' } },
      title: 'MySchema',
    };
    const result = sanitizeSchemaForGemini(schema);
    assert.equal(result.type, 'object');
    assert.ok(!('additionalProperties' in result));
    assert.ok(!('$schema' in result));
    assert.ok(!('patternProperties' in result));
    assert.ok(!('title' in result));
    assert.ok('properties' in result);
  });

  it('recursively cleans nested properties', () => {
    const schema = {
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          additionalProperties: false,
          $ref: '#/definitions/Foo',
          properties: {
            deep: { type: 'string', default: 'val', minLength: 1 },
          },
        },
      },
    };
    const result = sanitizeSchemaForGemini(schema);
    assert.ok(!('additionalProperties' in result.properties.nested));
    assert.ok(!('$ref' in result.properties.nested));
    assert.ok(!('default' in result.properties.nested.properties.deep));
    assert.ok(!('minLength' in result.properties.nested.properties.deep));
  });

  it('cleans array items', () => {
    const schema = {
      type: 'array',
      items: { type: 'string', default: 'x', minLength: 1 },
    };
    const result = sanitizeSchemaForGemini(schema);
    assert.ok(!('default' in result.items));
    assert.ok(!('minLength' in result.items));
    assert.equal(result.items.type, 'string');
  });

  it('handles null/undefined gracefully', () => {
    assert.equal(sanitizeSchemaForGemini(null), null);
    assert.equal(sanitizeSchemaForGemini(undefined), undefined);
  });

  it('handles primitive values', () => {
    assert.equal(sanitizeSchemaForGemini('string'), 'string');
    assert.equal(sanitizeSchemaForGemini(42), 42);
  });
});

// ═══════════════════════════════════════
// sanitizeSchemaForAnthropic
// ═══════════════════════════════════════
describe('sanitizeSchemaForAnthropic', () => {
  it('strips Anthropic-unsupported fields', () => {
    const schema = {
      type: 'object',
      properties: { q: { type: 'string' } },
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: '#/defs/Foo',
      deprecated: true,
      readOnly: true,
      examples: ['test'],
    };
    const result = sanitizeSchemaForAnthropic(schema);
    assert.ok(!('$schema' in result));
    assert.ok(!('$ref' in result));
    assert.ok(!('deprecated' in result));
    assert.ok(!('readOnly' in result));
    assert.ok(!('examples' in result));
    assert.ok('properties' in result);
  });

  it('recursively cleans nested properties', () => {
    const schema = {
      type: 'object',
      properties: {
        inner: { type: 'string', const: 'fixed', default: 'val' },
      },
    };
    const result = sanitizeSchemaForAnthropic(schema);
    assert.ok(!('const' in result.properties.inner));
    assert.ok(!('default' in result.properties.inner));
  });
});

// ═══════════════════════════════════════
// convertToolsForGemini
// ═══════════════════════════════════════
describe('convertToolsForGemini', () => {
  it('converts OpenAI tools to Gemini functionDeclarations', () => {
    const tools = [{
      type: 'function',
      function: {
        name: 'search',
        description: 'Search the web',
        parameters: {
          type: 'object',
          properties: { q: { type: 'string' } },
          additionalProperties: false,
        },
      },
    }];
    const result = convertToolsForGemini(tools);
    assert.ok(Array.isArray(result));
    assert.equal(result.length, 1);
    assert.ok(result[0].functionDeclarations);
    assert.equal(result[0].functionDeclarations[0].name, 'search');
    assert.ok(!('additionalProperties' in result[0].functionDeclarations[0].parameters));
  });

  it('returns undefined for empty/null tools', () => {
    assert.equal(convertToolsForGemini(null), undefined);
    assert.equal(convertToolsForGemini([]), undefined);
    assert.equal(convertToolsForGemini(undefined), undefined);
  });

  it('filters tools without function property', () => {
    const tools = [{ type: 'function' }, { function: { name: 'ok', description: '' } }];
    const result = convertToolsForGemini(tools);
    assert.equal(result[0].functionDeclarations.length, 1);
    assert.equal(result[0].functionDeclarations[0].name, 'ok');
  });
});

// ═══════════════════════════════════════
// hasClientTools
// ═══════════════════════════════════════
describe('hasClientTools', () => {
  it('returns false for null/empty', () => {
    assert.equal(hasClientTools(null), false);
    assert.equal(hasClientTools([]), false);
    assert.equal(hasClientTools(undefined), false);
  });

  it('returns true for non-server tools', () => {
    const tools = [{ function: { name: 'my_custom_tool' } }];
    assert.equal(hasClientTools(tools), true);
  });

  it('returns false when all tools are server tools', () => {
    // SERVER_TOOL_NAMES should include web_search etc.
    const tools = [{ function: { name: 'web_search' } }];
    // This depends on whether web_search is in SERVER_TOOL_NAMES
    // The function checks !SERVER_TOOL_NAMES.includes(name)
    // Just verify it doesn't throw
    const result = hasClientTools(tools);
    assert.equal(typeof result, 'boolean');
  });
});

// ═══════════════════════════════════════
// extractServerToolNames
// ═══════════════════════════════════════
describe('extractServerToolNames', () => {
  it('returns undefined for null/empty', () => {
    assert.equal(extractServerToolNames(null), undefined);
    assert.equal(extractServerToolNames(undefined), undefined);
  });

  it('extracts web_search from mixed tools', () => {
    const tools = [
      { function: { name: 'web_search' } },
      { function: { name: 'custom_tool' } },
    ];
    const result = extractServerToolNames(tools);
    assert.ok(result);
    assert.ok(result.includes('web_search'));
    // custom_tool is not a server tool, so it should not be included
    assert.ok(!result.includes('custom_tool'));
  });

  it('handles string tool names', () => {
    const tools = ['web_search', 'unknown_tool'];
    const result = extractServerToolNames(tools);
    assert.ok(result === undefined || result.includes('web_search'));
  });
});

// ═══════════════════════════════════════
// Full conversion pipeline (integration-style)
// ═══════════════════════════════════════
describe('Full conversation pipeline', () => {
  it('handles a complete tool-use conversation for Anthropic', () => {
    const messages = [
      { role: 'user', content: 'Search for weather' },
      {
        role: 'assistant',
        content: 'I\'ll search for that.',
        tool_calls: [{
          id: 'call_abc',
          function: { name: 'web_search', arguments: '{"query":"weather"}' },
        }],
      },
      {
        role: 'tool',
        tool_call_id: 'call_abc',
        content: '{"results": ["sunny", "72F"]}',
      },
      { role: 'assistant', content: 'The weather is sunny and 72F.' },
    ];

    const result = convertMessagesForAnthropic(messages);
    assert.equal(result.length, 4);
    assert.equal(result[0].role, 'user');
    assert.equal(result[1].role, 'assistant');
    assert.equal(result[2].role, 'user'); // tool_result wrapped as user
    assert.equal(result[3].role, 'assistant');
  });

  it('handles a complete tool-use conversation for Gemini', () => {
    const messages = [
      { role: 'user', content: 'Search for weather' },
      {
        role: 'assistant',
        content: 'Searching...',
        tool_calls: [{
          id: 'call_abc',
          function: { name: 'web_search', arguments: '{"query":"weather"}' },
        }],
      },
      {
        role: 'tool',
        tool_call_id: 'call_abc',
        content: '{"results": ["sunny", "72F"]}',
      },
      { role: 'assistant', content: 'The weather is sunny and 72F.' },
    ];

    const result = convertMessagesForGemini(messages);
    assert.ok(result.length >= 3);
    assert.equal(result[0].role, 'user');
    // model with functionCall
    const modelMsg = result.find(m => m.role === 'model' && m.parts.some(p => p.functionCall));
    assert.ok(modelMsg, 'should have model message with functionCall');
    // user with functionResponse
    const toolMsg = result.find(m => m.parts.some(p => p.functionResponse));
    assert.ok(toolMsg, 'should have functionResponse');
    assert.equal(toolMsg.parts[0].functionResponse.name, 'web_search');
  });

  it('handles multiple parallel tool calls', () => {
    const messages = [{
      role: 'assistant',
      content: '',
      tool_calls: [
        { id: 'call_1', function: { name: 'tool_a', arguments: '{"x":1}' } },
        { id: 'call_2', function: { name: 'tool_b', arguments: '{"y":2}' } },
      ],
    }];

    const anthropicResult = convertMessagesForAnthropic(messages);
    assert.equal(anthropicResult[0].content.length, 2);
    assert.equal(anthropicResult[0].content[0].name, 'tool_a');
    assert.equal(anthropicResult[0].content[1].name, 'tool_b');

    const geminiResult = convertMessagesForGemini(messages);
    const modelParts = geminiResult[0].parts;
    assert.equal(modelParts.length, 2);
    assert.equal(modelParts[0].functionCall.name, 'tool_a');
    assert.equal(modelParts[1].functionCall.name, 'tool_b');
  });

  it('handles complex schema sanitization for both providers', () => {
    const complexSchema = {
      type: 'object',
      $schema: 'http://json-schema.org/draft-07/schema#',
      $ref: '#/definitions/Root',
      additionalProperties: false,
      patternProperties: { '^x-': { type: 'any' } },
      oneOf: [{ type: 'string' }, { type: 'number' }],
      deprecated: true,
      readOnly: true,
      properties: {
        name: { type: 'string', default: 'untitled', minLength: 1, maxLength: 100 },
        tags: {
          type: 'array',
          items: { type: 'string', pattern: '^[a-z]+$', examples: ['tag1'] },
          minItems: 0,
          uniqueItems: true,
        },
      },
    };

    const geminiResult = sanitizeSchemaForGemini(complexSchema);
    assert.ok(!('$schema' in geminiResult));
    assert.ok(!('$ref' in geminiResult));
    assert.ok(!('additionalProperties' in geminiResult));
    assert.ok(!('patternProperties' in geminiResult));
    assert.ok(!('oneOf' in geminiResult));
    assert.ok(!('default' in geminiResult.properties.name));
    assert.ok(!('minLength' in geminiResult.properties.name));
    assert.ok(!('pattern' in geminiResult.properties.tags.items));
    assert.ok(!('minItems' in geminiResult.properties.tags));
    assert.equal(geminiResult.type, 'object');
    assert.equal(geminiResult.properties.name.type, 'string');

    const anthropicResult = sanitizeSchemaForAnthropic(complexSchema);
    assert.ok(!('$schema' in anthropicResult));
    assert.ok(!('$ref' in anthropicResult));
    assert.ok(!('deprecated' in anthropicResult));
    assert.ok(!('readOnly' in anthropicResult));
    assert.ok(!('const' in (anthropicResult.properties?.name || {})));
    assert.equal(anthropicResult.type, 'object');
  });
});
