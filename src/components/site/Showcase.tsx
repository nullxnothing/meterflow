import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useShowcaseMotion } from "@/components/site/ShowcaseMotion";

/* ───────────────────────────── Data ───────────────────────────── */

type TabKey = "meters" | "receipts" | "budgets" | "provider";

type TreeItem =
  | { kind: "folder"; label: string; meta?: string; nested: TreeItem[] }
  | { kind: "item"; label: string; meta?: string; metaTone?: "ok" | "warn" | "dim"; ctrl?: boolean; active?: boolean }
  | { kind: "divider" };

type PaneCode = { type: "code"; tag: string; meta: string; metaOk?: boolean; lines: CodeLine[] };
type PaneRows = {
  type: "rows";
  tag: string;
  meta: string;
  metaOk?: boolean;
  rows: { k: string; v: string; tone?: "ok" | "warn" }[];
  sparkline?: { points: string; label: string };
};
type Pane = PaneCode | PaneRows;

type CodeToken = { t: string; kind?: "kw" | "key" | "fn" | "str" | "num" | "punct" | "ok" | "c" };
type CodeLine = { tokens: CodeToken[] };

type Variant = {
  code: string;
  label: string;
  detail: string;
  score: number;
  treeHead: { code: string; folder: string; meta: string };
  tree: TreeItem[];
  panes: [Pane, Pane];
};

