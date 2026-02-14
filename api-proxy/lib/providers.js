import { PROVIDER_AVAILABLE } from '../config.js';
import {
  SERVER_TOOL_NAMES,
  getAnthropicTools, getGeminiTools, getOpenAITools,
} from '../tools/index.js';

function getProviderForModel(model) {
  if (model.startsWith('claude')) return 'claude';
  if (model.startsWith('gemini')) return 'gemini';
  if (model.startsWith('gpt-')) return 'openai';
  return null;
}

function isModelAvailable(model) {
  const provider = getProviderForModel(model);
  return provider ? PROVIDER_AVAILABLE[provider] : false;
}

function translateToolsForProvider(provider, tools) {
  if (!tools || !Array.isArray(tools) || tools.length === 0) return { native: null, serverTools: [] };
  const has = (name) => tools.includes(name);
  const serverToolNames = tools.filter(t => SERVER_TOOL_NAMES.includes(t));

  if (provider === 'claude') {
    const out = [];
    if (has('web_search')) out.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 5 });
    out.push(...getAnthropicTools(serverToolNames));
    return { native: out.length ? out : null, serverTools: serverToolNames };
  }
  if (provider === 'gemini') {
    const nativeTools = [];
    if (has('web_search')) nativeTools.push({ google_search: {} });
    const customFns = getGeminiTools(serverToolNames);
    const combined = [...nativeTools];
    if (customFns.length > 0) combined.push({ functionDeclarations: customFns });
    return { native: combined.length ? combined : null, serverTools: serverToolNames };
  }
  if (provider === 'openai') {
    const out = [];
    if (has('web_search')) out.push({ type: 'web_search' });
    const fns = getOpenAITools(serverToolNames);
    out.push(...fns);
    return { native: out.length ? out : null, serverTools: serverToolNames };
  }
  return { native: null, serverTools: [] };
}

function injectImagesIntoMessages(provider, messages, images) {
  if (!images || !Array.isArray(images) || images.length === 0) return messages;
  const msgs = messages.map(m => ({ ...m }));
  const lastUserIdx = msgs.findLastIndex(m => m.role === 'user');
  if (lastUserIdx === -1) return msgs;

  const lastMsg = msgs[lastUserIdx];
  const textContent = typeof lastMsg.content === 'string' ? lastMsg.content : lastMsg.content.map(c => c.text || '').join('');

  if (provider === 'claude') {
    const blocks = images.map(img => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mimeType, data: img.data },
    }));
    blocks.push({ type: 'text', text: textContent });
    msgs[lastUserIdx] = { role: 'user', content: blocks };
  } else if (provider === 'gemini') {
    msgs[lastUserIdx] = {
      role: 'user',
      content: textContent,
      _images: images,
    };
  } else if (provider === 'openai') {
    const parts = images.map(img => ({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType};base64,${img.data}` },
    }));
    parts.push({ type: 'text', text: textContent });
    msgs[lastUserIdx] = { role: 'user', content: parts };
  }

  return msgs;
}

export { getProviderForModel, isModelAvailable, translateToolsForProvider, injectImagesIntoMessages };
