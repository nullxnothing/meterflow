import { ArrowRight, BookOpen, Wallet } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";

import { ButtonLink } from "@/components/ui/button";
import { MorphingText } from "@/components/ui/liquid-text";
import { cn } from "@/lib/utils";

const Showcase = lazy(() =>
  import("@/components/site/Showcase").then((module) => ({ default: module.Showcase })),
);
const CtaShader = lazy(() =>
  import("@/components/site/CtaShader").then((module) => ({ default: module.CtaShader })),
);
const LogoOrbit = lazy(() =>
  import("@/components/site/LogoOrbit").then((module) => ({ default: module.LogoOrbit })),
);

gsap.registerPlugin(useGSAP, ScrollTrigger);

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
    detail: "Route pricing, ownership, settlement policy, and live/test state stay visible from one control surface.",
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
    detail: "Every paid request resolves to a receipt with payer, proof, route, response, latency, and settlement state.",
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
    detail: "Agent spend is gated before execution with route allowlists, per-call caps, daily limits, and revocation.",
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
    detail: "Provider revenue, route demand, settlement volume, and failed-payment rates are tracked in real time.",
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
    detail: "Providers can launch priced API products without building their own usage, payment, or receipt system.",
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
    detail: "Payment protocols normalize into one metering layer so apps can support multiple rails cleanly.",
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

