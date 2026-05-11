const $ = id => document.getElementById(id);

function formatUsd(value, maxDigits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  if (n > 0 && n < 0.01) return '$' + n.toPrecision(3);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: maxDigits }).format(n);
}

function formatCompact(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '--';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
}

function shortAddress(value) {
  return value ? `${value.slice(0, 5)}...${value.slice(-5)}` : '--';
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? '--';
}

function setLink(id, href) {
  const el = $(id);
  if (!el) return;
  if (href) {
    el.href = href;
    el.target = '_blank';
    el.rel = 'noopener';
    el.classList.remove('disabled');
  } else {
    el.href = '/token';
    el.removeAttribute('target');
    el.removeAttribute('rel');
    el.classList.add('disabled');
  }
}

function setStatus(title, detail) {
  setText('tokenStatus', title);
  setText('tokenStatusDetail', detail);
}

function setComingSoonState() {
  setText('tokenAddress', 'TBA');
  setText('tokenAddressLabel', 'Contract address');
  setText('tokenUpdated', 'TBA');
  setText('metricPrice', 'TBA');
  setText('metricChange', 'coming soon');
  setText('metricMarketCap', 'TBA');
  setText('metricLiquidity', 'TBA');
  setText('metricDex', 'coming soon');
  setText('metricVolume', 'TBA');
  setText('metricTxns', 'coming soon');
  setText('metricSupply', 'TBA');
  setText('metricDecimals', 'coming soon');
  setText('metricHolders', 'TBA');
  setText('metricTopPct', 'coming soon');
  setText('tokenDescription', '$MFLOW details are coming soon.');
  setText('detailPair', 'TBA');
  setText('detailFdv', 'TBA');
  setText('detailChanges', 'TBA');
  setText('detailSources', 'Coming soon');
  setText('chartSource', 'TBA');
  setText('swapLink', 'Coming Soon');
  setText('orbLink', 'Explorer TBA');
  setText('dexLink', 'Market TBA');
  setText('holdersExplorer', 'TBA');
  renderChart([]);
  renderHolders([]);
}

function renderChart(candles) {
  const svg = $('priceChart');
  const wrap = $('chartWrap');
  if (!svg || !wrap) return;
  svg.textContent = '';
  const points = (candles || []).filter(c => Number.isFinite(Number(c.close)));
  if (points.length < 2) {
    wrap.classList.remove('has-data');
    return;
  }
  wrap.classList.add('has-data');
  const width = 720;
  const height = 260;
  const pad = 18;
  const closes = points.map(p => Number(p.close));
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || max || 1;
  const coords = closes.map((close, index) => {
    const x = pad + (index / (closes.length - 1)) * (width - pad * 2);
    const y = height - pad - ((close - min) / range) * (height - pad * 2);
    return [x, y];
  });
  const line = coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const ns = 'http://www.w3.org/2000/svg';
  const areaEl = document.createElementNS(ns, 'polygon');
  areaEl.setAttribute('points', area);
  areaEl.setAttribute('class', 'chart-area');
  const lineEl = document.createElementNS(ns, 'polyline');
  lineEl.setAttribute('points', line);
  lineEl.setAttribute('class', 'chart-line');
  svg.append(areaEl, lineEl);
}

function renderHolders(holders) {
  const body = $('holdersBody');
  if (!body) return;
  body.textContent = '';
  if (!holders?.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 5;
    cell.textContent = 'Holder data appears after launch.';
    return;
  }
  holders.forEach(holder => {
    const row = body.insertRow();
    row.insertCell().textContent = holder.rank;
    const walletCell = row.insertCell();
    const link = document.createElement('a');
    link.href = holder.orbUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = shortAddress(holder.owner);
    walletCell.append(link);
    row.insertCell().textContent = formatCompact(holder.amount);
    row.insertCell().textContent = Number.isFinite(holder.pctSupply) ? `${holder.pctSupply.toFixed(2)}%` : '--';
    row.insertCell().textContent = holder.accounts || 1;
  });
}

