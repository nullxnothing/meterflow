import { ArrowRight, DatabaseZap, LockKeyhole, ShieldCheck, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ButtonLink } from "@/components/ui/button";
import {
  CardGrid,
  CtaPanel,
  Flow,
  formatCompact,
  formatUsd,
  METERFLOW_BUY_URL,
  MetricPanel,
  Page,
  PageHero,
  Section,
} from "@/pages/productShared";

type RegistryProvider = {
  id: string;
  slug: string;
  name: string;
  category: string;
  summary: string;
  endpoint: string;
  protocolRails: string[];
  paymentAsset: string;
  priceUsd: number;
  status: "forming" | "test" | "live" | "paused" | "archived";
  verification: "unverified" | "reviewing" | "verified" | "prime";
  bond: { asset: string; required: number; committed: number; state: string; unlockCooldownDays: number };
  metrics: { successfulCalls: number; verifiedUsd: number; uptimePct: number | null; p95LatencyMs: number | null; failureRatePct: number | null; receipts30d: number };
  policy: { supportsBudgets: boolean; supportsRefunds: boolean; piiGuard: boolean; agentAllowlisted: boolean };
  trustScore: number;
  trustTier: "emerging" | "candidate" | "verified" | "prime";
  tags: string[];
};

type RegistrySummary = {
  providers: number;
  liveProviders: number;
  verifiedProviders: number;
  averageTrustScore: number;
  committedMflow: number;
  requiredMflow: number;
  model: {
    paymentAsset: string;
    utilityAsset: string;
    thesis: string;
  };
};

const fallbackSummary: RegistrySummary = {
  providers: 3,
  liveProviders: 1,
  verifiedProviders: 1,
  averageTrustScore: 58,
  committedMflow: 250000,
  requiredMflow: 1100000,
  model: {
    paymentAsset: "USDC",
    utilityAsset: "MFLOW",
    thesis: "USDC settles paid requests; MFLOW coordinates provider trust, registry visibility, policy limits, analytics, and future bonding.",
  },
};

const fallbackProviders: RegistryProvider[] = [
  {
    id: "prv_meterflow_token_risk",
    slug: "meterflow-token-risk",
    name: "Meterflow Token Risk MCP",
    category: "risk-intelligence",
    summary: "Reference MCP capability for priced token risk checks, paid receipts, and budget-aware agent calls.",
    endpoint: "/mcp/token-risk",
    protocolRails: ["x402", "mpp", "mcp"],
    paymentAsset: "USDC",
    priceUsd: 0.006,
    status: "live",
    verification: "verified",
    bond: { asset: "MFLOW", required: 250000, committed: 250000, state: "treasury_aligned", unlockCooldownDays: 14 },
    metrics: { successfulCalls: 412, verifiedUsd: 2.47, uptimePct: 99.4, p95LatencyMs: 228, failureRatePct: 0.8, receipts30d: 412 },
    policy: { supportsBudgets: true, supportsRefunds: false, piiGuard: true, agentAllowlisted: true },
    trustScore: 84,
    trustTier: "verified",
    tags: ["mcp", "risk", "reference"],
  },
];

function providerStatusLabel(provider: RegistryProvider) {
  if (provider.status === "live") return "Live";
  if (provider.status === "forming") return "Cohort";
  return provider.status;
}

function bondLabel(provider: RegistryProvider) {
  if (provider.bond.state === "treasury_aligned") return "Aligned";
  if (provider.bond.state === "locked") return "Locked";
  if (provider.bond.state === "pending") return "Pending";
  return "Planned";
}

function percent(value: number | null) {
  if (value === null || value === undefined) return "Pending";
  return `${value.toFixed(1)}%`;
}

