import { Copy, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ShaderCardBackground } from "@/components/ui/shader-card-background";
import { cn } from "@/lib/utils";
import {
  CardGrid,
  CtaPanel,
  formatCompact,
  formatPercent,
  formatUsd,
  isKnownNumber,
  METERFLOW_TOKEN_MINT,
  Page,
  PageHero,
  Section,
  shortAddress,
  tokenFallback,
  type TokenSummary,
} from "@/pages/productShared";

export function TokenPage() {
  const [summary, setSummary] = useState<TokenSummary>(() => tokenFallback());
  const [loadState, setLoadState] = useState<"loading" | "ready" | "fallback">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/v1/token?refresh=1", { cache: "no-store" })
      .then((res) => {
        if (!res.ok) throw new Error(`token endpoint returned ${res.status}`);
        return res.json() as Promise<TokenSummary>;
      })
      .then((data) => {
        if (cancelled) return;
        const fallback = tokenFallback();
        setSummary({
          ...fallback,
          ...data,
          configured: data.configured || fallback.configured,
          config: {
            ...fallback.config,
            ...data.config,
            mint: data.config?.mint || fallback.config?.mint,
          },
          links: {
            ...fallback.links,
            ...data.links,
          },
        });
        setLoadState(data.configured === false ? "fallback" : "ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("fallback");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const cfg = summary.config || tokenFallback().config!;
  const market = summary.market || null;
  const symbol = (summary.asset?.symbol || cfg.symbol || "MFLOW").replace(/^\$/, "");
  const mint = cfg.mint || METERFLOW_TOKEN_MINT;
  const dexUrl = summary.links?.dexscreener || cfg.dexscreenerUrl || `https://dexscreener.com/solana/${mint}`;
  const swapUrl = summary.links?.swap || cfg.swapUrl || dexUrl;
  const orbUrl = summary.links?.orb || cfg.orbUrl || `https://orbmarkets.io/token/${mint}`;
  const txns24h =
    isKnownNumber(market?.txns24h?.buys) && isKnownNumber(market?.txns24h?.sells)
      ? Number(market?.txns24h?.buys) + Number(market?.txns24h?.sells)
      : null;
  const updatedAt = summary.updatedAt ? new Date(summary.updatedAt).toLocaleTimeString() : loadState === "loading" ? "Loading" : "Indexing";
  const statusLabel = loadState === "loading" ? "Syncing" : market?.priceUsd ? "Live" : "Indexing";
  const description =
    summary.asset?.description ||
    "$MFLOW wraps Meterflow as the utility layer for APIs, MCP tools, paid routes, provider reputation, fee relief, higher policy limits, analytics, and receipt retention.";

  const copyMint = async () => {
    await navigator.clipboard.writeText(mint);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <Page title="$MFLOW Token | Meterflow">
      <PageHero
        kicker="Mf / Meterflow Token"
        title={
          <>
            ${symbol} <span>the utility layer.</span>
          </>
        }
        lede="$MFLOW wraps the Meterflow network with access, provider reputation, higher policy limits, analytics, and long-term alignment while paid requests settle in USDC on Solana."
        actions={
          <>
            <ButtonLink href={swapUrl} target="_blank" rel="noopener">
              Trade
              <ExternalLink className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href={dexUrl} target="_blank" rel="noopener" variant="secondary">
              Market
              <ExternalLink className="h-4 w-4" />
            </ButtonLink>
          </>
        }
        aside={
          <div className="mf-token-panel mf-has-shader">
            <ShaderCardBackground />
            <div className="mf-token-panel__top">
              <p className="mf-token-panel__label">Solana token</p>
              <span className={cn("mf-token-state", statusLabel === "Live" && "mf-token-state--live")}>{statusLabel}</span>
            </div>
            <h2>${symbol}</h2>
            <p>{description}</p>
            <div className="mf-token-address">
              <span>CA</span>
              <code>{mint}</code>
              <Button type="button" variant="ghost" size="sm" onClick={copyMint}>
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <div className="mf-pill-row">
              <a className="mf-pill" href={swapUrl} target="_blank" rel="noopener">Trade</a>
              <a className="mf-pill" href={dexUrl} target="_blank" rel="noopener">DEX Screener</a>
              <a className="mf-pill" href={orbUrl} target="_blank" rel="noopener">Explorer</a>
            </div>
          </div>
        }
      />

      <div className="mf-page-stack">
        <Section eyebrow="Market Snapshot" title="Live token data, with indexing fallbacks.">
          <div className="mf-metric-grid">
            <article className="mf-metric-card">
              <span>Price</span>
              <strong>{formatUsd(market?.priceUsd, 8)}</strong>
              <em>{formatPercent(market?.priceChange?.h24)} 24h</em>
            </article>
            <article className="mf-metric-card">
              <span>Market cap</span>
              <strong>{formatUsd(market?.marketCap || market?.fdv, 0)}</strong>
              <em>{market?.marketCap ? "live market cap" : market?.fdv ? "FDV fallback" : "indexing"}</em>
            </article>
            <article className="mf-metric-card">
              <span>Volume</span>
              <strong>{formatUsd(market?.volume24h, 0)}</strong>
              <em>{txns24h ? `${formatCompact(txns24h)} txns` : "indexing"}</em>
            </article>
            <article className="mf-metric-card">
              <span>Contract</span>
              <strong>{shortAddress(mint)}</strong>
              <em>Updated {updatedAt}</em>
            </article>
          </div>
        </Section>

        <Section
          eyebrow="Utility"
          title="Utility that maps to the product."
          lede="The token is not the payment rail for every request. Paid calls settle in USDC; $MFLOW sits around the network as utility for access, reputation, analytics, retention, and alignment."
        >
          <CardGrid
            cards={[
              { label: "Access", title: "Higher policy limits.", copy: "Holder utility can raise dashboard, route, budget, and analytics limits as network usage expands." },
              { label: "Providers", title: "Reputation and ranking signal.", copy: "Provider reputation and registry ranking can reflect verified usage, reliability, and utility-tier alignment." },
              { label: "Receipts", title: "Longer retention and analytics.", copy: "Receipts, exports, revenue views, and operational analytics can scale with utility tier." },
              { label: "Fees", title: "Protocol fee relief.", copy: "Fee relief can be based on actual MFLOW balance instead of loose access-tier labels." },
              { label: "Network", title: "Alignment around usage.", copy: "The token becomes the utility layer around that activity as APIs, MCP tools, and paid routes grow." },
              { label: "Control", title: "Operator and provider policy.", copy: "Utility can bind to wallet identity, provider standing, spend controls, and product limits." },
            ]}
          />
        </Section>

        <Section
          eyebrow="Product Linkage"
          title="$MFLOW sits around Meterflow."
          lede={`${mint} is wired into the Meterflow token page and API surface. As usage grows, provider reputation, registry ranking, analytics, limits, and fee relief become the reason to hold; the token becomes the utility layer around that activity.`}
        >
          <div className="mf-token-data-grid">
            <article>
              <span>Pair</span>
              <strong>{market?.pairAddress ? shortAddress(market.pairAddress) : "Indexing"}</strong>
            </article>
            <article>
              <span>Liquidity</span>
              <strong>{formatUsd(market?.liquidityUsd, 0)}</strong>
            </article>
            <article>
              <span>Supply</span>
              <strong>{formatCompact(summary.supply?.circulating || summary.supply?.uiAmount)}</strong>
            </article>
            <article>
              <span>Holders</span>
              <strong>{formatCompact(summary.holderCount)}</strong>
            </article>
          </div>
          <div className="mf-rail">
            <div>
              <span>Meter</span>
              <strong>Price and package a route.</strong>
            </div>
            <div>
              <span>Enforce</span>
              <strong>Apply budgets and policy.</strong>
            </div>
            <div>
              <span>Attribute</span>
              <strong>Record receipts and revenue.</strong>
            </div>
            <div>
              <span>Scale</span>
              <strong>Use utility to expand limits.</strong>
            </div>
          </div>
        </Section>

        <CtaPanel
          kicker="Live Utility"
          title={`Use ${symbol} utility around Meterflow.`}
          copy="The useful network starts with priced APIs, MCP tools, receipts, budgets, provider revenue, and wallet-bound utility."
          href="/dashboard"
          action="Launch Dashboard"
        />
      </div>
    </Page>
  );
}
