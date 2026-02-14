// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Tools Hub (Agents)
// ═══════════════════════════════════════════

import { STATE } from '../state.js';
import { escapeHtml } from '../api.js';

export function renderAgents() {
  const key = STATE.apiKeyFull || 'inf_your_key_here';
  const base = window.location.origin + '/proxy';

  const tools = [
    {
      category: 'AI Coding',
      items: [
        {
          name: 'aider',
          icon: '',
          desc: 'AI pair programming in your terminal. Edit code across entire repos with Claude or Gemini.',
          github: 'https://github.com/Aider-AI/aider',
          config: `# Install\npip install aider-chat\n\n# Run with INFINITE\nexport ANTHROPIC_API_KEY=${key}\nexport ANTHROPIC_BASE_URL=${base}\naider --model claude-sonnet-4-5-20250929`,
          status: 'LIVE',
        },
        {
          name: 'Continue',
          icon: '',
          desc: 'Open-source AI coding agent for VS Code & JetBrains. Autocomplete, chat, and edit in your IDE.',
          github: 'https://github.com/continuedev/continue',
          config: `// ~/.continue/config.json\n{\n  "models": [{\n    "provider": "anthropic",\n    "model": "claude-sonnet-4-5-20250929",\n    "apiKey": "${key}",\n    "apiBase": "${base}"\n  }]\n}`,
          status: 'LIVE',
        },
        {
          name: 'Open WebUI',
          icon: '',
          desc: 'Self-hosted ChatGPT-like interface. Connect to any LLM API with a beautiful web UI.',
          github: 'https://github.com/open-webui/open-webui',
          config: `# Docker setup\ndocker run -d -p 3000:8080 \\\n  -e OPENAI_API_BASE_URL=${base}/v1 \\\n  -e OPENAI_API_KEY=${key} \\\n  ghcr.io/open-webui/open-webui:main`,
          status: 'LIVE',
        },
        {
          name: 'Tabby',
          icon: '',
          desc: 'Self-hosted AI coding assistant. Open-source GitHub Copilot alternative — runs on consumer GPUs.',
          github: 'https://github.com/TabbyML/tabby',
          config: `# Docker setup\ndocker run -d -p 8080:8080 \\\n  tabbyml/tabby serve \\\n  --model TabbyML/StarCoder-1B\n\n# Connect to INFINITE for chat\n# Settings > Model > Custom API\n# Base URL: ${base}\n# API Key: ${key}`,
          status: 'LIVE',
        },
      ]
    },
    {
      category: 'AI Agents',
      items: [
        {
          name: 'CrewAI',
          icon: '',
          desc: 'Multi-agent AI framework. Build teams of AI agents that collaborate on complex tasks.',
          github: 'https://github.com/crewAIInc/crewAI',
          config: `# Install\npip install crewai\n\n# .env\nANTHROPIC_API_KEY=${key}\nANTHROPIC_BASE_URL=${base}\n\n# Usage\nfrom crewai import Agent, Crew\nagent = Agent(\n  role="Analyst",\n  llm="anthropic/claude-sonnet-4-5-20250929"\n)`,
          status: 'LIVE',
        },
        {
          name: 'LangChain',
          icon: '',
          desc: 'Build LLM-powered applications with chains, agents, and retrieval. Supports custom API endpoints.',
          github: 'https://github.com/langchain-ai/langchain',
          config: `pip install langchain-anthropic\n\nfrom langchain_anthropic import ChatAnthropic\n\nllm = ChatAnthropic(\n  model="claude-sonnet-4-5-20250929",\n  api_key="${key}",\n  base_url="${base}"\n)`,
          status: 'LIVE',
        },
        {
          name: 'AutoGPT',
          icon: '',
          desc: 'Autonomous AI agent platform. Create agents that complete tasks independently.',
          github: 'https://github.com/Significant-Gravitas/AutoGPT',
          config: `# .env in AutoGPT directory\nANTHROPIC_API_KEY=${key}\n\n# Configure in settings\n# Set Claude as your default model\n# Point API base to INFINITE proxy`,
          status: 'LIVE',
        },
        {
          name: 'Eliza (ElizaOS)',
          icon: '',
          desc: 'Web3-native AI agent framework with Solana support. Build agents that trade, chat, and execute on-chain.',
          github: 'https://github.com/elizaOS/eliza',
          config: `# .env\nANTHROPIC_API_KEY=${key}\nGOOGLE_GENERATIVE_AI_API_KEY=${key}\nSOLANA_PRIVATE_KEY=your_key\nSOLANA_RPC_URL=https://mainnet.helius-rpc.com\n\n# Install & run\nnpx eliza --character=your_agent.json`,
          status: 'LIVE',
        },
      ]
    },
    {
      category: 'Solana Trading',
      items: [
        {
          name: 'Copy Trading Bot',
          icon: '',
          desc: 'Mirror trades from any wallet in real-time. Uses Helius WebSocket for 0.3ms latency filtering.',
          github: 'https://github.com/metaggdev/Copy-trading-bot',
          config: `# .env\nHELIUS_API_KEY=your_helius_key\nRPC_URL=https://mainnet.helius-rpc.com\nPRIVATE_KEY=your_wallet_key\nTARGET_WALLET=wallet_to_copy\n\n# AI Analysis (uses your INFINITE key)\nANTHROPIC_API_KEY=${key}\nANTHROPIC_BASE_URL=${base}`,
          status: 'LIVE',
        },
        {
          name: 'Solana Sniper Bot',
          icon: '',
          desc: 'Automated token sniper for Raydium and Pump.fun. Configurable buy/sell logic with AI-assisted filtering.',
          github: 'https://github.com/fdundjer/solana-sniper-bot',
          config: `# .env\nRPC_ENDPOINT=https://mainnet.helius-rpc.com\nPRIVATE_KEY=your_key\nQUOTE_MINT=SOL\nQUOTE_AMOUNT=0.1\nAUTO_SELL=true\nSTOP_LOSS=30\nTAKE_PROFIT=50`,
          status: 'LIVE',
        },
        {
          name: 'Solana Trade Bot',
          icon: '',
          desc: 'Multi-DEX trading bot for Raydium, Pumpfun, Orca, Moonshot, and Jupiter with SDK integration.',
          github: 'https://github.com/YZYLAB/solana-trade-bot',
          config: `# .env\nSOLANA_RPC_URL=https://mainnet.helius-rpc.com\nPRIVATE_KEY=your_private_key\nSLIPPAGE=10\nPRIORITY_FEE=0.001`,
          status: 'LIVE',
        },
        {
          name: 'Solana Agent Kit',
          icon: '',
          desc: 'AI agent framework for Solana. Execute trades, check balances, and chain tools with natural language.',
          github: 'https://github.com/truemagic-coder/solana-agent',
          config: `# .env\nANTHROPIC_API_KEY=${key}\nANTHROPIC_BASE_URL=${base}\nSOLANA_RPC_URL=https://mainnet.helius-rpc.com\nPRIVATE_KEY=your_key`,
          status: 'LIVE',
        },
        {
          name: 'Pump.fun Sniper',
          icon: '',
          desc: 'Open-source Pump.fun sniper bot for new Solana token launches. Configurable buy/sell with priority fees.',
          github: 'https://github.com/TreeCityWes/Pump-Fun-Trading-Bot-Solana',
          config: `# .env\nSOLANA_RPC_URL=https://mainnet.helius-rpc.com\nWALLET_PRIVATE_KEY=your_key\nQUOTE_MINT=SOL\nPRIORITY_FEE=0.001\nSLIPPAGE=10`,
          status: 'LIVE',
        },
        {
          name: 'Multi-Tool Bot',
          icon: '',
          desc: 'All-in-one: Raydium sniper, Pumpfun bundler, volume bot, copy trading, and wallet tracker in one package.',
          github: 'https://github.com/Immutal0/solana-trading-bot',
          config: `# .env\nRPC_URL=https://mainnet.helius-rpc.com\nPRIVATE_KEYS=["your_key"]\nBOT_MODE=sniper\nTELEGRAM_BOT_TOKEN=optional\nSLIPPAGE=15`,
          status: 'LIVE',
        },
      ]
    },
  ];

  return `
    <div class="page-header">
      <h1 class="page-title">Tools Hub</h1>
      <p class="page-sub">Pre-configured tools with your API key auto-filled. Clone, paste config, run.</p>
    </div>
    ${tools.map(cat => `
      <div class="tools-section">
        <div class="section-title">${cat.category}</div>
        <div class="tools-grid">
          ${cat.items.map(t => `
            <div class="tool-card" style="cursor:default;">
              <div class="tool-header">
                <span class="tool-icon">${t.icon}</span>
                <span class="tool-status${t.status === 'SOON' ? ' coming' : ''}">${t.status}</span>
              </div>
              <div class="tool-name">${t.name}</div>
              <div class="tool-desc">${t.desc}</div>
              <div class="tool-config-box">${escapeHtml(t.config)}</div>
              <div class="tool-card-actions">
                <a href="#" onclick="copyText(${JSON.stringify(t.config).replace(/"/g, '&quot;')});return false;">Copy Config</a>
                <a href="${t.github}" target="_blank" rel="noopener">GitHub</a>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `;
}