export function RegistryPage() {
  const [summary, setSummary] = useState<RegistrySummary>(fallbackSummary);
  const [providers, setProviders] = useState<RegistryProvider[]>(fallbackProviders);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "fallback">("loading");

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      fetch("/api/v1/registry/summary", { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`registry summary returned ${res.status}`);
        return res.json() as Promise<{ summary: RegistrySummary }>;
      }),
      fetch("/api/v1/registry/providers?limit=6", { cache: "no-store" }).then((res) => {
        if (!res.ok) throw new Error(`registry providers returned ${res.status}`);
        return res.json() as Promise<{ providers: RegistryProvider[] }>;
      }),
    ])
      .then(([summaryData, providersData]) => {
        if (cancelled) return;
        setSummary(summaryData.summary || fallbackSummary);
        setProviders(providersData.providers?.length ? providersData.providers : fallbackProviders);
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) setLoadState("fallback");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadedProviders = useMemo(() => providers.slice(0, 6), [providers]);

  return (
    <Page title="Provider Registry | Meterflow">
      <PageHero
        kicker="Provider Trust Registry"
        title={
          <>
            Agents can pay.
            <span>Now they need trust.</span>
          </>
        }
        lede="Meterflow turns x402 and MPP payment rails into a trust layer for paid Solana agent commerce. USDC settles the request; MFLOW coordinates provider reputation, registry visibility, policy limits, analytics, and future bonding."
        actions={
          <>
            <ButtonLink href="/apply">
              Apply as Provider
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href={METERFLOW_BUY_URL} variant="secondary">
              <Wallet className="h-4 w-4" />
              Buy MFLOW
            </ButtonLink>
          </>
        }
        aside={
          <MetricPanel
            items={[
              { label: "Payment asset", value: summary.model.paymentAsset, copy: "Settlement stays stable" },
              { label: "Utility asset", value: summary.model.utilityAsset, copy: "Trust, policy, registry signal" },
              { label: loadState === "loading" ? "Syncing" : "Registry", value: String(summary.providers), copy: "provider/capability listings" },
            ]}
          />
        }
      />

      <div className="mf-page-stack">
        <section className="mf-registry-principle" aria-label="Registry thesis">
          <div>
            <p className="mf-kicker">Network Thesis</p>
            <h2>USDC moves the money. MFLOW coordinates who agents can trust.</h2>
          </div>
          <p>{summary.model.thesis}</p>
        </section>

        <Section
          eyebrow="How It Works"
          title="A registry built for paid APIs, MCP tools, and autonomous buyers."
          lede="Payment protocols solve the checkout. Meterflow handles discovery, routing, spend policy, receipt history, and provider standing."
        >
          <Flow
            items={[
              { label: "Register", title: "Provider publishes a capability.", copy: "The listing includes endpoint, category, price, payment rails, refund posture, PII posture, and owner identity." },
              { label: "Bond", title: "Provider commits MFLOW utility.", copy: "The MVP tracks required and committed bond state; on-chain locking can follow once the registry has real provider demand." },
              { label: "Route", title: "Agents choose by trust score.", copy: "Trust combines verification, bond state, paid receipt volume, uptime, latency, failures, and budget support." },
              { label: "Receipt", title: "Every paid call improves the signal.", copy: "x402 and MPP receipts update provider reliability so rankings are tied to actual paid usage." },
            ]}
          />
        </Section>

        <Section
          eyebrow="Live Contract"
          title="The API exposes registry data agents can read."
          lede="The public registry endpoints are unpaid discovery routes. Builders can query providers before deciding where an agent should spend."
        >
          <div className="mf-registry-contract-grid">
            <article>
              <DatabaseZap className="h-5 w-5" />
              <span>GET</span>
              <strong>/v1/registry/providers</strong>
              <p>Filter by category, rail, status, verification, minimum trust score, and limit.</p>
            </article>
            <article>
              <ShieldCheck className="h-5 w-5" />
              <span>GET</span>
              <strong>/v1/registry/summary</strong>
              <p>Read network counts, average trust score, MFLOW bond totals, rails, and registry thesis.</p>
            </article>
            <article>
              <LockKeyhole className="h-5 w-5" />
              <span>ADMIN</span>
              <strong>/admin/registry/providers</strong>
              <p>Create and update verified listings while public responses omit admin-only review notes.</p>
            </article>
          </div>
        </Section>

        <Section
          eyebrow="Registry"
          title="Provider listings become a routing surface."
          lede="The first listings establish the scoring model. New providers can apply, get reviewed, publish a capability, and build reputation through real paid receipts."
        >
          <div className="mf-registry-stat-row">
            <article>
              <span>Providers</span>
              <strong>{summary.providers}</strong>
              <em>{summary.liveProviders} live</em>
            </article>
            <article>
              <span>Verified</span>
              <strong>{summary.verifiedProviders}</strong>
              <em>reviewed or prime</em>
            </article>
            <article>
              <span>MFLOW committed</span>
              <strong>{formatCompact(summary.committedMflow)}</strong>
              <em>{formatCompact(summary.requiredMflow)} target</em>
            </article>
          </div>

          <div className="mf-registry-provider-grid">
            {loadedProviders.map((provider) => (
              <article className="mf-registry-provider" key={provider.id}>
                <div className="mf-registry-provider__head">
                  <div>
                    <span>{provider.category.replace(/-/g, " ")}</span>
                    <h3>{provider.name}</h3>
                  </div>
                  <strong>{provider.trustScore}</strong>
                </div>
                <p>{provider.summary}</p>
                <div className="mf-registry-provider__meta">
                  <div><span>Status</span><strong>{providerStatusLabel(provider)}</strong></div>
                  <div><span>Bond</span><strong>{bondLabel(provider)}</strong></div>
                  <div><span>Price</span><strong>{formatUsd(provider.priceUsd, 3)}</strong></div>
                  <div><span>Uptime</span><strong>{percent(provider.metrics.uptimePct)}</strong></div>
                </div>
                <div className="mf-pill-row">
                  {provider.protocolRails.map((rail) => <span className="mf-pill" key={rail}>{rail}</span>)}
                  <span className="mf-pill">{provider.trustTier}</span>
                </div>
              </article>
            ))}
          </div>
        </Section>

        <Section
          eyebrow="Why Holders Care"
          title="MFLOW utility gets tied to network usefulness."
          lede="The registry gives MFLOW a concrete job in the product without forcing volatile token payments into every API request."
        >
          <CardGrid
            cards={[
              { label: "Provider bonding", title: "Providers need utility to earn trust.", copy: "Verified listings can require MFLOW commitments before providers receive stronger visibility, trust weight, and routing eligibility." },
              { label: "Route quality", title: "Holder utility maps to better controls.", copy: "MFLOW can unlock deeper analytics, longer receipt retention, higher policy limits, fee relief, and advanced provider filters." },
              { label: "Reputation", title: "Receipts create an audit trail.", copy: "Paid request history makes provider ranking harder to fake and gives the network a reason to value verified usage." },
              { label: "Governance ready", title: "Policy can evolve later.", copy: "Once there is real provider traffic, holders can help govern verification standards, category rules, and bond requirements." },
            ]}
            columns="two"
          />
        </Section>

        <CtaPanel
          kicker="Next Build Target"
          title="Turn useful Solana endpoints into trusted paid products."
          copy="The provider registry is the product bridge between x402/MPP payments, MCP tools, agent spend policy, MFLOW utility, and real paid usage."
          href="/apply"
          action="Apply as Provider"
        />
      </div>
    </Page>
  );
}
