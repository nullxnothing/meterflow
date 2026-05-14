const $ = id => document.getElementById(id);

function setSummary(state, text) {
  $('statusSummary').innerHTML = `<span class="status-dot ${state}"></span><span>${text}</span>`;
}

function setCard(prefix, title, detail) {
  $(`${prefix}Status`).textContent = title;
  $(`${prefix}Detail`).textContent = detail;
}

function providerList(providers) {
  return Object.entries(providers || {})
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(', ') || 'none';
}

async function json(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response.json();
}

async function latestSmokeRun() {
  try {
    const data = await json('https://api.github.com/repos/nullxnothing/meterflow/actions/workflows/production-smoke.yml/runs?per_page=1');
    return data.workflow_runs?.[0] || null;
  } catch {
    return null;
  }
}

async function loadStatus() {
  try {
    const [health, aggregate, smoke] = await Promise.all([
      json('/proxy/health'),
      json('/proxy/status/aggregate'),
      latestSmokeRun(),
    ]);

    const redisOk = health.storage?.redis?.connected;
    const postgresOk = !health.storage?.postgres?.configured || health.storage?.postgres?.connected;
    const storageOk = redisOk && postgresOk;
    const x402Ok = !!health.ops?.x402PayToConfigured;
    const providers = providerList(aggregate.providers);
    const providerOk = providers !== 'none';
    const smokeOk = smoke?.conclusion === 'success';
    const apiOk = health.status === 'ok';

    setCard('api', apiOk ? 'Operational' : 'Degraded', `Protocol ${health.protocol || 'Meterflow'} · ${health.status}`);
    setCard('storage', storageOk ? 'Operational' : 'Degraded', `Redis ${redisOk ? 'connected' : 'down'} · Postgres ${postgresOk ? 'connected' : 'down'}`);
    setCard('payment', x402Ok ? 'Operational' : 'Needs Config', x402Ok ? 'x402 settlement recipient configured.' : 'Settlement recipient is missing.');
    setCard('treasury', aggregate.treasury?.healthStatus || 'Unknown', `${Number(aggregate.treasury?.treasuryBalanceUsdc || 0).toFixed(6)} USDC · ${Number(aggregate.treasury?.treasuryBalanceSol || 0).toFixed(6)} SOL`);
    setCard('provider', providerOk ? 'Operational' : 'Unavailable', `Active providers: ${providers}`);
    setCard('smoke', smoke ? (smokeOk ? 'Passing' : 'Needs Review') : 'Unavailable', smoke ? `${smoke.display_title || 'Production Smoke'} · ${smoke.status}/${smoke.conclusion || 'pending'}` : 'GitHub workflow status unavailable.');

    if (apiOk && storageOk && x402Ok && providerOk && (!smoke || smokeOk)) {
      setSummary('ok', 'All monitored Meterflow systems are operational.');
    } else {
      setSummary('warn', 'Meterflow is reachable, but at least one check needs review.');
    }
  } catch (err) {
    setSummary('bad', 'Unable to load production status.');
    setCard('api', 'Unavailable', err.message);
  }
}

loadStatus();
setInterval(loadStatus, 60_000);
