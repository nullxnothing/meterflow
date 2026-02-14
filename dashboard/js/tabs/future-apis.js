// ═══════════════════════════════════════════
// INFINITE Dashboard - Tab: Future APIs
// ═══════════════════════════════════════════

import { STATE, VOTES } from '../state.js';
import { escapeHtml } from '../api.js';
import { render } from '../render.js';

const FUTURE_APIS = [
  // RPC/Infrastructure
  { id: 'helius', name: 'Helius', category: 'RPC/Infrastructure', logo: 'https://dashboard.helius.dev/logos/logo-helius.svg', description: 'Premier Solana RPC provider with enhanced APIs for NFT metadata, transaction parsing, webhooks, and Digital Asset Standard API.', features: ['RPC', 'Webhooks', 'DAS API', 'NFT Metadata'], website: 'https://helius.dev' },
  { id: 'quicknode', name: 'QuickNode', category: 'RPC/Infrastructure', logo: 'https://www.gitbook.com/cdn-cgi/image/width=40,dpr=2,height=40,fit=contain,format=auto/https%3A%2F%2F1578191620-files.gitbook.io%2F~%2Ffiles%2Fv0%2Fb%2Fgitbook-x-prod.appspot.com%2Fo%2Fspaces%252F-Mf3KXQJ21hOqcm3xf03%252Ficon%252FBVmzTIFKQxm5Kik0vItS%252FQuickNode%2520Icon%2520Blue.png%3Falt%3Dmedia%26token%3D4acb23b9-bd6e-4cd7-8a6d-4f1d1b0c0096', description: 'Multi-chain RPC infrastructure with Solana support. Add-ons for NFT APIs, token data, and marketplace information.', features: ['Multi-chain', 'Global Edge', 'Add-ons', 'Low Latency'], website: 'https://quicknode.com' },
  { id: 'alchemy', name: 'Alchemy', category: 'RPC/Infrastructure', logo: 'https://www.datocms-assets.com/105223/1749761632-logo.svg', description: 'Enterprise-grade blockchain infrastructure with Solana support. Enhanced APIs, webhooks, and developer tools.', features: ['Enterprise', 'Webhooks', 'Dev Tools', 'High Uptime'], website: 'https://alchemy.com' },
  { id: 'triton', name: 'Triton', category: 'RPC/Infrastructure', logo: 'https://triton.one/img/logo-triton-icon.png', description: 'High-performance Solana RPC provider known for validator infrastructure. Powers major Solana dApps.', features: ['High Performance', 'Validators', 'Dedicated RPC', 'Shared RPC'], website: 'https://triton.one' },
  // DeFi/Trading
  { id: 'jupiter', name: 'Jupiter', category: 'DeFi/Trading', logo: 'https://www.helius.dev/api/logos/file/logo-jupiter-1.svg', description: 'The leading Solana DEX aggregator. Routes trades across all major AMMs for best prices with swap, limit order, and DCA APIs.', features: ['DEX Aggregator', 'Limit Orders', 'DCA', 'Best Prices'], website: 'https://jup.ag' },
  { id: 'raydium', name: 'Raydium', category: 'DeFi/Trading', logo: 'https://www.helius.dev/api/logos/file/logo-raydium-1.svg', description: 'Major Solana AMM and liquidity provider. APIs for swaps, pools, and concentrated liquidity positions.', features: ['AMM', 'Liquidity Pools', 'CLMM', 'Swaps'], website: 'https://raydium.io' },
  { id: 'orca', name: 'Orca', category: 'DeFi/Trading', logo: 'https://www.helius.dev/api/logos/file/logo-orca.svg', description: 'User-friendly Solana DEX with concentrated liquidity (Whirlpools). SDKs for programmatic trading and liquidity provision.', features: ['Whirlpools', 'CLMM', 'SDK', 'User-Friendly'], website: 'https://orca.so' },
  { id: 'pumpfun', name: 'Pump.fun', category: 'DeFi/Trading', logo: 'https://www.helius.dev/api/logos/file/pump-fun-logo.svg', description: 'Popular token launchpad on Solana for memecoins. Essential for tracking new launches and early trading opportunities.', features: ['Token Launch', 'Memecoins', 'Bonding Curves', 'Early Access'], website: 'https://pump.fun' },
  // Data/Analytics
  { id: 'birdeye', name: 'Birdeye', category: 'Data/Analytics', logo: 'https://www.helius.dev/api/logos/file/birdeye-logo.svg', description: 'Comprehensive Solana token analytics. Real-time prices, OHLCV data, holder info, security analysis, and trending tokens.', features: ['Token Data', 'OHLCV', 'Security Scan', 'Trending'], website: 'https://birdeye.so' },
  { id: 'dexscreener', name: 'DexScreener', category: 'Data/Analytics', logo: 'https://www.helius.dev/api/logos/file/dexscreener-logo.svg', description: 'Multi-chain DEX analytics with excellent Solana coverage. Real-time charts, pair data, new listings, and trending tokens.', features: ['Multi-chain', 'Charts', 'New Listings', 'Trending'], website: 'https://dexscreener.com' },
  { id: 'defillama', name: 'DeFiLlama', category: 'Data/Analytics', logo: 'https://defillama.com/defillama-dark.png', description: 'Open/free API for DeFi TVL, yields, and protocol analytics across all chains. Essential for macro DeFi data.', features: ['TVL Data', 'Yields', 'Free API', 'Cross-chain'], website: 'https://defillama.com' },
  { id: 'coingecko', name: 'CoinGecko', category: 'Data/Analytics', logo: 'https://static.coingecko.com/s/coingecko-logo-8903d34ce19ca4be1c81f0db30e924154750d208683fad7ae6f2ce06c76d0a56.png', description: 'Major crypto data aggregator with token prices, market caps, volumes, and historical data. Free and pro tiers available.', features: ['Prices', 'Market Cap', 'Volume', 'Historical'], website: 'https://coingecko.com' },
  // NFT
  { id: 'magiceden', name: 'Magic Eden', category: 'NFT', logo: 'https://www.helius.dev/api/logos/file/logo-magiceden.svg', description: 'Largest Solana NFT marketplace. APIs for listings, sales, collections, and marketplace data for trading bots.', features: ['Marketplace', 'Listings', 'Sales Data', 'Collections'], website: 'https://magiceden.io' },
  { id: 'tensor', name: 'Tensor', category: 'NFT', logo: 'https://www.helius.dev/api/logos/file/logo-tensor-1.svg', description: 'Professional Solana NFT trading platform with AMM pools, bids, and real-time data. Growing API for pro traders.', features: ['Pro Trading', 'AMM Pools', 'Bids', 'Real-time'], website: 'https://tensor.trade' },
  { id: 'metaplex', name: 'Metaplex', category: 'NFT', logo: 'https://www.helius.dev/api/logos/file/logo-metaplex.svg', description: 'Core NFT infrastructure on Solana. Standards, tools, and APIs for creating and managing NFTs and digital assets.', features: ['NFT Standard', 'cNFTs', 'Tooling', 'Metadata'], website: 'https://metaplex.com' },
  // Social/Alerts
  { id: 'twitter', name: 'Twitter/X API', category: 'Social/Alerts', logo: 'https://abs.twimg.com/responsive-web/client-web/icon-ios.77d25eba.png', description: 'Essential for crypto social signals, influencer tracking, sentiment analysis, and automated posting.', features: ['Social Signals', 'Sentiment', 'Auto-Post', 'Influencers'], website: 'https://developer.twitter.com' },
  { id: 'telegram', name: 'Telegram Bot API', category: 'Social/Alerts', logo: 'https://telegram.org/img/t_logo.png', description: 'Free API for alert bots, trading notifications, community management, and conversational interfaces.', features: ['Bots', 'Alerts', 'Free', 'Communities'], website: 'https://core.telegram.org/bots/api' },
  { id: 'discord', name: 'Discord API', category: 'Social/Alerts', logo: 'https://www.helius.dev/api/logos/file/logo-discord-1.svg', description: 'Powers community bots for alerts, trading signals, and automated notifications. Essential for crypto communities.', features: ['Bots', 'Webhooks', 'Communities', 'Alerts'], website: 'https://discord.com/developers' },
  // Emerging
  { id: 'shyft', name: 'Shyft', category: 'Emerging', logo: 'https://shyft.to/assets/shyft-logo-symbol.png', description: 'Solana-focused API with transaction parsing, wallet tracking, token APIs, and webhooks. Growing Helius alternative.', features: ['Parsing', 'Wallets', 'Webhooks', 'Tokens'], website: 'https://shyft.to' },
  { id: 'hellomoon', name: 'Hello Moon', category: 'Emerging', logo: 'https://www.hellomoon.io/assets/hellomoon-logo.svg', description: 'Solana analytics and data API platform. Indexed blockchain data, NFT analytics, DeFi metrics, and wallet intelligence.', features: ['Analytics', 'Indexed Data', 'NFT Metrics', 'Wallets'], website: 'https://hellomoon.io' },
];

