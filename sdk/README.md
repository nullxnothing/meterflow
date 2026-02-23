# @infinite-protocol/sdk

SDK for INFINITE Protocol — token-gated AI API access on Solana.

Zero dependencies. Works in Node.js 18+ and modern browsers.

## Install

```bash
npm install @infinite-protocol/sdk
```

## Quick Start

```js
import { InfiniteClient } from '@infinite-protocol/sdk';

const client = new InfiniteClient({
  apiKey: 'inf_xxxxx',
});

// Chat completion
const response = await client.chat({
  model: 'claude-sonnet-4-5-20250929',
  messages: [{ role: 'user', content: 'Hello!' }],
});
console.log(response.content[0].text);

// Streaming
const stream = client.chatStream({
  model: 'gemini-2.5-flash',
  messages: [{ role: 'user', content: 'Write a haiku' }],
});
for await (const event of stream) {
  if (event.type === 'content_delta') process.stdout.write(event.text);
}

// Multi-model (unique to INFINITE)
const multi = await client.multi({
  models: ['claude-sonnet-4-5-20250929', 'gemini-2.5-flash'],
  messages: [{ role: 'user', content: 'What is Solana?' }],
});
multi.responses.forEach(r => console.log(`${r.model}: ${r.content[0].text}`));

// Multi-model streaming
const multiStream = client.multiStream({
  models: ['claude-sonnet-4-5-20250929', 'gemini-2.5-flash'],
  messages: [{ role: 'user', content: 'Explain DeFi' }],
});
for await (const event of multiStream) {
  console.log(event.type, event.model, event.text || '');
}

// Image generation
const image = await client.image({ prompt: 'A neon Solana logo' });

// Protocol status
const status = await client.status();
const treasury = await client.treasury();
```

## API

### `new InfiniteClient(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | *required* | Your INFINITE API key (`inf_xxxxx`) |
| `baseUrl` | `string` | `https://infinitekeys.fun/proxy` | API base URL |
| `timeout` | `number` | `30000` | Request timeout in ms |

### Methods

| Method | Returns | Description |
|--------|---------|-------------|
| `chat(params)` | `Promise<ChatResponse>` | Single model chat completion |
| `chatStream(params)` | `AsyncGenerator<StreamEvent>` | Streaming chat completion |
| `multi(params)` | `Promise<MultiResponse>` | Parallel multi-model inference |
| `multiStream(params)` | `AsyncGenerator<MultiStreamEvent>` | Streaming multi-model |
| `image(params)` | `Promise<Object>` | Image generation |
| `status()` | `Promise<Object>` | Your tier, balance, usage |
| `treasury()` | `Promise<TreasuryStatus>` | Live treasury data |
| `providers()` | `Promise<Object>` | Available AI providers |

## Models

| Tier | Models |
|------|--------|
| Signal (10K tokens) | Claude Sonnet, Gemini Flash, GPT-4o Mini |
| Operator (100K tokens) | + Gemini Pro, GPT-4o |
| Architect (1M tokens) | + Claude Opus |

## License

MIT
