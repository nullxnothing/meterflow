import { Activity, ArrowRight, Code2, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { ButtonLink } from "@/components/ui/button";
import { ShaderCardBackground } from "@/components/ui/shader-card-background";
import { cn } from "@/lib/utils";
import { useRoadmapMotion } from "@/src/components/site/RoadmapMotion";

type Card = {
  label?: string;
  title: string;
  copy: string;
};

type FlowItem = {
  label: string;
  title: string;
  copy: string;
};

const pageMap: Record<string, ReactNode> = {
  "/docs": <DocsPage />,
  "/docs.html": <DocsPage />,
  "/how-it-works": <HowItWorksPage />,
  "/how-it-works.html": <HowItWorksPage />,
  "/token": <TokenPage />,
  "/token.html": <TokenPage />,
  "/roadmap": <RoadmapPage />,
  "/roadmap.html": <RoadmapPage />,
};

export function productPageForPath(pathname: string) {
  return pageMap[pathname.replace(/\/$/, "") || "/"] ?? null;
}

export function ProductRoute({ path }: { path: string }) {
  return <>{productPageForPath(path)}</>;
}

function Page({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = title;
  }, [title]);

  return <div className="mf-page">{children}</div>;
}

function PageHero({
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

function Section({
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

function CardGrid({ cards, columns = "three" }: { cards: Card[]; columns?: "two" | "three" }) {
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

function Flow({ items }: { items: FlowItem[] }) {
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

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="mf-doc-code">
      <code>{children.trim()}</code>
    </pre>
  );
}

function Checklist({ items }: { items: string[] }) {
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

function MetricPanel({ items }: { items: Array<{ label: string; value: string; copy?: string }> }) {
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

function CtaPanel({
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

function DocsPage() {
  return (
    <Page title="Docs | Meterflow">
      <PageHero
        kicker="Documentation"
        title="Build with Meterflow."
        lede="Use x402 or MPP for the live payment path, then use Meterflow for the control plane around it: hosted gateways, MCP packaging, receipt normalization, failed-payment state, agent budgets, provider revenue, registry signal, and webhooks."
        actions={
          <>
            <ButtonLink href="/dashboard">
              <Wallet className="h-4 w-4" />
              Launch Dashboard
            </ButtonLink>
            <ButtonLink href="#wrap-api" variant="secondary">
              <Code2 className="h-4 w-4" />
              Wrap an API
            </ButtonLink>
          </>
        }
        aside={
          <MetricPanel
            items={[
              { label: "Rails", value: "x402 + MPP", copy: "Normalized into one receipt model" },
              { label: "Surface", value: "MCP / API", copy: "Priced tools, routes, and providers" },
              { label: "State", value: "Receipts", copy: "Quote, proof, payer, result, latency" },
            ]}
          />
        }
      />

      <div className="mf-doc-layout">
        <aside className="mf-doc-sidebar" aria-label="Docs navigation">
          <p className="mf-doc-sidebar__title">Docs</p>
          <a href="#concepts">Concepts</a>
          <a href="#payment-flow">Payment Flow</a>
          <a href="#wrap-api">Wrap Your API In 10 Minutes</a>
          <a href="#mpp">MPP Payment Rail</a>
          <a href="#registry">Provider Registry</a>
          <a href="#webhooks">Webhooks</a>
        </aside>

        <div className="mf-doc-content">
          <Section
            className="mf-section--first"
            eyebrow="Concepts"
            title="Meterflow routes are priced product surfaces."
            lede="A payment handshake proves a request can clear. Meterflow keeps the product layer around that request: route pricing, policy checks, receipts, budget decisions, provider revenue, registry signal, and signed events."
          >
            <CardGrid
              cards={[
                {
                  label: "Meters",
                  title: "Define the billable route.",
                  copy: "Set target URL, method, unit, price, provider, state, and optional upstream auth without exposing provider secrets.",
                },
                {
                  label: "Receipts",
                  title: "Normalize every paid call.",
                  copy: "Track quote, proof, payer, rail, route, amount, policy result, upstream status, latency, and settlement metadata.",
                },
                {
                  label: "Budgets",
                  title: "Let agents spend within policy.",
                  copy: "Issue wallet-bound limits with daily caps, per-call caps, route allowlists, expiration, and revocation.",
                },
              ]}
            />
          </Section>

          <Section
            id="payment-flow"
            eyebrow="Payment Flow"
            title="Request. Quote. Pay. Verify. Respond."
            lede="Meterflow keeps x402 and MPP callers on the same operational path so dashboards, webhooks, and accounting do not fork by payment rail."
          >
            <Flow
              items={[
                { label: "Unpaid request", title: "Agent calls a metered route.", copy: "The gateway identifies the route, price, provider, and policy context." },
                { label: "HTTP 402", title: "Meterflow returns a quote.", copy: "The quote includes the amount, asset, settlement target, and required payment protocol." },
                { label: "Paid retry", title: "The caller submits proof.", copy: "x402 and MPP proofs normalize into the same request context." },
                { label: "Verification", title: "Policy and payment clear.", copy: "Budgets, route state, and payment details are recorded before forwarding." },
                { label: "Receipt", title: "The response becomes observable.", copy: "Providers get revenue state, payer visibility, delivery status, latency, and webhook events." },
              ]}
            />
          </Section>

          <Section
            id="wrap-api"
            eyebrow="Guide"
            title="Wrap Your API In 10 Minutes"
            lede="Create a hosted meter, point it at your existing HTTPS API, and send callers to the generated gateway route."
          >
            <CodeBlock>{`
const { meter } = await client.createHostedMeter({
  targetUrl: "https://api.example.com",
  method: "GET",
  unit: "lookup",
  priceUsd: 0.01,
  providerName: "Example Data API",
  status: "test",
});

console.log(meter.route); // /gateway/mtr_xxxxx/*
            `}</CodeBlock>
            <Checklist
              items={[
                "Create a Meterflow API key from the dashboard.",
                "Define targetUrl, method, priceUsd, unit, and providerName.",
                "Test the meter with POST /v1/meters/:id/test.",
                "Send callers to /proxy/gateway/{meterId}/...",
                "Watch receipts, provider revenue, webhooks, and budget decisions.",
              ]}
            />
          </Section>

          <Section
            id="mpp"
            eyebrow="Protocol Adapter"
            title="MPP Payment Rail"
            lede="MPP is mounted as an additive HTTP 402 rail beside x402. Providers do not create separate meters for MPP; any billable route can accept an MPP caller when the gateway is configured for Solana USDC."
          >
            <CardGrid
              columns="two"
              cards={[
                {
                  label: "Caller Opt-In",
                  title: "Headers and query params select MPP.",
                  copy: "Callers can use X-Meterflow-Payment-Protocol, Accept-Payment, paymentProtocol, or Authorization: Payment on retry.",
                },
                {
                  label: "Receipt Shape",
                  title: "MPP receipts stay first-class.",
                  copy: "Payment protocol, intent, method, reference, payer, route, amount, policy result, status, and latency share the same model as x402.",
                },
              ]}
            />
          </Section>

          <Section
            id="registry"
            eyebrow="Discovery"
            title="Provider Registry"
            lede="The registry turns paid endpoints into a market ranked by verification, price, uptime, latency, receipt volume, utility tier, and provider reputation."
          >
            <CardGrid
              cards={[
                { label: "Providers", title: "Publish priced capabilities.", copy: "Hosted API routes and MCP tools can expose metadata agents can reason about." },
                { label: "Operators", title: "Choose by live signal.", copy: "Registry listings can reflect reliability, cost, receipt history, and policy fit." },
                { label: "$MFLOW", title: "Utility wraps usage.", copy: "Token utility can raise limits, retain analytics, reduce fees, and strengthen registry placement." },
              ]}
            />
          </Section>

          <Section
            id="webhooks"
            eyebrow="Events"
            title="Receipts, settlement, revenue, and webhooks."
            lede="Providers can query revenue state and subscribe to signed delivery events such as receipt.created, receipt.verified, and payment.failed."
          >
            <CodeBlock>{`
POST /v1/webhooks
{
  "url": "https://provider.example.com/meterflow",
  "events": ["receipt.created", "receipt.verified", "payment.failed"]
}
            `}</CodeBlock>
          </Section>
        </div>
      </div>
    </Page>
  );
}

function HowItWorksPage() {
  return (
    <Page title="How It Works | Meterflow">
      <PageHero
        kicker="How It Works"
        title="APIs that ask agents to pay before they run."
        lede="Wrap APIs and MCP tools with meters, return x402 or MPP HTTP 402 quotes, settle paid requests in Solana USDC context, and keep receipts, spend caps, provider revenue, and webhooks in one control plane."
        actions={
          <>
            <ButtonLink href="/docs">
              Read Docs
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/apply" variant="secondary">
              Apply as Provider
            </ButtonLink>
          </>
        }
        aside={
          <MetricPanel
            items={[
              { label: "Protocol", value: "HTTP 402", copy: "Quote and retry flow" },
              { label: "Settlement", value: "USDC", copy: "Solana payment context" },
              { label: "Control", value: "Budgets", copy: "Caps before agents spend" },
            ]}
          />
        }
      />

      <div className="mf-page-stack">
        <Section
          eyebrow="01 / The Problem"
          title="AI agents need tools, but tools need a way to charge machines."
          lede="Most APIs still assume monthly accounts, human checkout, shared cards, or unlimited wallet access. Meterflow turns each paid request into a metered product event."
        >
          <CardGrid
            columns="two"
            cards={[
              {
                label: "For providers",
                title: "Bill per request without rebuilding billing.",
                copy: "Keep your API, add a hosted paid gateway, then get receipts, revenue views, and policy state.",
              },
              {
                label: "For agents",
                title: "Spend with bounded authority.",
                copy: "Agents can call paid tools through budgets, allowlists, caps, and observable receipt history.",
              },
            ]}
          />
        </Section>

        <Section
          eyebrow="02 / The Flow"
          title="Request. Quote. Pay. Verify. Respond."
          lede="The gateway makes the paid request path explicit and repeatable across APIs, MCP tools, and future payment rails."
        >
          <Flow
            items={[
              { label: "Route", title: "A provider creates a meter.", copy: "The meter defines price, method, route state, target origin, and provider metadata." },
              { label: "Quote", title: "An agent calls the route.", copy: "The unpaid call receives an HTTP 402 quote with payment requirements." },
              { label: "Pay", title: "The agent retries with proof.", copy: "x402 or MPP payment proof is attached to the paid retry." },
              { label: "Policy", title: "Meterflow verifies context.", copy: "Budgets, route allowlists, limits, and settlement metadata are checked." },
              { label: "Receipt", title: "Provider and operator see the outcome.", copy: "Receipts capture the payer, route, amount, status, latency, and webhook delivery path." },
            ]}
          />
        </Section>

        <Section
          eyebrow="03 / Built For Solana"
          title="Payment context without losing product context."
          lede="Solana USDC settlement can move value; Meterflow keeps the surrounding operational state providers and operators need."
        >
          <CardGrid
            cards={[
              { label: "USDC Native", title: "Stable request pricing.", copy: "Routes can be priced in dollars while settlement references Solana USDC." },
              { label: "Wallet Policies", title: "Spend limits before execution.", copy: "Wallet-bound budgets avoid open-ended agent spend while preserving autonomy." },
              { label: "Receipts", title: "Proof after every paid call.", copy: "Providers can reconcile revenue, failures, latency, and settlement references." },
            ]}
          />
        </Section>

        <Section
          eyebrow="04 / For Developers"
          title="Add a payment meter without building billing from scratch."
          lede="Start with one hosted API route, then expand into MCP tools, registry metadata, budgets, webhooks, and provider revenue."
        >
          <CodeBlock>{`
curl -X POST https://meterflow.fun/proxy/v1/meters \\
  -H "Authorization: Bearer mf_live_xxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "targetUrl": "https://api.example.com/risk",
    "method": "POST",
    "unit": "risk-check",
    "priceUsd": 0.006
  }'
          `}</CodeBlock>
        </Section>

        <CtaPanel
          kicker="Launch"
          title="Meter your API. Control agent spend."
          copy="Use the dashboard to create a route, test the quote path, and watch the first receipt."
          href="/dashboard"
          action="Launch Dashboard"
        />
      </div>
    </Page>
  );
}

function TokenPage() {
  return (
    <Page title="$MFLOW Token | Meterflow">
      <PageHero
        kicker="Mf / Meterflow Token"
        title={
          <>
            $MFLOW <span>the utility layer.</span>
          </>
        }
        lede="$MFLOW wraps the Meterflow network with access, provider reputation, higher policy limits, analytics, and long-term alignment while paid requests settle in USDC on Solana."
        actions={
          <>
            <ButtonLink href="/dashboard">
              Launch Dashboard
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/docs" variant="secondary">
              Read Utility Docs
            </ButtonLink>
          </>
        }
        aside={
          <div className="mf-token-panel mf-has-shader">
            <ShaderCardBackground />
            <p className="mf-token-panel__label">Pre-launch</p>
            <h2>$MFLOW</h2>
            <p>Contract address, market links, and explorer references are TBA until launch.</p>
            <div className="mf-pill-row">
              <span className="mf-pill">Trade Coming Soon</span>
              <span className="mf-pill">Market TBA</span>
              <span className="mf-pill">Explorer TBA</span>
            </div>
          </div>
        }
      />

      <div className="mf-page-stack">
        <Section eyebrow="Market Snapshot" title="Launch details stay explicit until public markets are live.">
          <div className="mf-metric-grid">
            <article className="mf-metric-card">
              <span>Price</span>
              <strong>TBA</strong>
            </article>
            <article className="mf-metric-card">
              <span>Market cap</span>
              <strong>TBA</strong>
            </article>
            <article className="mf-metric-card">
              <span>Volume</span>
              <strong>TBA</strong>
            </article>
            <article className="mf-metric-card">
              <span>Contract</span>
              <strong>TBA</strong>
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
          lede="One clean token page for the holder thesis. $MFLOW sits around Meterflow as the utility layer for APIs, MCP tools, and paid routes. As usage grows, provider reputation, registry ranking, analytics, limits, and fee relief become the reason to hold; the token becomes the utility layer around that activity."
        >
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
          kicker="Before Launch"
          title="Spin up a meter while you wait for $MFLOW."
          copy="The useful network starts with priced APIs, MCP tools, receipts, budgets, and provider revenue."
          href="/docs"
          action="Start Building"
        />
      </div>
    </Page>
  );
}

const roadmapPhases = [
  {
    status: "shipped",
    phase: "01",
    title: "Metering Foundation",
    copy: "Route catalog, hosted external API gateway, dashboard/API keys, and usage accounting.",
    items: ["Hosted gateway routes", "Meter create/test flows", "Usage and route state"],
  },
  {
    status: "live",
    phase: "02",
    title: "Receipt Graph And Payment State",
    copy: "Quote, proof, payer, route, provider, response state, latency, and exportable accounting.",
    items: ["Per-endpoint quote", "Payer wallet and proof", "Receipt ledger and exports"],
  },
  {
    status: "live",
    phase: "03",
    title: "Provider Revenue",
    copy: "Aggregate calls, gross revenue, verified revenue, failures, and latency by meter.",
    items: ["Provider revenue view", "Failed-payment state", "Webhook delivery state"],
  },
  {
    status: "live",
    phase: "04",
    title: "Agent Budget Vaults",
    copy: "Wallet-bound daily caps, per-call caps, route allowlists, expirations, and revocation.",
    items: ["Budget policies", "Route allowlists", "Operator receipt visibility"],
  },
  {
    status: "live",
    phase: "05",
    title: "MCP/API Launchpad",
    copy: "Package MCP tools and external API routes as priced capabilities agents can call.",
    items: ["MCP tool registration", "Hosted API wrapper", "Provider apply flow"],
  },
  {
    status: "next",
    phase: "06",
    title: "x402 And MPP Adapter",
    copy: "Keep x402 live while MPP opt-in calls normalize into the same receipt and policy layer.",
    items: ["MPP challenge support", "Protocol metadata", "Unified receipt model"],
  },
  {
    status: "next",
    phase: "07",
    title: "Open Provider Registry",
    copy: "Registration, custom meters, revenue share, provider earnings, and registry ranking.",
    items: ["Public provider profiles", "Reliability metrics", "Utility-backed signal"],
  },
  {
    status: "planned",
    phase: "08",
    title: "$MFLOW Utility Layer",
    copy: "Access, provider reputation, higher policy limits, analytics, fee relief, and long-term network alignment.",
    items: ["Holder utility tiers", "Provider reputation", "Registry ranking"],
  },
];

const roadmapPillars = ["Gateway", "Receipts", "Budgets", "Registry", "MFLOW"] as const;
const roadmapPhasePillars = ["Gateway", "Receipts", "Receipts", "Budgets", "Registry", "Gateway", "Registry", "MFLOW"] as const;

function RoadmapPage() {
  const roadmapRef = useRef<HTMLDivElement>(null);

  useRoadmapMotion(roadmapRef);

  return (
    <Page title="Roadmap | Meterflow">
      <div className="mf-roadmap-page" ref={roadmapRef}>
        <PageHero
          kicker="Product Map"
          title="Agent commerce. Solana control plane."
          lede="A practical roadmap for hosted API gateways, paid MCP tools, x402/MPP flows, receipts, budget policies, provider revenue, registry signal, and the MFLOW utility layer."
          actions={
            <>
              <ButtonLink href="/docs">
                Build with Meterflow
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/status" variant="secondary">
                <Activity className="h-4 w-4" />
                Status
              </ButtonLink>
            </>
          }
          aside={
            <MetricPanel
              items={[
                { label: "Now", value: "Gateway", copy: "Meters, receipts, budgets" },
                { label: "Next", value: "Registry", copy: "Provider distribution" },
                { label: "Planned", value: "MFLOW", copy: "Utility and alignment" },
              ]}
            />
          }
        />

        <div className="mf-page-stack">
          <section className="mf-roadmap-strip" aria-label="Roadmap pillars">
            {roadmapPillars.map((item) => (
              <span key={item} data-roadmap-pillar={item}>
                {item}
              </span>
            ))}
          </section>

          <section className="mf-timeline" aria-label="Roadmap timeline">
            <span className="mf-roadmap-progress" aria-hidden="true" />
            {roadmapPhases.map((phase, index) => (
              <article className="mf-timeline-item" key={phase.title} data-roadmap-pillar={roadmapPhasePillars[index]}>
                <div className="mf-timeline-item__rail">
                  <span>{phase.phase}</span>
                </div>
                <div className="mf-timeline-item__body">
                  <div className="mf-timeline-item__head">
                    <span className={cn("mf-status-pill", `mf-status-pill--${phase.status}`)}>{phase.status}</span>
                    <h2>{phase.title}</h2>
                  </div>
                  <p>{phase.copy}</p>
                  <Checklist items={phase.items} />
                </div>
              </article>
            ))}
          </section>

          <CtaPanel
            kicker="Vision"
            title="Agents need trusted paid tools. Providers need distribution."
            copy="The roadmap is focused on the operational layer that turns paid requests into products agents can discover, afford, and trust."
            href="/apply"
            action="Apply as Provider"
          />
        </div>
      </div>
    </Page>
  );
}
