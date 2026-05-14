import { ArrowRight, BookOpen, Wallet } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";

import { ButtonLink } from "@/components/ui/button";
import { MorphingText } from "@/components/ui/liquid-text";
import { cn } from "@/lib/utils";
import { useHomeMotion } from "@/src/components/site/HomeMotion";
import { Showcase } from "@/src/components/site/Showcase";
import { useSurfaceFanMotion } from "@/src/components/site/SurfaceFanMotion";

const stats = [
  { label: "Receipt events", value: "12,400" },
  { label: "Meters configured", value: "8" },
  { label: "Developer keys issued", value: "34" },
  { label: "Verified paid receipts", value: "1,284" },
  { label: "Settlement volume", value: "$842" },
  { label: "Dashboard test quotes", value: "342" },
];

const statsWords = ["numbers.", "calls.", "meters.", "receipts.", "volume.", "flow."];
const heroWords = ["Meterflow.", "paid APIs.", "MCP rails.", "receipts.", "budgets.", "providers."];

const surfaces = [
  {
    code: "Mt",
    name: "meters/",
    meta: "8 active",
    tone: "blue",
    href: "/dashboard#meters",
    cta: "Open meters",
    foot: "policy.allowlist ok",
    rows: [
      ["paid", "5", "group"],
      ["v1/risk-score", "96%", "accent"],
      ["v1/embed", "82%", "accent"],
      ["v1/scrape", "paused", "muted"],
      ["mcp", "2", "group"],
      ["token-risk", "live", "ok"],
      ["wallet-trace", "71%", "accent"],
    ],
  },
  {
    code: "Rc",
    name: "receipt",
    meta: "verified",
    tone: "cyan",
    href: "/dashboard#receipts",
    cta: "View receipts",
    foot: "last 30 receipts",
    rows: [
      ["id", "rcpt_41bd"],
      ["chain", "solana", "ok"],
      ["amount", "0.006 USDC"],
      ["route", "mcp/token-risk", "accent"],
      ["latency", "12ms"],
      ["policy", "allowlist + cap"],
    ],
  },
  {
    code: "Bg",
    name: "budgets/",
    meta: "2 policies",
    tone: "green",
    href: "/dashboard#budgets",
    cta: "Configure",
    foot: "0 violations today",
    rows: [
      ["policy.allowlist", "ok", "ok"],
      ["budget.cap", "98%", "warn"],
      ["daily.limit", "2.00 USDC"],
      ["kill.switch", "off", "muted"],
      ["agent.id", "ag_research"],
      ["spend.today", "1.96 USDC", "accent"],
    ],
  },
  {
    code: "Pr",
    name: "revenue/",
    meta: "this month",
    tone: "warm",
    href: "/dashboard#analytics",
    cta: "Open analytics",
    foot: "USDC / Solana mainnet",
    rows: [
      ["settled", "14.2 USDC", "accent"],
      ["total calls", "1,840"],
      ["top route", "v1/risk-score"],
      ["avg latency", "18ms"],
      ["unique payers", "23"],
      ["failed payments", "0.4%", "muted"],
    ],
  },
  {
    code: "Lp",
    name: "launchpad/",
    meta: "live",
    tone: "sky",
    href: "/apply",
    cta: "Apply as provider",
    foot: "Hosted / no infra needed",
    rows: [
      ["provider", "api.meterflow"],
      ["route", "POST /v1/risk", "accent"],
      ["price", "0.006 USDC"],
      ["asset", "USDC / Solana"],
      ["status", "live", "ok"],
      ["calls today", "342"],
    ],
  },
  {
    code: "Pa",
    name: "rails/",
    meta: "3 active",
    tone: "deep",
    href: "/docs",
    cta: "Read protocol",
    foot: "x402 + MPP + 402",
    rows: [
      ["x402", "active", "ok"],
      ["MPP", "active", "ok"],
      ["402 fallback", "enabled", "accent"],
      ["settlement", "Solana mainnet"],
      ["normalization", "unified", "accent"],
      ["integration", "one meter"],
    ],
  },
];

function getSurfacePosition(index: number, activeIndex: number, total: number) {
  const offset = (index - activeIndex + total) % total;
  if (offset === 0) return "active";
  if (offset === 1) return "next";
  if (offset === 2) return "next-2";
  if (offset === total - 1) return "prev";
  if (offset === total - 2) return "prev-2";
  return "back";
}

