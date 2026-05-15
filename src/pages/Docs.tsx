import { Code2, Wallet } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { CardGrid, CodeBlock, Checklist, Flow, MetricPanel, Page, PageHero, Section } from "@/pages/productShared";

export function DocsPage() {
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
            <ButtonLink href="/registry" variant="secondary">
              Provider Registry
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
            lede="The registry turns paid endpoints into a market ranked by verification, MFLOW bond state, price, uptime, latency, receipt volume, budget support, and provider reputation."
          >
            <CardGrid
              cards={[
                { label: "Providers", title: "Publish priced capabilities.", copy: "Hosted API routes and MCP tools expose endpoint, category, rails, price, bond state, and policy metadata." },
                { label: "Operators", title: "Choose by live signal.", copy: "Registry listings reflect reliability, cost, receipt history, budget support, verification, and payment rail fit." },
                { label: "$MFLOW", title: "Utility wraps trust.", copy: "USDC settles the request. MFLOW coordinates provider bonding, fee relief, limits, analytics, and registry standing." },
              ]}
            />
            <CodeBlock>{`
GET /v1/registry/providers?rail=x402&minScore=55
GET /v1/registry/summary
GET /v1/registry/providers/meterflow-token-risk
            `}</CodeBlock>
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