const API_CATEGORIES = ['All', 'RPC/Infrastructure', 'DeFi/Trading', 'Data/Analytics', 'NFT', 'Social/Alerts', 'Emerging'];

let selectedApiCategory = 'All';

function getApiVoteCount(apiId) {
  return VOTES.voteCounts[apiId] || 0;
}

export function renderFutureApis() {
  const filteredApis = selectedApiCategory === 'All' 
    ? FUTURE_APIS 
    : FUTURE_APIS.filter(api => api.category === selectedApiCategory);
  
  const sortedApis = [...filteredApis].sort((a, b) => {
    return getApiVoteCount(b.id) - getApiVoteCount(a.id);
  });

  return `
    <div class="page-header">
      <h1 class="page-title">Future API Integrations</h1>
      <p class="page-sub">Vote for the APIs you want integrated into INFINITE Protocol</p>
    </div>
    <div class="future-apis-note">
      <strong style="color:var(--accent)">How it works:</strong> Upvote the APIs you'd like to see integrated. 
      The most requested APIs will be prioritized in our roadmap. Your vote helps shape the future of INFINITE.
    </div>
    <div class="future-apis-tabs">
      ${API_CATEGORIES.map(cat => `
        <button class="future-apis-tab ${selectedApiCategory === cat ? 'active' : ''}" onclick="filterApiCategory('${cat}')">${cat}</button>
      `).join('')}
    </div>
    <div class="future-apis-grid">
      ${sortedApis.map(api => {
        const voteCount = getApiVoteCount(api.id);
        const hasVoted = VOTES.userVotes.has(api.id);
        return `
          <div class="api-card">
            <div class="api-card-logo">
              <img src="${api.logo}" alt="${api.name}" onerror="this.style.display='none';this.parentElement.innerHTML='<div style=\\'width:48px;height:48px;background:var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--accent);font-size:18px;\\'>${api.name.charAt(0)}</div>'">
            </div>
            <div class="api-card-content">
              <div class="api-card-header">
                <div class="api-card-name">${api.name}</div>
                <div class="api-card-category">${api.category}</div>
              </div>
              <div class="api-card-desc">${api.description}</div>
              <div class="api-card-features">
                ${api.features.map(f => `<span class="api-card-feature">${f}</span>`).join('')}
              </div>
              <div class="api-card-footer">
                <a href="${api.website}" target="_blank" rel="noopener" class="api-card-link">${api.website.replace('https://', '')}</a>
                <button class="api-upvote-btn ${hasVoted ? 'voted' : ''}" onclick="toggleVote('${api.id}')">
                  <span class="arrow">${hasVoted ? '▲' : '△'}</span>
                  ${voteCount.toLocaleString()}
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

export function filterApiCategory(category) {
  selectedApiCategory = category;
  render();
}

// Attach to window for onclick handlers
window.filterApiCategory = filterApiCategory;
