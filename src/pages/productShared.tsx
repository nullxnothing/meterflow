import { ArrowRight } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ShaderCardBackground } from "@/components/ui/shader-card-background";
import { cn } from "@/lib/utils";

export type Card = {
  label?: string;
  title: string;
  copy: string;
};

export type FlowItem = {
  label: string;
  title: string;
  copy: string;
};

export type TokenSummary = {
  configured?: boolean;
  config?: {
    name?: string | null;
    symbol?: string | null;
    mint?: string | null;
    swapUrl?: string | null;
    orbUrl?: string | null;
    dexscreenerUrl?: string | null;
  };
  asset?: {
    name?: string | null;
    symbol?: string | null;
    description?: string | null;
    decimals?: number | null;
  };
  supply?: {
    circulating?: number | null;
    uiAmount?: number | null;
    decimals?: number | null;
  };
  market?: {
    pairAddress?: string | null;
    url?: string | null;
    priceUsd?: number | null;
    marketCap?: number | null;
    fdv?: number | null;
    volume24h?: number | null;
    liquidityUsd?: number | null;
    txns24h?: { buys?: number | null; sells?: number | null } | null;
    priceChange?: { m5?: number | null; h1?: number | null; h6?: number | null; h24?: number | null } | null;
  } | null;
  chart?: {
    dexEmbedUrl?: string | null;
    poolAddress?: string | null;
  } | null;
  holderCount?: number | null;
  links?: {
    orb?: string | null;
    dexscreener?: string | null;
    swap?: string | null;
  };
  sources?: string[];
  updatedAt?: string | null;
};

export const METERFLOW_TOKEN_MINT = "GrFTVNJi6JKbLRFTXSXYki72ovYWVmbvDcrHHS2mpump";
export const METERFLOW_BUY_URL = "/buy?input=SOL";

export function shortAddress(value?: string | null) {
  return value ? `${value.slice(0, 5)}...${value.slice(-5)}` : "Indexing";
}

export function isKnownNumber(value: unknown) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

export function formatUsd(value: unknown, maximumFractionDigits = 2) {
  if (!isKnownNumber(value)) return "Indexing";
  const n = Number(value);
  if (n > 0 && n < 0.01) return `$${n.toPrecision(3)}`;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits,
  }).format(n);
}

export function formatCompact(value: unknown) {
  if (!isKnownNumber(value)) return "Indexing";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export function formatPercent(value: unknown) {
  if (!isKnownNumber(value)) return "Indexing";
  return `${Number(value).toFixed(2)}%`;
}

export function tokenFallback(): TokenSummary {
  return {
    configured: true,
    config: {
      name: "Meterflow",
      symbol: "MFLOW",
      mint: METERFLOW_TOKEN_MINT,
      orbUrl: `https://orbmarkets.io/token/${METERFLOW_TOKEN_MINT}`,
      dexscreenerUrl: `https://dexscreener.com/solana/${METERFLOW_TOKEN_MINT}`,
      swapUrl: METERFLOW_BUY_URL,
    },
    market: null,
    links: {
      orb: `https://orbmarkets.io/token/${METERFLOW_TOKEN_MINT}`,
      dexscreener: `https://dexscreener.com/solana/${METERFLOW_TOKEN_MINT}`,
      swap: METERFLOW_BUY_URL,
    },
    sources: [],
    updatedAt: null,
  };
}

export function Page({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return <div className="mf-page">{children}</div>;
}

export function PageHero({
  kicker,
  title,
  lede,
  actions,
  aside,
}: {
  kicker: string;
  title: ReactNode;
  lede: string;
  actions?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className={cn("mf-page-hero", aside && "mf-page-hero--split")}>
      <div className="mf-page-hero__content">
        <p className="mf-kicker">{kicker}</p>
        <h1 className="mf-page-title">{title}</h1>
        <p className="mf-page-lede">{lede}</p>
        {actions ? <div className="mf-page-actions">{actions}</div> : null}
      </div>
      {aside ? <div className="mf-page-hero__aside">{aside}</div> : null}
    </header>
  );
}

export function Section({
  id,
  eyebrow,
  title,
  lede,
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: string;
  lede?: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("mf-section", className)}>
      <div className="mf-section-header">
        {eyebrow ? <p className="mf-kicker">{eyebrow}</p> : null}
        <h2 className="mf-section-title">{title}</h2>
        {lede ? <p className="mf-section-copy">{lede}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function CardGrid({ cards, columns = "three" }: { cards: Card[]; columns?: "two" | "three" }) {
  return (
    <div className={cn("mf-card-grid", columns === "two" && "mf-card-grid--two")}>
      {cards.map((card) => (
        <article className="mf-info-card" key={card.title}>
          {card.label ? <p className="mf-info-card__label">{card.label}</p> : null}
          <h3 className="mf-info-card__title">{card.title}</h3>
          <p className="mf-info-card__copy">{card.copy}</p>
        </article>
      ))}
    </div>
  );
}

export function Flow({ items }: { items: FlowItem[] }) {
  return (
    <div className="mf-flow">
      {items.map((item, index) => (
        <article className="mf-flow-step" key={item.title}>
          <span className="mf-flow-step__number">{String(index + 1).padStart(2, "0")}</span>
          <p className="mf-flow-step__label">{item.label}</p>
          <h3 className="mf-flow-step__title">{item.title}</h3>
          <p className="mf-flow-step__copy">{item.copy}</p>
        </article>
      ))}
    </div>
  );
}

export function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mf-doc-code">
      <code>{children.trim()}</code>
    </pre>
  );
}

export function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="mf-check-list">
      {items.map((item) => (
        <li key={item}>
          <span className="mf-check-list__mark" aria-hidden="true">
            /
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function MetricPanel({ items }: { items: Array<{ label: string; value: string; copy?: string }> }) {
  return (
    <div className="mf-metric-panel mf-has-shader">
      <ShaderCardBackground />
      {items.map((item) => (
        <div className="mf-metric-panel__item" key={item.label}>
          <p className="mf-metric-panel__label">{item.label}</p>
          <strong>{item.value}</strong>
          {item.copy ? <span>{item.copy}</span> : null}
        </div>
      ))}
    </div>
  );
}

export function CtaPanel({
  kicker,
  title,
  copy,
  href,
  action,
}: {
  kicker: string;
  title: string;
  copy: string;
  href: string;
  action: string;
}) {
  return (
    <section className="mf-cta-panel mf-has-shader">
      <ShaderCardBackground />
      <div>
        <p className="mf-kicker">{kicker}</p>
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
      <ButtonLink href={href}>
        {action}
        <ArrowRight className="h-4 w-4" />
      </ButtonLink>
    </section>
  );
}