function scheduleIdle(callback: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const idleId = window.requestIdleCallback(callback, { timeout: 1800 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timer = window.setTimeout(callback, 900);
  return () => window.clearTimeout(timer);
}

function ShowcaseFallback() {
  return (
    <div className="mf-home-showcase mf-home-showcase--placeholder" aria-hidden="true">
      <div className="mf-showcase-tabs mf-showcase-tabs--wide mf-showcase-tabs--placeholder">
        {["Mt", "Rc", "Bg", "Pr"].map((label) => (
          <span className="mf-showcase-tab" key={label}>
            <span className="mf-showcase-tab__code">{label}</span>
            <span>loading</span>
          </span>
        ))}
      </div>
      <div className="mf-showcase-frame mf-showcase-frame--placeholder" />
    </div>
  );
}

export function HomePage() {
  const homeRef = useRef<HTMLDivElement>(null);
  const chapterRef = useRef<HTMLDivElement>(null);
  const surfacesSectionRef = useRef<HTMLElement>(null);
  const logoSectionRef = useRef<HTMLElement>(null);
  const [surfacesInView, setSurfacesInView] = useState(false);
  const [chapterSurfaceIndex, setChapterSurfaceIndex] = useState(0);
  const [chapterScrolling, setChapterScrolling] = useState(false);

  useGSAP(
    () => {
      const chapter = chapterRef.current;
      const surfaceSection = surfacesSectionRef.current;
      const logoSection = logoSectionRef.current;
      if (!chapter || !surfaceSection || !logoSection) return undefined;

      const pin = chapter.querySelector<HTMLElement>(".mf-home-scroll-chapter__pin");
      const surfaceFan = surfaceSection.querySelector<HTMLElement>(".mf-home-surface-fan");
      const stage = logoSection.querySelector<HTMLElement>(".mf-home-logo-section__stage");
      const copy = logoSection.querySelector<HTMLElement>(".mf-home-logo-section__copy");
      if (!pin || !surfaceFan || !stage || !copy) return undefined;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const canPin = window.matchMedia("(min-width: 1024px)").matches && !reducedMotion;
      gsap.set(logoSection, { "--mf-logo-scroll-turn": 0 });
      gsap.set(logoSection, { "--mf-logo-morph": 0 });
      gsap.set(logoSection, { "--mf-x402-sweep": 0 });
      gsap.set(stage, { transformOrigin: "50% 50%" });
      gsap.set([surfaceSection, logoSection, stage, copy], { willChange: "transform,opacity" });

      if (!canPin) {
        gsap.set(stage, { scale: 1, y: 0 });
        gsap.set(copy, { autoAlpha: 1, y: 0 });
        gsap.set([surfaceSection, logoSection, stage, copy], { clearProps: "opacity,visibility,transform,filter,pointerEvents,willChange" });
        setChapterScrolling(false);
        return undefined;
      }

      let activeIndex = -1;
      let chapterActive = false;
      let fanScrolling = false;
      let x402Active = false;
      let scrolling = false;

      const setChapterScrollingState = (next: boolean) => {
        if (scrolling === next) return;
        scrolling = next;
        setChapterScrolling(next);
      };

      const setChapterActiveState = (next: boolean) => {
        if (chapterActive === next) return;
        chapterActive = next;
        chapter.classList.toggle("mf-home-scroll-chapter--active", next);
      };

      const setFanScrollingState = (next: boolean) => {
        if (fanScrolling === next) return;
        fanScrolling = next;
        surfaceFan.classList.toggle("mf-home-surface-fan--scrolling", next);
      };

      const setX402ActiveState = (next: boolean) => {
        if (x402Active === next) return;
        x402Active = next;
        chapter.classList.toggle("mf-home-scroll-chapter--x402-active", next);
      };

      const setSurfaceProgress = (progress: number) => {
        const cardsProgress = gsap.utils.clamp(0, 1, progress / 0.36);
        const atEnd = cardsProgress >= 0.999;
        const unit = atEnd ? surfaces.length - 0.001 : cardsProgress * surfaces.length;
        const index = atEnd ? surfaces.length - 1 : Math.floor(unit);
        const localProgress = atEnd ? 1 : unit - index;
        const pulse = Math.sin(localProgress * Math.PI);
        const scale = gsap.utils.interpolate(1.018, 1.118, pulse);

        surfaceFan.style.setProperty("--surface-active-scale", scale.toFixed(3));
        surfaceFan.style.setProperty("--surface-scroll-progress", cardsProgress.toFixed(4));

        if (index !== activeIndex) {
          activeIndex = index;
          setChapterSurfaceIndex(index);
        }
      };

      gsap.set(surfaceSection, { autoAlpha: 1, y: 0, scale: 1, pointerEvents: "auto" });
      gsap.set(logoSection, { autoAlpha: 0, y: 64, scale: 0.97, pointerEvents: "none" });
      gsap.set(stage, { scale: 1.3, y: 28 });
      gsap.set(copy, { autoAlpha: 0.54, y: 24 });

      const timeline = gsap.timeline({
        scrollTrigger: {
          id: "mf-home-scroll-chapter",
          trigger: chapter,
          start: "top top",
          end: () => `+=${Math.round(window.innerHeight * 3.6)}`,
          scrub: 0.5,
          pin,
          pinSpacing: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          refreshPriority: -30,
          onToggle: (self) => {
            setChapterActiveState(self.isActive);
            setFanScrollingState(self.isActive && self.progress < 0.42);
            setChapterScrollingState(self.isActive);
          },
          onUpdate: (self) => {
            setSurfaceProgress(self.progress);
            setFanScrollingState(self.isActive && self.progress < 0.42);
            setX402ActiveState(self.progress >= 0.38);
          },
          onRefresh: (self) => setSurfaceProgress(self.progress),
        },
      });

      timeline
        .to(surfaceSection, { autoAlpha: 1, y: 0, scale: 1, duration: 0.34, ease: "none" }, 0)
        .to(surfaceSection, { autoAlpha: 0, y: -72, scale: 0.955, pointerEvents: "none", duration: 0.14, ease: "none" }, 0.38)
        .to(logoSection, { autoAlpha: 1, y: 0, scale: 1, pointerEvents: "auto", duration: 0.18, ease: "none" }, 0.38)
        .to(stage, { scale: 1, y: 0, duration: 0.28, ease: "none" }, 0.4)
        .to(logoSection, { "--mf-logo-scroll-turn": 1, duration: 0.16, ease: "none" }, 0.38)
        .to(logoSection, { "--mf-logo-morph": 1, duration: 0.16, ease: "none" }, 0.52)
        .to(logoSection, { "--mf-logo-scroll-turn": 2, duration: 0.22, ease: "none" }, 0.62)
        .to(logoSection, { "--mf-x402-sweep": 1, duration: 0.46, ease: "none" }, 0.38)
        .to(copy, { autoAlpha: 1, y: 0, duration: 0.2, ease: "none" }, 0.42);

      const refreshFrame = window.requestAnimationFrame(() => {
        ScrollTrigger.sort();
        ScrollTrigger.refresh();
      });

      return () => {
        window.cancelAnimationFrame(refreshFrame);
        scrolling = false;
        surfaceFan.classList.remove("mf-home-surface-fan--scrolling");
        surfaceFan.style.removeProperty("--surface-active-scale");
        surfaceFan.style.removeProperty("--surface-scroll-progress");
        chapter.classList.remove("mf-home-scroll-chapter--active", "mf-home-scroll-chapter--x402-active");
        gsap.set([surfaceSection, logoSection, stage, copy], { clearProps: "willChange" });
      };
    },
    { scope: chapterRef },
  );

  useEffect(() => {
    const root = homeRef.current;
    if (!root) return undefined;

    let cleanupMotion: (() => void) | undefined;
    let cancelled = false;

    const cancelIdle = scheduleIdle(() => {
      import("@/components/site/HomeMotion").then((module) => {
        if (cancelled) return;
        cleanupMotion = module.mountHomeMotion(root);
      });
    });

    return () => {
      cancelled = true;
      cancelIdle();
      cleanupMotion?.();
    };
  }, []);

  useEffect(() => {
    document.title = "Meterflow | Control Plane For Agent Commerce";
  }, []);

  useEffect(() => {
    const section = surfacesSectionRef.current;
    if (!section) return undefined;

    const observer = new IntersectionObserver(([entry]) => setSurfacesInView(entry.isIntersecting), {
      rootMargin: "80% 0px",
      threshold: 0,
    });

    observer.observe(section);
    return () => observer.disconnect();
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

          <div className="mf-home-hero__attribution">
            <span className="mf-home-hero__powered" aria-label="Powered by Solana">
              <span>Powered by</span>
              <SolanaLogo />
              <span className="mf-home-hero__powered-name">Solana</span>
            </span>
            <span aria-hidden className="mf-home-hero__attribution-sep" />
            <a
              className="mf-home-hero__routed"
              href="https://zauthx402.com/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Routed through Zauth"
            >
              <span>Routed through</span>
              <img
                src="/assets/brand/zauth-mark.png"
                alt=""
                width={20}
                height={20}
                className="mf-home-hero__zauth-logo"
                loading="lazy"
                decoding="async"
              />
              <span className="mf-home-hero__routed-name">Zauth</span>
            </a>
            <span aria-hidden className="mf-home-hero__attribution-sep" />
            <span className="mf-home-hero__rail" aria-label="Metered via x402">
              <span>Metered via</span>
              <span className="mf-home-hero__rail-mark">x402</span>
            </span>
            <span aria-hidden className="mf-home-hero__attribution-sep" />
            <span className="mf-home-hero__rail" aria-label="Settled on MPP">
              <span>Settled on</span>
              <span className="mf-home-hero__rail-mark">MPP</span>
            </span>
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
          <Suspense fallback={<ShowcaseFallback />}>
            <Showcase className="mf-home-showcase" />
          </Suspense>
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

      <div className="mf-home-scroll-chapter" ref={chapterRef}>
        <div className="mf-home-scroll-chapter__pin">
          <section
            className={cn("mf-home-surfaces", !surfacesInView && "mf-home-surfaces--paused")}
            aria-labelledby="home-surfaces-title"
            ref={surfacesSectionRef}
          >
            <div className="mf-home-section-head">
              <h2 id="home-surfaces-title">Six surfaces.</h2>
            </div>
            <SurfaceFan active={surfacesInView} scrollIndex={chapterSurfaceIndex} scrollActive={chapterScrolling} />
          </section>

          <section className="mf-home-logo-section" aria-labelledby="home-logo-title" ref={logoSectionRef}>
            <div className="mf-home-logo-section__copy">
              <p className="mf-kicker">x402 / Meterflow</p>
              <h2 id="home-logo-title" className="mf-home-x402-title">
                <span>Meterflow</span>
                <span className="mf-home-x402-title__join">×</span>
                <span>x402</span>
              </h2>
              <p className="mf-home-x402-copyline mf-home-x402-copyline--lede">
                x402 makes APIs payable. Meterflow makes them manageable.
              </p>
              <p className="mf-home-x402-copyline">
                x402 brings payments directly into the HTTP request flow: an agent meets a 402 challenge, pays, retries, and gets access without accounts, subscriptions, shared cards, or legacy API-key billing.
              </p>
              <p className="mf-home-x402-copyline">
                Meterflow turns that payment surface into infrastructure: every paid request becomes observable, budgeted, attributable, exportable, and ready for provider operations.
              </p>
            </div>
            <div className="mf-home-logo-section__stage">
              <Suspense fallback={<div className="mf-logo-orbit mf-logo-orbit--loading" aria-hidden="true" />}>
                <LogoOrbit />
              </Suspense>
            </div>
          </section>
        </div>
      </div>

      <section className="mf-home-cta">
        <div className="mf-home-cta__inner">
          <Suspense fallback={null}>
            <CtaShader fps={0} />
          </Suspense>
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

function SurfaceFan({ active, scrollIndex, scrollActive = false }: { active: boolean; scrollIndex?: number; scrollActive?: boolean }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
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

  useEffect(() => {
    if (typeof scrollIndex !== "number") return;
    setActiveIndex(((scrollIndex % surfaces.length) + surfaces.length) % surfaces.length);
    setExpanded(false);
  }, [scrollIndex]);

  useEffect(() => {
    const root = surfaceFanRef.current;
    if (!root || !active) return undefined;

    let cleanupMotion: (() => void) | undefined;
    let cancelled = false;

    const cancelIdle = scheduleIdle(() => {
      import("@/components/site/SurfaceFanMotion").then((module) => {
        if (cancelled) return;
        cleanupMotion = module.mountSurfaceFanMotion(root, activeIndex, paused);
      });
    });

    return () => {
      cancelled = true;
      cancelIdle();
      cleanupMotion?.();
    };
  }, [active, activeIndex, paused]);

  useEffect(() => {
    const root = surfaceFanRef.current;
    if (!root || !active) return undefined;

    let cleanupTilt: (() => void) | undefined;
    let cancelled = false;

    const cancelIdle = scheduleIdle(() => {
      import("@/components/site/SurfaceFanMotion").then((module) => {
        if (cancelled) return;
        cleanupTilt = module.mountSurfaceFanTilt(root);
      });
    });

    return () => {
      cancelled = true;
      cancelIdle();
      cleanupTilt?.();
    };
  }, [active]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!active || media.matches || scrollActive || paused || dragStart !== null) return undefined;

    const timer = window.setTimeout(() => {
      setActiveIndex((index) => (index + 1) % surfaces.length);
    }, 3600);

    return () => window.clearTimeout(timer);
  }, [active, activeIndex, dragStart, paused, scrollActive]);

  const goTo = (index: number) => {
    setActiveIndex(((index % surfaces.length) + surfaces.length) % surfaces.length);
    setExpanded(false);
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
    <div
      className={cn("mf-home-surface-fan", expanded && "mf-home-surface-fan--expanded", scrollActive && "mf-home-surface-fan--scrolling")}
      ref={surfaceFanRef}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mf-home-surface-atmosphere" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
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
            aria-expanded={index === activeIndex ? expanded : undefined}
            data-surface-index={index}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) return;
              if (index !== activeIndex) {
                event.preventDefault();
                goTo(index);
                return;
              }
              setExpanded((value) => !value);
            }}
          >
            <div className="mf-home-surface-card__glow" aria-hidden="true" />
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
                    <strong className={cn(tone && tone !== "group" && `mf-home-surface-value--${tone}`)} data-mf-surface-value={value}>
                      {value}
                    </strong>
                  </div>
                ))}
              </div>
              <footer className="mf-home-surface-card__foot">
                <span>
                  {surface.foot}
                  <i aria-hidden="true" className="mf-home-surface-cursor" />
                </span>
                <a href={surface.href}>
                  {surface.cta}
                  <ArrowRight className="h-3 w-3" />
                </a>
              </footer>
            </div>
          </article>
        ))}
      </div>

      <div className={cn("mf-home-surface-detail", expanded && "is-expanded")} data-surface-detail>
        <div className="mf-home-surface-detail__mark">{activeSurface.code}</div>
        <div>
          <span>{activeSurface.name}</span>
          <p>{activeSurface.detail}</p>
        </div>
        <a href={activeSurface.href}>
          {activeSurface.cta}
          <ArrowRight className="h-3 w-3" />
        </a>
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
    <svg
      className="mf-home-solana-logo"
      viewBox="0 0 397.7 311.7"
      role="img"
      aria-label="Solana"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="mf-home-solana-gradient" x1="360.879" y1="351.455" x2="141.213" y2="-69.294" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--solana-green)" />
          <stop offset="1" stopColor="var(--solana-purple)" />
        </linearGradient>
      </defs>
      <path fill="url(#mf-home-solana-gradient)" d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7Z" />
      <path fill="url(#mf-home-solana-gradient)" d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8Z" />
      <path fill="url(#mf-home-solana-gradient)" d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7Z" />
    </svg>
  );
}
