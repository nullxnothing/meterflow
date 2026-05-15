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
          <a href="#agent-spend-control">Agent Spend Control</a>
          <a href="#xona-resource-pack">Xona Resource Pack</a>
          <a href="#daemon-integration">DAEMON Integration</a>
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
            id="agent-spend-control"
            eyebrow="Enterprise Control"
            title="Agent Spend Control"
            lede="Meterflow turns x402 and MPP from protocol handshakes into enterprise-approved payment workflows: policy checks before spend, rail recommendations, metadata hashing, receipt requirements, and enforce or monitor modes."
          >
            <CardGrid
              cards={[
                {
                  label: "Policy Firewall",
                  title: "Stop unsafe agent spend before payment.",
                  copy: "Enforce daily caps, per-call caps, route allowlists, meter allowlists, approved rails, denied providers, and approval thresholds.",
                },
                {
                  label: "Rail Router",
                  title: "Choose the right payment path.",
                  copy: "Use x402 for exact one-shot calls, MPP for sessions or multi-call jobs, Kora for gasless Solana flows, and CDP-style routing when compliance screening matters.",
                },
                {
                  label: "Audit Layer",
                  title: "Hash private context and keep receipts.",
                  copy: "PII-sensitive metadata is reduced to a hash in the policy response while optional audit receipts preserve the decision trail.",
                },
              ]}
            />
            <CodeBlock>{`
const budget = await client.createBudget({
  name: "research-agent",
  agentId: "research-agent-1",
  dailyCapUsd: 12,
  perCallCapUsd: 0.02,
  allowedRoutes: ["/mcp/token-risk", "/gateway/*"],
  allowedRails: ["x402", "mpp"],
  mode: "enforce",
  piiGuard: true,
});

const decision = await client.evaluatePolicy({
  route: "/mcp/token-risk",
  method: "POST",
  agentId: "research-agent-1",
  paymentProtocol: "x402",
  metadata: { purpose: "token risk check" },
  record: true
});
            `}</CodeBlock>
            <Checklist
              items={[
                "GET /v1/policy/capabilities returns supported controls, rails, and routing options.",
                "POST /v1/policy/evaluate returns allow/deny state, economics, recommended rail, facilitator, budget projection, and metadata hash.",
                "Live Meterflow gateway requests use the same policy engine before forwarding paid API or MCP calls.",
                "Monitor mode lets enterprise teams observe would-block decisions before switching to enforcement.",
              ]}
            />
          </Section>

          <Section
            id="xona-resource-pack"
            eyebrow="Resource Pack"
            title="Xona resources, governed by Meterflow."
            lede="The clean partnership wedge is Meterflow x Xona first: Xona builds agent-accessible resources, and Meterflow gives those resources meters, budgets, receipts, revenue views, and policy controls so agents can safely pay per call."
          >
            <CardGrid
              cards={[
                {
                  label: "Xona Supply",
                  title: "Agent resources become callable products.",
                  copy: "Creative generation, token intelligence, Solana market data, PumpFun movers, token news, and token signals can be exposed as paid resources for agents.",
                },
                {
                  label: "Meterflow Control",
                  title: "Every resource gets a meter and policy.",
                  copy: "Meterflow wraps Xona-style resources with route pricing, budgets, receipts, provider revenue views, rail controls, and operator-safe spend limits.",
                },
                {
                  label: "Catalog",
                  title: "Expose Xona resources as a policy surface.",
                  copy: "GET /v1/resource-packs/xona returns the resource list, categories, endpoints, prices, rails, and recommended presets.",
                },
                {
                  label: "Presets",
                  title: "Create budgets for common agent jobs.",
                  copy: "Research, market, and creative presets generate route allowlists, rail allowlists, per-call caps, daily caps, and PII guard defaults.",
                },
              ]}
            />
            <CodeBlock>{`
const pack = await client.resourcePack("xona");

const policy = await client.createResourcePackBudget("xona", {
  presetId: "xona-market-agent",
  agentId: "market-agent-1",
  dailyCapUsd: 12,
  mode: "enforce"
});

await client.evaluatePolicy({
  route: "/xona/token/pumpfun-movers",
  method: "GET",
  agentId: "market-agent-1",
  paymentProtocol: "x402",
  record: true
});
            `}</CodeBlock>
            <Checklist
              items={[
                "Start with Meterflow x Xona: resources from Xona, metering and controls from Meterflow.",
                "Give every resource an observable paid-call lifecycle: quote, policy decision, payment proof, response, receipt, provider revenue, and webhook event.",
                "Use DAEMON as the next layer once the resource path is live: a workspace where builders discover, budget, call, and ship with those resources.",
              ]}
            />
          </Section>

          <Section
            id="daemon-integration"
            eyebrow="Workspace Next Step"
            title="DAEMON becomes the workspace for governed agent resources."
            lede="After the Meterflow x Xona path is live, DAEMON can become the builder workspace where teams discover Xona-style resources, assign budgets, let agents call them, and ship the resulting work with task receipts and settlement visibility."
          >
            <CardGrid
              cards={[
                {
                  label: "Discover",
                  title: "Builders find paid resources inside DAEMON.",
                  copy: "DAEMON can surface Meterflow resource packs, registry entries, prices, rails, and provider trust signals where builders already run agents.",
                },
                {
                  label: "Budget",
                  title: "Agents get spend controls before they run.",
                  copy: "Meterflow budgets define which Xona resources, MCP tools, and provider APIs a DAEMON agent can buy during a work session.",
                },
                {
                  label: "Ship",
                  title: "Task proofs and API receipts become one audit trail.",
                  copy: "DAEMON hashes repo, prompt, acceptance, commit, diff, tests, and artifacts for on-chain task receipts; Meterflow adds payment receipts for the resources used during that run.",
                },
              ]}
            />
            <CodeBlock>{`
const daemonBudget = await client.createBudget({
  name: "daemon-operator-agent",
  agentId: "daemon-agent-workbench",
  dailyCapUsd: 60,
  perCallCapUsd: 0.50,
  allowedRoutes: [
    "/xona/*",
    "/mcp/*",
    "/daemon/agent-work/*"
  ],
  allowedRails: ["x402", "mpp"],
  mode: "enforce",
  requireReceipt: true,
  piiGuard: true
});

await client.evaluatePolicy({
  route: "/xona/token/pumpfun-movers",
  method: "GET",
  agentId: "daemon-agent-workbench",
  paymentProtocol: "x402",
  metadata: {
    daemonPlan: "operator",
    daemonTaskId: "agent-work-task-123",
    agentTask: "funded-work-receipt"
  },
  record: true
});
            `}</CodeBlock>
            <Checklist
              items={[
                "Keep DAEMON's subscription gateway responsible for plan, holder, and AI JWT entitlement state.",
                "Use Meterflow budgets for external paid resources a DAEMON agent may call during a session.",
                "Map DAEMON requestId, taskId, agentId, plan, model lane, and receipt signature into Meterflow receipt metadata.",
                "Keep Solana task escrow settlement in DAEMON's registry while Meterflow tracks paid API/resource settlement and provider revenue.",
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
