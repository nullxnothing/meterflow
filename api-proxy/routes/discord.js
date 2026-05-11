import { Router } from 'express';
import nacl from 'tweetnacl';
import { PROVIDER_AVAILABLE } from '../config.js';
import { getTreasuryBalance } from '../lib/balance.js';
import { logger } from '../lib/logger.js';

const router = Router();
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY?.trim();

const LINKS = {
  dashboard: 'https://www.meterflow.fun/dashboard',
  docs: 'https://www.meterflow.fun/docs',
  apply: 'https://www.meterflow.fun/apply',
  github: 'https://github.com/nullxnothing/meterflow',
  status: 'https://www.meterflow.fun/status',
};

function linkButton(label, url) {
  return { type: 2, style: 5, label, url };
}

function commandResponse(content, components = []) {
  return {
    type: 4,
    data: {
      content,
      components,
      allowed_mentions: { parse: [] },
    },
  };
}

function verifyDiscordRequest(req) {
  if (!PUBLIC_KEY) return false;
  const signature = req.get('x-signature-ed25519');
  const timestamp = req.get('x-signature-timestamp');
  const rawBody = req.rawBody;
  if (!signature || !timestamp || !rawBody) return false;

  return nacl.sign.detached.verify(
    Buffer.from(timestamp + rawBody),
    Buffer.from(signature, 'hex'),
    Buffer.from(PUBLIC_KEY, 'hex'),
  );
}

async function statusResponse() {
  const balance = await getTreasuryBalance();
  const providers = Object.entries(PROVIDER_AVAILABLE)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name)
    .join(', ') || 'none';

  return commandResponse(
    [
      '**Meterflow status**',
      `Treasury: ${balance.usdc.toFixed(6)} USDC / ${balance.sol.toFixed(6)} SOL`,
      `Providers: ${providers}`,
      `Live status: ${LINKS.status}`,
    ].join('\n'),
    [{ type: 1, components: [linkButton('Status', LINKS.status), linkButton('Dashboard', LINKS.dashboard)] }],
  );
}

function receiptResponse(interaction) {
  const tx = interaction.data?.options?.find(option => option.name === 'tx')?.value;
  const content = tx
    ? [
        `Receipt lookup for \`${tx}\``,
        'Open the dashboard receipts view and search by transaction signature, wallet, route, or receipt ID.',
      ].join('\n')
    : 'Open the dashboard receipts view to inspect paid requests, settlement signatures, and policy outcomes.';

  return commandResponse(content, [
    { type: 1, components: [linkButton('Open Dashboard', LINKS.dashboard), linkButton('Docs', LINKS.docs)] },
  ]);
}

router.post('/interactions', async (req, res) => {
  if (!verifyDiscordRequest(req)) {
    return res.status(401).json({ error: 'invalid_signature' });
  }

  const interaction = req.body;
  if (interaction.type === 1) return res.json({ type: 1 });
  if (interaction.type !== 2) return res.status(400).json({ error: 'unsupported_interaction' });

  try {
    switch (interaction.data?.name) {
      case 'status':
        return res.json(await statusResponse());
      case 'docs':
        return res.json(commandResponse(`Meterflow docs: ${LINKS.docs}`, [
          { type: 1, components: [linkButton('Docs', LINKS.docs), linkButton('Dashboard', LINKS.dashboard)] },
        ]));
      case 'dashboard':
        return res.json(commandResponse(`Launch Meterflow: ${LINKS.dashboard}`, [
          { type: 1, components: [linkButton('Dashboard', LINKS.dashboard)] },
        ]));
      case 'apply':
        return res.json(commandResponse(`Provider application: ${LINKS.apply}`, [
          { type: 1, components: [linkButton('Apply', LINKS.apply), linkButton('Docs', LINKS.docs)] },
        ]));
      case 'github':
        return res.json(commandResponse(`Meterflow GitHub: ${LINKS.github}`, [
          { type: 1, components: [linkButton('GitHub', LINKS.github)] },
        ]));
      case 'receipt':
        return res.json(receiptResponse(interaction));
      default:
        return res.json(commandResponse(`Unknown command. Try ${LINKS.docs}`));
    }
  } catch (err) {
    logger.error('Discord interaction failed', { err: err.message });
    return res.json(commandResponse('Meterflow command failed. Check the status page or try again shortly.', [
      { type: 1, components: [linkButton('Status', LINKS.status)] },
    ]));
  }
});

export default router;