export function HomePage() {
  const homeRef = useRef<HTMLDivElement>(null);

  useHomeMotion(homeRef);

  useEffect(() => {
    document.title = "Meterflow | Control Plane For Agent Commerce";
  }, []);

  return (
    <div className="mf-home" ref={homeRef}>
      <section className="mf-home-hero">
        <div className="mf-home-hero__content">
          <h1 className="mf-home-hero__title">
            The control plane for
            <span className="mf-home-hero__morph" aria-label="Meterflow. Paid APIs. MCP rails. Receipts. Budgets. Providers.">
              <MorphingText className="mf-home-morph-text mf-home-liquid-text" texts={heroWords} />
            </span>
          </h1>

          <div className="mf-home-hero__powered" aria-label="Powered by Solana">
            <span>Powered by</span>
            <SolanaLogo />
          </div>

          <p className="mf-home-hero__copy">
            Wrap APIs and MCP tools into paid services agents can call. Track receipts, attribute provider revenue, and cap autonomous spend, settled on Solana.
          </p>

          <div className="mf-home-hero__actions">
            <ButtonLink href="/dashboard" size="lg">
              <Wallet className="h-4 w-4" />
              Launch Dashboard
            </ButtonLink>
            <ButtonLink href="/docs" variant="secondary" size="lg">
              <BookOpen className="h-4 w-4" />
              Read Docs
            </ButtonLink>
          </div>
        </div>

        <div className="mf-home-hero__demo" aria-label="Meterflow product demo">
          <Showcase className="mf-home-showcase" />
        </div>
      </section>

      <section className="mf-home-stats" aria-labelledby="home-stats-title">
        <div className="mf-home-section-head">
          <h2 id="home-stats-title" className="mf-home-gooey-title" aria-label="By the numbers.">
            <span>By the</span>
            <MorphingText className="mf-home-stats-morph" texts={statsWords} />
          </h2>
        </div>
        <div className="mf-home-stats__grid">
          {stats.map((stat) => (
            <article className="mf-home-stat" key={stat.label}>
              <span>{stat.label}</span>
              <strong data-mf-count={stat.value}>{stat.value}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="mf-home-surfaces" aria-labelledby="home-surfaces-title">
        <div className="mf-home-section-head">
          <h2 id="home-surfaces-title">Six surfaces.</h2>
        </div>
        <SurfaceFan />
      </section>

      <section className="mf-home-cta">
        <div className="mf-home-cta__inner">
          <p className="mf-kicker">Launch</p>
          <h2>
            Become one with <em>Meterflow.</em>
          </h2>
          <p>Join the providers and operators building the metering, receipt, and spend-control layer for agent commerce on Solana.</p>
          <div className="mf-home-cta__actions">
            <ButtonLink href="/dashboard" size="lg">
              Launch Dashboard
              <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <ButtonLink href="/apply" variant="secondary" size="lg">
              Apply as Provider
            </ButtonLink>
          </div>
        </div>
      </section>
    </div>
  );
}

function SurfaceFan() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const surfaceFanRef = useRef<HTMLDivElement>(null);
  const activeSurface = surfaces[activeIndex];
  const positionedSurfaces = useMemo(
    () =>
      surfaces.map((surface, index) => ({
        ...surface,
        position: getSurfacePosition(index, activeIndex, surfaces.length),
      })),
    [activeIndex],
  );

  useSurfaceFanMotion(surfaceFanRef, activeIndex, paused);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || paused || dragStart !== null) return undefined;

    const timer = window.setTimeout(() => {
      setActiveIndex((index) => (index + 1) % surfaces.length);
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [activeIndex, dragStart, paused]);

  const goTo = (index: number) => {
    setActiveIndex(((index % surfaces.length) + surfaces.length) % surfaces.length);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>("[data-surface-index]");
    if (!card || Number(card.dataset.surfaceIndex) !== activeIndex) return;
    setPaused(true);
    setDragStart(event.clientX);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (dragStart === null) return;
    const delta = event.clientX - dragStart;
    setDragStart(null);
    setPaused(false);

    if (delta > 80) goTo(activeIndex - 1);
    if (delta < -80) goTo(activeIndex + 1);
  };

  return (
    <div className="mf-home-surface-fan" ref={surfaceFanRef} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div
        className="mf-home-surface-stage"
        aria-live="polite"
        tabIndex={0}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
            event.preventDefault();
            goTo(activeIndex - 1);
          }
          if (event.key === "ArrowRight" || event.key === "ArrowDown") {
            event.preventDefault();
            goTo(activeIndex + 1);
          }
        }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          setDragStart(null);
          setPaused(false);
        }}
      >
        {positionedSurfaces.map((surface, index) => (
          <article
            className={cn(
              "mf-home-surface-card",
              `mf-home-surface-card--${surface.tone}`,
              `mf-home-surface-card--${surface.position}`,
            )}
            key={surface.code}
            aria-hidden={index !== activeIndex}
            data-surface-index={index}
            onClick={(event) => {
              if (index !== activeIndex) {
                event.preventDefault();
                goTo(index);
              }
            }}
          >
            <div className="mf-home-surface-card__holo" aria-hidden="true" />
            <div className="mf-home-surface-card__scan" aria-hidden="true" />
            <div className="mf-home-surface-card__content">
              <div className="mf-home-surface-card__topline" />
              <header className="mf-home-surface-card__bar">
                <span className="mf-home-surface-card__dot" />
                <span className="mf-home-surface-card__code">{surface.code}</span>
                <span className="mf-home-surface-card__name">{surface.name}</span>
                <span className="mf-home-surface-card__meta">{surface.meta}</span>
              </header>
              <div className="mf-home-surface-card__rows">
                {surface.rows.map(([label, value, tone]) => (
                  <div className={cn("mf-home-surface-row", tone === "group" && "mf-home-surface-row--group")} key={`${surface.code}-${label}`}>
                    <span>{label}</span>
                    <strong className={cn(tone && tone !== "group" && `mf-home-surface-value--${tone}`)}>{value}</strong>
                  </div>
                ))}
              </div>
              <footer className="mf-home-surface-card__foot">
                <span>{surface.foot}</span>
                <a href={surface.href}>
                  {surface.cta}
                  <ArrowRight className="h-3 w-3" />
                </a>
              </footer>
            </div>
          </article>
        ))}
      </div>

      <div className="mf-home-surface-nav" role="tablist" aria-label="Product surfaces">
        {surfaces.map((surface, index) => (
          <button
            type="button"
            key={surface.code}
            className={cn(index === activeIndex && "active")}
            aria-label={`Show ${surface.name}`}
            aria-selected={index === activeIndex}
            role="tab"
            onClick={() => goTo(index)}
          />
        ))}
      </div>
      <p className="sr-only">Current surface: {activeSurface.name}</p>
    </div>
  );
}