const VARIANTS: Record<TabKey, Variant> = {
  meters: {
    code: "Mt",
    label: "Live",
    detail: "metering active",
    score: 96,
    treeHead: { code: "Mt", folder: "meters/", meta: "8 active" },
    tree: [
      {
        kind: "folder",
        label: "routes",
        meta: "6",
        nested: [
          { kind: "item", label: "v1.quote", meta: "ok", metaTone: "ok", active: true },
          { kind: "item", label: "v1.settle", meta: "ok", metaTone: "ok" },
          { kind: "item", label: "v1.receipts", meta: "ok", metaTone: "ok" },
        ],
      },
      {
        kind: "folder",
        label: "policies",
        meta: "4",
        nested: [
          { kind: "item", label: "min.balance", meta: "1 USDC" },
          { kind: "item", label: "burst.window", meta: "30/min" },
        ],
      },
      { kind: "divider" },
      { kind: "item", label: "fallback.queue", meta: "ready", metaTone: "ok", ctrl: true },
      { kind: "item", label: "audit.log", meta: "0", ctrl: true },
    ],
    panes: [
      {
        type: "code",
        tag: "quote",
        meta: "200 ok",
        metaOk: true,
        lines: [
          { tokens: [{ t: "// quote a paid call for the agent", kind: "c" }] },
          { tokens: [{ t: "POST " }, { t: "/v1/quote", kind: "kw" }] },
          { tokens: [{ t: "{", kind: "punct" }] },
          { tokens: [{ t: '  "route"', kind: "key" }, { t: ": " }, { t: '"agents.research"', kind: "str" }, { t: ",", kind: "punct" }] },
          { tokens: [{ t: '  "agent"', kind: "key" }, { t: ": " }, { t: '"ag_research"', kind: "str" }, { t: ",", kind: "punct" }] },
          { tokens: [{ t: '  "max"', kind: "key" }, { t: ": " }, { t: "0.020", kind: "num" }, { t: " " }, { t: '"USDC"', kind: "str" }] },
          { tokens: [{ t: "}", kind: "punct" }] },
        ],
      },
      {
        type: "rows",
        tag: "throughput",
        meta: "24h",
        rows: [
          { k: "calls", v: "30,704" },
          { k: "avg / call", v: "0.0059 USDC" },
          { k: "p95 latency", v: "284ms" },
          { k: "failures", v: "0.18%" },
          { k: "settled", v: "$182.41" },
        ],
        sparkline: {
          points: "0,32 12,30 24,28 36,26 48,22 60,21 72,18 84,16 96,14 108,12 120,11 132,9 144,8 156,7 168,6 180,5 192,5 200,4",
          label: "calls / hour",
        },
      },
    ],
  },

  receipts: {
    code: "Rc",
    label: "Live",
    detail: "receipts streaming",
    score: 94,
    treeHead: { code: "Rc", folder: "receipts/", meta: "12.4k" },
    tree: [
      {
        kind: "folder",
        label: "streams",
        meta: "3",
        nested: [
          { kind: "item", label: "settled.usdc", meta: "ok", metaTone: "ok", active: true },
          { kind: "item", label: "refunds", meta: "2" },
          { kind: "item", label: "disputes", meta: "0", metaTone: "ok" },
        ],
      },
      {
        kind: "folder",
        label: "exports",
        meta: "2",
        nested: [
          { kind: "item", label: "csv.daily", meta: "ready", metaTone: "ok" },
          { kind: "item", label: "webhook.live", meta: "1.2k/d", metaTone: "ok" },
        ],
      },
      { kind: "divider" },
      { kind: "item", label: "graph.view", meta: "live", metaTone: "ok", ctrl: true },
    ],
    panes: [
      {
        type: "code",
        tag: "receipt",
        meta: "verified",
        metaOk: true,
        lines: [
          { tokens: [{ t: "// solana settlement receipt", kind: "c" }] },
          { tokens: [{ t: "GET " }, { t: "/v1/receipts/r_82af", kind: "kw" }] },
          { tokens: [{ t: "{", kind: "punct" }] },
          { tokens: [{ t: '  "sig"', kind: "key" }, { t: ": " }, { t: '"3xQ…b7n"', kind: "str" }, { t: ",", kind: "punct" }] },
          { tokens: [{ t: '  "route"', kind: "key" }, { t: ": " }, { t: '"agents.research"', kind: "str" }, { t: ",", kind: "punct" }] },
          { tokens: [{ t: '  "paid"', kind: "key" }, { t: ": " }, { t: "0.018", kind: "num" }, { t: " " }, { t: '"USDC"', kind: "str" }, { t: ",", kind: "punct" }] },
          { tokens: [{ t: '  "status"', kind: "key" }, { t: ": " }, { t: '"settled"', kind: "ok" }] },
          { tokens: [{ t: "}", kind: "punct" }] },
        ],
      },
      {
        type: "rows",
        tag: "ledger",
        meta: "today",
        rows: [
          { k: "settled", v: "12,418" },
          { k: "volume", v: "$486.20" },
          { k: "avg fee", v: "0.0001 USDC" },
          { k: "p95 confirm", v: "0.41s" },
          { k: "disputes", v: "0", tone: "ok" },
        ],
        sparkline: {
          points: "0,30 12,28 24,26 36,24 48,21 60,18 72,17 84,15 96,13 108,11 120,10 132,9 144,8 156,7 168,6 180,5 192,4 200,3",
          label: "receipts / hour",
        },
      },
    ],
  },

  budgets: {
    code: "Bg",
    label: "Live",
    detail: "caps enforced",
    score: 92,
    treeHead: { code: "Bg", folder: "budgets/", meta: "3 caps live" },
    tree: [
      {
        kind: "folder",
        label: "allowlists",
        meta: "4",
        nested: [
          { kind: "item", label: "research.agents", meta: "ok", metaTone: "ok" },
          { kind: "item", label: "risk.models", meta: "ok", metaTone: "ok" },
        ],
      },
      {
        kind: "folder",
        label: "caps",
        meta: "3",
        nested: [
          { kind: "item", label: "daily.usdc", meta: "87%", metaTone: "warn", active: true },
          { kind: "item", label: "per-call.max", meta: "0.02" },
          { kind: "item", label: "burst.window", meta: "12/min" },
        ],
      },
      { kind: "divider" },
      { kind: "item", label: "auto.pause", meta: "armed", metaTone: "ok", ctrl: true },
      { kind: "item", label: "owner.alert", meta: "ready", ctrl: true },
    ],
    panes: [
      {
        type: "code",
        tag: "budget check",
        meta: "policy.checked",
        metaOk: true,
        lines: [
          { tokens: [{ t: "// budget gate runs before settlement", kind: "c" }] },
          { tokens: [{ t: "CHECK " }, { t: "/policy/budget", kind: "kw" }] },
          { tokens: [{ t: "{", kind: "punct" }] },
          { tokens: [{ t: '  "agent"', kind: "key" }, { t: ": " }, { t: '"ag_research"', kind: "str" }, { t: ",", kind: "punct" }] },
          { tokens: [{ t: '  "daily_cap"', kind: "key" }, { t: ": " }, { t: "25.00", kind: "num" }, { t: " " }, { t: '"USDC"', kind: "str" }, { t: ",", kind: "punct" }] },
          { tokens: [{ t: '  "spent"', kind: "key" }, { t: ": " }, { t: "21.74", kind: "num" }, { t: " " }, { t: '"USDC"', kind: "str" }, { t: ",", kind: "punct" }] },
          { tokens: [{ t: '  "decision"', kind: "key" }, { t: ": " }, { t: '"allow"', kind: "ok" }] },
          { tokens: [{ t: "}", kind: "punct" }] },
        ],
      },
      {
        type: "rows",
        tag: "spend cap",
        meta: "under cap",
        metaOk: true,
        rows: [
          { k: "daily cap", v: "25.00 USDC" },
          { k: "spent", v: "21.74 USDC" },
          { k: "remaining", v: "3.26 USDC", tone: "warn" },
          { k: "per call", v: "0.020 max" },
          { k: "decision", v: "allow", tone: "ok" },
          { k: "reset", v: "04h 18m" },
        ],
        sparkline: {
          points: "0,36 12,35 24,32 36,31 48,28 60,26 72,24 84,23 96,20 108,18 120,16 132,15 144,13 156,11 168,10 180,8 192,7 200,5",
          label: "daily spend curve",
        },
      },
    ],
  },

  provider: {
    code: "Pr",
    label: "Live",
    detail: "earnings paid out",
    score: 91,
    treeHead: { code: "Pr", folder: "provider/", meta: "$2,418 / mo" },
    tree: [
      {
        kind: "folder",
        label: "endpoints",
        meta: "5",
        nested: [
          { kind: "item", label: "research.v1", meta: "ok", metaTone: "ok", active: true },
          { kind: "item", label: "embed.v2", meta: "ok", metaTone: "ok" },
          { kind: "item", label: "score.v1", meta: "ok", metaTone: "ok" },
        ],
      },
      {
        kind: "folder",
        label: "payouts",
        meta: "2",
        nested: [
          { kind: "item", label: "usdc.wallet", meta: "primary" },
          { kind: "item", label: "spl.fees", meta: "0.5%", metaTone: "warn" },
        ],
      },
      { kind: "divider" },
      { kind: "item", label: "registry.live", meta: "ranked", metaTone: "ok", ctrl: true },
      { kind: "item", label: "share.link", meta: "ready", ctrl: true },
    ],
    panes: [
      {
        type: "code",
        tag: "payout",
        meta: "confirmed",
        metaOk: true,
        lines: [
          { tokens: [{ t: "// scheduled provider payout", kind: "c" }] },
          { tokens: [{ t: "POST " }, { t: "/v1/payouts", kind: "kw" }] },
          { tokens: [{ t: "{", kind: "punct" }] },
          { tokens: [{ t: '  "provider"', kind: "key" }, { t: ": " }, { t: '"pr_research"', kind: "str" }, { t: ",", kind: "punct" }] },
          { tokens: [{ t: '  "period"', kind: "key" }, { t: ": " }, { t: '"may.w2"', kind: "str" }, { t: ",", kind: "punct" }] },
          { tokens: [{ t: '  "amount"', kind: "key" }, { t: ": " }, { t: "1284.10", kind: "num" }, { t: " " }, { t: '"USDC"', kind: "str" }, { t: ",", kind: "punct" }] },
          { tokens: [{ t: '  "status"', kind: "key" }, { t: ": " }, { t: '"settled"', kind: "ok" }] },
          { tokens: [{ t: "}", kind: "punct" }] },
        ],
      },
      {
        type: "rows",
        tag: "earnings",
        meta: "this month",
        rows: [
          { k: "gross", v: "$2,418.00" },
          { k: "calls served", v: "118,402" },
          { k: "avg / call", v: "0.0204 USDC" },
          { k: "top route", v: "research.v1" },
          { k: "next payout", v: "in 3d 04h" },
        ],
        sparkline: {
          points: "0,34 12,32 24,30 36,27 48,26 60,23 72,20 84,18 96,16 108,15 120,13 132,11 144,10 156,9 168,7 180,6 192,5 200,4",
          label: "earnings curve",
        },
      },
    ],
  },
};

