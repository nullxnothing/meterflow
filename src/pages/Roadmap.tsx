import { Activity, ArrowRight, Wallet } from "lucide-react";
import { useRef } from "react";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRoadmapMotion } from "@/components/site/RoadmapMotion";
import { Checklist, CtaPanel, MetricPanel, Page, PageHero } from "@/pages/productShared";

const roadmapPhases = [
  {
    status: "shipped",
    phase: "01",
    title: "x402 Metered Routes",
    copy: "Turn API routes into priced, machine-payable endpoints with dashboard accounts, API key management, route meters, and proxy enforcement.",
    items: ["x402 price metadata", "Hosted gateway routes", "Usage accounting and quotas"],
  },
  {
    status: "live",
    phase: "02",
    title: "MPP-Compatible Agent Commerce",
    copy: "Expose machine-readable route, price, and acceptance metadata so agents can discover, price, call, pay, and verify provider services.",
    items: ["MPP route metadata", "Agent-ready paid calls", "Unified proof handling"],
  },
  {
    status: "live",
    phase: "03",
    title: "Receipts And Payment State",
    copy: "Connect quotes, Solana USDC payment proof, payer wallet, route, response state, latency, and exportable accounting records.",
    items: ["Per-endpoint quote", "Payer wallet and proof", "Receipt ledger and exports"],
  },
  {
    status: "live",
    phase: "04",
    title: "Agent Budgets And Wallet Policy",
    copy: "Give agents wallet-bound spending controls before payment: route allowlists, per-call caps, daily caps, alerts, and revocation.",
    items: ["Budget policies", "Pre-payment checks", "Alerts and revocation"],
  },
  {
    status: "live",
    phase: "05",
    title: "MCP Tool Monetization",
    copy: "Package, price, meter, and monitor MCP tools from one dashboard with hosted gateway paths, receipt streams, and agent-facing discovery metadata.",
    items: ["Paid MCP gateway paths", "Tool pricing and metering", "Provider apply flow"],
  },
  {
    status: "live",
    phase: "06",
    title: "MFLOW Provider Trust Registry",
    copy: "Give agents a public discovery layer for paid endpoints ranked by verification, MFLOW bond state, receipt history, uptime, latency, failures, and budget support.",
    items: ["Public registry API", "Trust score model", "MFLOW bond state"],
  },
  {
    status: "next",
    phase: "07",
    title: "Embedded MFLOW Purchase Flow",
    copy: "Keep users on Meterflow for MFLOW access with a cleaner Jupiter-powered purchase page instead of dropping every buy button onto the Jupiter site.",
    items: ["Embedded swap page", "SOL and USDC entry points", "Wallet-friendly purchase state"],
  },
  {
    status: "planned",
    phase: "08",
    title: "On-Chain Provider Bonding",
    copy: "Move registry commitments from tracked bond state into wallet-signed MFLOW lockups with cooldowns, review workflows, delegated trust, and future governance over provider standards.",
    items: ["Wallet-signed MFLOW lockups", "Delegated trust", "Verification governance"],
  },
];

const roadmapPillars = ["x402", "MPP", "Receipts", "MCP", "MFLOW"] as const;
const roadmapPhasePillars = ["x402", "MPP", "Receipts", "Receipts", "MCP", "MCP", "MFLOW", "MFLOW"] as const;

export function RoadmapPage() {
  const roadmapRef = useRef<HTMLDivElement>(null);

  useRoadmapMotion(roadmapRef);

  return (
    <Page title="Roadmap | Meterflow">
      <div className="mf-roadmap-page" ref={roadmapRef}>
        <PageHero
          kicker="Product Map"
          title="Agent payment rails. Meterflow control plane."
          lede="x402 and the Machine Payments Protocol make machine-payable API calls possible. Meterflow adds the operating layer around them: route pricing, wallet policy, spend limits, Solana USDC settlement, receipts, provider revenue, discovery, and MFLOW utility."
          actions={
            <>
              <ButtonLink href="/docs">
                Build with Meterflow
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/registry" variant="secondary">
                Registry
                <ArrowRight className="h-4 w-4" />
              </ButtonLink>
              <ButtonLink href="/status" variant="secondary">
                <Activity className="h-4 w-4" />
                Status
              </ButtonLink>
              <ButtonLink href="/buy?input=SOL" variant="secondary">
                <Wallet className="h-4 w-4" />
                Buy MFLOW
              </ButtonLink>
            </>
          }
          aside={
            <MetricPanel
              items={[
                { label: "Now", value: "x402 + MPP", copy: "Machine-payable routes" },
                { label: "Live", value: "Registry", copy: "Provider trust score" },
                { label: "Planned", value: "Bonding", copy: "MFLOW lockups" },
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
            title="Agents need trusted paid tools. APIs need proof."
            copy="The roadmap is focused on the operational layer that turns x402 and MPP payments into products agents can discover, afford, verify, and trust."
            href="/apply"
            action="Apply as Provider"
          />
        </div>
      </div>
    </Page>
  );
}