function SolanaLogo() {
  return (
    <svg className="mf-home-solana-logo" viewBox="0 0 398 311" role="img" aria-label="Solana">
      <defs>
        <linearGradient id="mf-home-solana-gradient" x1="360.879" y1="351.455" x2="141.213" y2="-69.293" gradientUnits="userSpaceOnUse">
          <stop stopColor="var(--solana-green)" />
          <stop offset="1" stopColor="var(--solana-purple)" />
        </linearGradient>
      </defs>
      <path d="M64.6 237.9c2.6-2.6 6.2-4.1 9.9-4.1h318.7c6.2 0 9.3 7.5 4.9 11.9l-63 63c-2.6 2.6-6.2 4.1-9.9 4.1H6.5c-6.2 0-9.3-7.5-4.9-11.9l63-63Z" fill="url(#mf-home-solana-gradient)" />
      <path d="M64.6 2.1C67.2-.5 70.8-2 74.5-2h318.7c6.2 0 9.3 7.5 4.9 11.9l-63 63c-2.6 2.6-6.2 4.1-9.9 4.1H6.5c-6.2 0-9.3-7.5-4.9-11.9l63-63Z" fill="url(#mf-home-solana-gradient)" />
      <path d="M333.4 119.5c-2.6-2.6-6.2-4.1-9.9-4.1H4.8c-6.2 0-9.3 7.5-4.9 11.9l63 63c2.6 2.6 6.2 4.1 9.9 4.1h318.7c6.2 0 9.3-7.5 4.9-11.9l-63-63Z" fill="url(#mf-home-solana-gradient)" />
    </svg>
  );
}
