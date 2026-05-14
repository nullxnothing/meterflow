import { Activity, ArrowRight } from "lucide-react";
import { useRef } from "react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRoadmapMotion } from "@/components/site/RoadmapMotion";
import { Checklist, CtaPanel, MetricPanel, Page, PageHero } from "@/pages/productShared";

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

export function RoadmapPage() {
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
