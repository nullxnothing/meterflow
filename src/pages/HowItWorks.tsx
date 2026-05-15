import { ArrowRight } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { CardGrid, CodeBlock, CtaPanel, Flow, MetricPanel, Page, PageHero, Section } from "@/pages/productShared";

export function HowItWorksPage() {
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