/* ───────────────────────────── Component ───────────────────────────── */

export function Showcase({ className }: { className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<TabKey>("meters");
  const [updating, setUpdating] = useState(false);
  const [inView, setInView] = useState(false);

  // Brief "updating" pulse when tab switches.
  useEffect(() => {
    setUpdating(true);
    const t = window.setTimeout(() => setUpdating(false), 620);
    return () => window.clearTimeout(t);
  }, [tab]);

  // Gate motion to in-view to honor the perf budget.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setInView(true)),
      { rootMargin: "120px 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useShowcaseMotion({ rootRef, tab, enabled: inView });

  const v = VARIANTS[tab];

  return (
    <div className={cn("mf-showcase-root", className)} ref={rootRef}>
      <div
        role="tablist"
        aria-label="Product surfaces"
        className="mf-showcase-tabs mf-showcase-tabs--wide"
      >
        <span aria-hidden className="mf-showcase-tab-indicator" />
        {(Object.keys(VARIANTS) as TabKey[]).map((key) => {
          const variant = VARIANTS[key];
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={cn("mf-showcase-tab", active && "is-active")}
            >
              <span className="mf-showcase-tab__code">
                {variant.code}
              </span>
              <span className="capitalize">{key}</span>
            </button>
          );
        })}
      </div>

      <div aria-hidden className="mf-showcase-floor" />

      <div
        className="mf-showcase-frame"
        data-updating={updating || undefined}
      >
        <div aria-hidden className="mf-showcase-accent-line" />

        <div className="mf-showcase-bar">
          <div className="mf-showcase-status">
            <LiveDot />
            <span className="mf-status-label">
              {v.label}
            </span>
            <span className="mf-tone-muted">/</span>
            <span className="truncate text-muted-foreground">{v.detail}</span>
          </div>
          <div className="mf-showcase-score">
            meter score
            <strong className="mf-showcase-score-value">
              {v.score}
            </strong>
          </div>
        </div>

        <div className="mf-showcase-progress">
          <div className="mf-showcase-progress__bar" />
        </div>

        <div
          role="tabpanel"
          className="mf-showcase-body mf-showcase-body--wide"
        >
          <div
            className="mf-showcase-tree mf-showcase-tree--wide"
          >
            <div className="mf-tree-head">
              <span className="mf-tree-code">
                {v.treeHead.code}
              </span>
              <span>{v.treeHead.folder}</span>
              <span className="mf-tree-meta">{v.treeHead.meta}</span>
            </div>

            {v.tree.map((node, i) => (
              <TreeNode key={i} node={node} />
            ))}
          </div>

          <div className="mf-showcase-detail mf-showcase-detail--wide">
            {v.panes.map((pane, i) => (
              <PaneCard key={i} pane={pane} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Sub-components ───────────────────────────── */

function LiveDot() {
  return <span className="mf-live-dot" />;
}

function TreeNode({ node }: { node: TreeItem }) {
  if (node.kind === "divider") {
    return <div className="mf-tree-divider" />;
  }
  if (node.kind === "folder") {
    return (
      <>
        <div className="mf-tree-row">
          <span className="mf-tree-chev">▾</span>
          <span className="mf-tree-icon">▣</span>
          <span>{node.label}</span>
          {node.meta && <span className="mf-tree-meta">{node.meta}</span>}
        </div>
        {node.nested.map((child, i) => (
          <TreeNode key={i} node={child} />
        ))}
      </>
    );
  }
  const tone =
    node.metaTone === "ok"
      ? "mf-tone-accent"
      : node.metaTone === "warn"
      ? "mf-tone-warning"
      : "mf-tone-muted";
  return (
    <div
      className={cn(
        "mf-tree-item",
        node.ctrl && "mf-tree-item--ctrl",
        node.active && "is-active",
      )}
    >
      <span className="mf-tree-dot" />
      <span className="flex-1">{node.label}</span>
      {node.meta && <span className={cn("mf-tree-item-meta", tone)}>{node.meta}</span>}
    </div>
  );
}

function PaneCard({ pane }: { pane: Pane }) {
  return (
    <div className="mf-pane min-w-0">
      <div className="mf-pane-head min-w-0 gap-3">
        <span className="mf-pane-tag min-w-0 truncate">
          {pane.tag}
        </span>
        <span
          className={cn(
            "mf-pane-meta",
            pane.metaOk && "mf-pane-meta--ok",
          )}
        >
          {pane.meta}
        </span>
      </div>

      {pane.type === "code" ? <CodeBody lines={pane.lines} /> : <RowsBody rows={pane.rows} sparkline={pane.sparkline} />}
    </div>
  );
}

function CodeBody({ lines }: { lines: CodeLine[] }) {
  return (
    <pre className="mf-code min-w-0">
      {lines.map((line, i) => (
        <div key={i} className="mf-code-line">
          <span className="mf-code-line-number">{i + 1}</span>
          <span className="mf-code-line-content">
            {line.tokens.map((tok, j) => (
              <span key={j} className={tokenClass(tok.kind)}>
                {tok.t}
              </span>
            ))}
          </span>
        </div>
      ))}
    </pre>
  );
}

function tokenClass(kind?: CodeToken["kind"]) {
  switch (kind) {
    case "kw": return "mf-code-token--kw";
    case "key": return "mf-code-token--key";
    case "fn": return "text-foreground";
    case "str": return "mf-code-token--str";
    case "num": return "mf-code-token--num";
    case "punct": return "mf-code-token--punct";
    case "ok": return "mf-code-token--ok";
    case "c": return "mf-code-token--comment";
    default: return "mf-code-token--default";
  }
}

function RowsBody({ rows, sparkline }: { rows: PaneRows["rows"]; sparkline?: PaneRows["sparkline"] }) {
  return (
    <>
      <div className="min-w-0 py-1">
        {rows.map((r) => (
          <div key={`${r.k}-${r.v}`} className="mf-row min-w-0 gap-3">
            <span className="mf-row-key">{r.k}</span>
            <span
              className={cn(
                "mf-row-value shrink-0 text-right",
                r.tone === "ok" ? "mf-tone-accent" : r.tone === "warn" ? "mf-tone-warning" : "text-foreground",
              )}
            >
              {r.v}
            </span>
          </div>
        ))}
      </div>
      {sparkline && (
        <div className="mf-sparkline min-w-0">
          <span className="block min-w-0 flex-1">
            <svg viewBox="0 0 200 40" preserveAspectRatio="none">
              <polyline
                fill="none"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={sparkline.points}
              />
            </svg>
          </span>
          <span className="mf-sparkline-label shrink-0">{sparkline.label}</span>
        </div>
      )}
    </>
  );
}
