#!/usr/bin/env node

import { MeterflowClient } from '../src/client.js';
import { buildBudgetFromTemplate, listBudgetTemplates, simulateBudget } from '../src/budget-templates.js';

const [, , command, ...args] = process.argv;

function argValue(name, fallback = undefined) {
  const long = `--${name}`;
  const index = args.findIndex(arg => arg === long || arg.startsWith(`${long}=`));
  if (index === -1) return fallback;
  const item = args[index];
  if (item.includes('=')) return item.split('=').slice(1).join('=');
  return args[index + 1] ?? fallback;
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function apiKey() {
  const key = argValue('api-key', process.env.METERFLOW_API_KEY);
  if (!key) {
    throw new Error('Missing Meterflow API key. Set METERFLOW_API_KEY or pass --api-key mf_xxxxx.');
  }
  return key;
}

function client() {
  return new MeterflowClient({
    apiKey: apiKey(),
    baseUrl: argValue('base-url', process.env.METERFLOW_BASE_URL),
  });
}

function printJson(data) {
  console.log(JSON.stringify(data, null, 2));
}

function help() {
  console.log(`Meterflow CLI

Usage:
  meterflow meters
  meterflow create-meter --route /api/risk-score --price 0.006 --method POST
  meterflow receipts --limit 25
  meterflow budget-templates
  meterflow create-budget --template research_agent --agent market-bot
  meterflow simulate-budget --daily-cap 5 --per-call-cap 0.02 --calls 120
  meterflow publish-mcp --name token-risk --route /mcp/token-risk --price 0.006

Environment:
  METERFLOW_API_KEY      Meterflow API key
  METERFLOW_BASE_URL     Optional API base URL, defaults to production proxy
`);
}

async function main() {
  try {
    switch (command) {
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        help();
        break;

      case 'meters':
        printJson(await client().meters());
        break;

      case 'create-meter': {
        const route = argValue('route');
        const priceUsd = Number(argValue('price', argValue('price-usd')));
        if (!route || !Number.isFinite(priceUsd)) {
          throw new Error('create-meter requires --route and --price.');
        }
        printJson(await client().createMeter({
          route,
          method: argValue('method', 'POST').toUpperCase(),
          priceUsd,
          asset: argValue('asset', 'USDC'),
          unit: argValue('unit', 'request'),
          status: argValue('status', 'test'),
          ownerWallet: argValue('wallet'),
        }));
        break;
      }

      case 'receipts':
        printJson(await client().receipts({
          meterId: argValue('meter-id'),
          status: argValue('status'),
          limit: argValue('limit', 25),
        }));
        break;

      case 'budget-templates':
        printJson({ templates: listBudgetTemplates() });
        break;

      case 'create-budget': {
        const templateId = argValue('template', 'research_agent');
        const budget = buildBudgetFromTemplate(templateId, {
          name: argValue('name'),
          agentId: argValue('agent', argValue('agent-id')),
          dailyCapUsd: argValue('daily-cap'),
          perCallCapUsd: argValue('per-call-cap'),
        });
        printJson(await client().createBudget(budget));
        break;
      }

      case 'simulate-budget':
        printJson(simulateBudget({
          dailyCapUsd: Number(argValue('daily-cap', 0)),
          perCallCapUsd: Number(argValue('per-call-cap', 0)),
          callsPerDay: Number(argValue('calls', 0)),
          averageCallPriceUsd: argValue('avg-price') ? Number(argValue('avg-price')) : null,
        }));
        break;

      case 'publish-mcp': {
        const name = argValue('name');
        if (!name) throw new Error('publish-mcp requires --name.');
        printJson(await client().createMcpTool({
          name,
          manifestUrl: argValue('manifest'),
          route: argValue('route'),
          priceUsd: argValue('price') ? Number(argValue('price')) : undefined,
          status: argValue('status', hasFlag('live') ? 'live' : 'test'),
        }));
        break;
      }

      default:
        throw new Error(`Unknown command: ${command}. Run meterflow help.`);
    }
  } catch (err) {
    console.error(`Meterflow CLI error: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
