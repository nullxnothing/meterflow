# INFINITE Protocol — Post-Launch Setup Checklist

Steps to activate all API providers once the token launches and treasury starts receiving fees.

---

## 1. Token Mint Configuration

After deploying the token on pump.fun:

```bash
# In api-proxy/.env, set your token's contract address:
INFINITE_TOKEN_MINT=<your_token_mint_address>
```

This enables token gating. Without it, all connected wallets get Operator tier by default.

---

## 2. Helius RPC (Required — Enables Wallet Verification)

Helius provides the RPC endpoint for checking $INFINITE token balances.

**Get a key:** https://dashboard.helius.dev

```bash
HELIUS_API_KEY=<your_helius_api_key>
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=<your_helius_api_key>
```

Free tier gives 100K credits/day which is plenty for balance checks.

---

## 3. Anthropic API (Enables Claude Models)

Powers AI Chat, Trading Agent, and any Claude-based features.

**Get a key:** https://console.anthropic.com/settings/keys

```bash
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

Models activated: `claude-sonnet-4-5-20250929`, `claude-opus-4-6`

**Pricing to budget for:**
- Sonnet: ~$3 input / $15 output per 1M tokens
- Opus: ~$15 input / $75 output per 1M tokens

---

## 4. Google Gemini API (Enables Image Lab, Video Lab, Gemini Chat)

Powers image generation, video generation (Veo 2), and Gemini chat models.

**Get a key:** https://aistudio.google.com/apikey

```bash
GOOGLE_API_KEY=AIzaSyxxxxx
```

Models/features activated:
- `gemini-2.5-pro`, `gemini-2.5-flash` (chat)
- `gemini-2.0-flash-exp` (image generation)
- `veo-2.0-generate-001` (video generation)

**Pricing to budget for:**
- Flash: ~$0.075 input / $0.30 output per 1M tokens
- Pro: ~$1.25 input / $10 output per 1M tokens
- Image generation: ~$0.04 per image
- Video generation: varies, check Google pricing

---

## 5. OpenAI API (Enables GPT Models)

Fallback provider for GPT-4o models.

**Get a key:** https://platform.openai.com/api-keys

```bash
OPENAI_API_KEY=sk-proj-xxxxx
```

Models activated: `gpt-4o`, `gpt-4o-mini`

**Pricing to budget for:**
- GPT-4o: ~$2.50 input / $10 output per 1M tokens
- GPT-4o-mini: ~$0.15 input / $0.60 output per 1M tokens

---

## 6. Admin Key (Secures Treasury Agent)

The treasury agent uses this key to push rate limit adjustments to the proxy.

```bash
ADMIN_KEY=<generate_a_random_256bit_hex_string>
```

Generate one:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the same key in both `api-proxy/.env` and `agent/.env`.

---

## 7. Treasury Agent Configuration

In `agent/.env`:

```bash
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=<your_helius_api_key>
TREASURY_WALLET=<your_treasury_wallet_public_key>
PROXY_URL=https://your-domain.com/proxy
ADMIN_KEY=<same_admin_key_as_proxy>
```

The treasury wallet is the one receiving pump.fun creator fees (the 50% API treasury split).

---

## 8. Vercel Environment Variables

Set all the above env vars in your Vercel project settings:

1. Go to Vercel dashboard > Project > Settings > Environment Variables
2. Add each variable for the **Production** environment
3. Redeploy after adding variables

Required variables:
- `HELIUS_API_KEY`
- `HELIUS_RPC_URL`
- `INFINITE_TOKEN_MINT`
- `ANTHROPIC_API_KEY`
- `GOOGLE_API_KEY`
- `OPENAI_API_KEY`
- `ADMIN_KEY`
- `API_KEY_SECRET` (random string for signing API keys)

---

## 9. Activation Order

Recommended order to bring services online:

1. **Helius RPC** — so wallet verification works
2. **Token mint** — so token gating activates
3. **Anthropic** — powers the core chat experience
4. **Google Gemini** — unlocks image/video generation + Gemini models
5. **OpenAI** — adds GPT models as fallback options
6. **Treasury agent** — monitors runway and adjusts rate limits

Each provider activates independently. The dashboard auto-detects which are live and shows "Coming Soon" for anything not yet configured.

---

## 10. Verify Everything Works

After setting env vars and redeploying:

```bash
# Check provider status
curl https://your-domain.com/proxy/providers

# Check health
curl https://your-domain.com/proxy/health

# Check stats
curl https://your-domain.com/proxy/stats
```

Expected `/providers` response when fully configured:
```json
{ "claude": true, "gemini": true, "openai": true }
```