function applySummary(data) {
  const cfg = data.config || {};
  const symbol = cfg.symbol || 'MFLOW';
  setText('tokenSymbol', `$${symbol.replace(/^\$/, '')}`);
  setText('tokenAddress', cfg.mint || 'TBA');
  setText('tokenAddressLabel', 'Contract address');
  setLink('orbLink', data.links?.orb || cfg.orbUrl);
  setLink('dexLink', data.links?.dexscreener || cfg.dexscreenerUrl);
  setLink('swapLink', data.links?.swap || cfg.swapUrl);
  setLink('holdersExplorer', data.links?.orb || cfg.orbUrl);

  if (!data.configured) {
    setStatus('Coming soon', 'Official token details will appear here after launch.');
    setComingSoonState();
    return;
  }

  const asset = data.asset || {};
  const market = data.market || {};
  const supply = data.supply || {};
  const topHolder = data.holders?.[0];

  setText('swapLink', 'Trade');
  setText('orbLink', 'View on Orb');
  setText('dexLink', 'DEX Screener');
  setText('holdersExplorer', 'Open token');
  setStatus(market?.priceUsd ? 'Market data available' : 'Token details available', market?.priceUsd ? 'Public token data is updating.' : 'Market data is coming soon.');
  setText('tokenName', asset.name || cfg.name || 'Meterflow');
  setText('tokenDescription', asset.description || '$MFLOW token details are available on Solana.');
  setText('tokenUpdated', data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : '--');

  setText('metricPrice', formatUsd(market.priceUsd, 8));
  setText('metricChange', Number.isFinite(market.priceChange?.h24) ? `${market.priceChange.h24.toFixed(2)}% 24h` : '--');
  setText('metricMarketCap', formatUsd(market.marketCap || market.fdv, 0));
  setText('metricLiquidity', formatUsd(market.liquidityUsd, 0));
  setText('metricDex', market.dexId || '--');
  setText('metricVolume', formatUsd(market.volume24h, 0));
  setText('metricTxns', Number.isFinite(market.txns24h?.buys) ? `${market.txns24h.buys + market.txns24h.sells} txns` : '--');
  setText('metricSupply', formatCompact(supply.circulating || supply.uiAmount));
  setText('metricDecimals', Number.isFinite(asset.decimals) ? `${asset.decimals} decimals` : '--');
  setText('metricHolders', Number.isFinite(data.holderCount) ? formatCompact(data.holderCount) : (topHolder ? shortAddress(topHolder.owner) : '--'));
  setText('metricTopPct', Number.isFinite(topHolder?.pctSupply) ? `top ${topHolder.pctSupply.toFixed(2)}%` : '--');

  setText('detailPair', market.pairAddress ? shortAddress(market.pairAddress) : '--');
  setText('detailFdv', formatUsd(market.fdv, 0));
  const changes = market.priceChange
    ? [market.priceChange.m5, market.priceChange.h1, market.priceChange.h6].map(v => Number.isFinite(v) ? `${v.toFixed(1)}%` : '--').join(' / ')
    : '--';
  setText('detailChanges', changes);
  setText('detailSources', (data.sources || []).join(', ') || '--');
  setText('chartSource', data.chart?.poolAddress ? `Pool ${shortAddress(data.chart.poolAddress)}` : 'GeckoTerminal');
  renderChart(data.chart?.candles || []);
  renderHolders(data.holders || []);
}

async function loadToken() {
  try {
    const res = await fetch('/proxy/v1/token', { cache: 'no-store' });
    if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
    const data = await res.json();
    applySummary(data);
  } catch (err) {
    setStatus('Coming soon', 'Official token details will appear here after launch.');
    setComingSoonState();
  }
}

$('copyTokenAddress')?.addEventListener('click', async () => {
  const mint = $('tokenAddress')?.textContent || '';
  if (!mint || mint === 'TBA') return;
  await navigator.clipboard.writeText(mint);
  setText('copyTokenAddress', 'Copied');
  setTimeout(() => setText('copyTokenAddress', 'Copy'), 1200);
});

loadToken();
