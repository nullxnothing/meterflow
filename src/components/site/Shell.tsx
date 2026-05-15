import { ArrowRight } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useLocation } from "wouter";
import { ButtonLink } from "@/components/ui/button";
import { FlickeringFooter } from "@/components/ui/flickering-footer";
import { EtherealBackground } from "@/components/site/EtherealBackground";
import { DEXSCREENER_URL, DexScreenerIcon } from "@/components/site/social-links";
import { cn } from "@/lib/utils";

gsap.registerPlugin(ScrollTrigger, ScrollSmoother);

let smoothRefreshToken = 0;
let smoothRefreshFrame = 0;
let smoothRefreshSecondFrame = 0;

function scheduleSmoothRefresh() {
  const token = ++smoothRefreshToken;

  if (smoothRefreshFrame) window.cancelAnimationFrame(smoothRefreshFrame);
  if (smoothRefreshSecondFrame) window.cancelAnimationFrame(smoothRefreshSecondFrame);

  smoothRefreshFrame = window.requestAnimationFrame(() => {
    if (token !== smoothRefreshToken) return;
    smoothRefreshFrame = 0;
    smoothRefreshSecondFrame = window.requestAnimationFrame(() => {
      if (token !== smoothRefreshToken) return;
      smoothRefreshSecondFrame = 0;
      ScrollSmoother.get()?.refresh();
      ScrollTrigger.refresh();
    });
  });

  return () => {
    if (token !== smoothRefreshToken) return;
    smoothRefreshToken += 1;
    if (smoothRefreshFrame) window.cancelAnimationFrame(smoothRefreshFrame);
    if (smoothRefreshSecondFrame) window.cancelAnimationFrame(smoothRefreshSecondFrame);
    smoothRefreshFrame = 0;
    smoothRefreshSecondFrame = 0;
  };
}

function refreshSmoothScroll() {
  let cancelled = false;
  const cancelFrame = scheduleSmoothRefresh();

  document.fonts?.ready
    .then(() => {
      if (!cancelled) scheduleSmoothRefresh();
    })
    .catch(() => undefined);

  return () => {
    cancelled = true;
    cancelFrame();
  };
}

const navItems = [
  { href: "/docs", label: "Docs" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/token", label: "Token" },
  { href: "/registry", label: "Registry" },
  { href: "/roadmap", label: "Roadmap" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
}

function XIcon() {
  return (
    <svg className="mf-shell-nav-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2H21.5l-7.5 8.57L22.5 22h-6.844l-5.36-7.013L4.16 22H.9l8.025-9.17L1.5 2h6.97l4.84 6.4L18.244 2Zm-1.2 18h1.86L7.04 4H5.05l11.994 16Z" />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg className="mf-shell-nav-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19.27 5.33a17.6 17.6 0 0 0-4.43-1.38c-.19.34-.4.78-.55 1.13a16.3 16.3 0 0 0-4.92 0c-.15-.36-.37-.79-.56-1.13a17.6 17.6 0 0 0-4.43 1.38A18.06 18.06 0 0 0 .73 17.51a17.7 17.7 0 0 0 5.34 2.7c.41-.56.78-1.16 1.1-1.79a11.7 11.7 0 0 1-1.67-.8c.11-.08.22-.17.33-.26a12.6 12.6 0 0 0 10.74 0c.11.09.22.18.33.26-.53.31-1.09.58-1.67.8.33.63.7 1.23 1.1 1.79a17.6 17.6 0 0 0 5.35-2.7 17.95 17.95 0 0 0-3.46-12.15ZM8.52 15.33c-1.06 0-1.93-.97-1.93-2.16 0-1.2.86-2.17 1.93-2.17 1.08 0 1.94.98 1.93 2.17 0 1.19-.86 2.16-1.93 2.16Zm6.97 0c-1.06 0-1.93-.97-1.93-2.16 0-1.2.85-2.17 1.93-2.17 1.08 0 1.94.98 1.93 2.17 0 1.19-.85 2.16-1.93 2.16Z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="mf-shell-login-wallet" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M2 4.5A2.5 2.5 0 0 1 4.5 2h7A2.5 2.5 0 0 1 14 4.5V5h-1.5A2.5 2.5 0 0 0 10 7.5v1A2.5 2.5 0 0 0 12.5 11H14v.5A2.5 2.5 0 0 1 11.5 14h-7A2.5 2.5 0 0 1 2 11.5v-7Zm9.5 4.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const smoothWrapperRef = useRef<HTMLDivElement>(null);
  const smoothContentRef = useRef<HTMLDivElement>(null);
  const [location] = useLocation();
  const pathname = location.replace(/\/$/, "") || "/";

  useLayoutEffect(() => {
    const wrapper = smoothWrapperRef.current;
    const content = smoothContentRef.current;
    if (!wrapper || !content) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canSmooth = window.matchMedia("(min-width: 1024px)").matches && !reducedMotion;
    if (!canSmooth) {
      ScrollTrigger.refresh();
      return undefined;
    }

    ScrollSmoother.get()?.kill();
    const smoother = ScrollSmoother.create({
      wrapper,
      content,
      smooth: 0.65,
      effects: "[data-speed], [data-lag]",
      smoothTouch: false,
    });

    document.documentElement.classList.add("mf-scroll-smoother-ready");
    const cancelRefresh = refreshSmoothScroll();

    return () => {
      cancelRefresh();
      document.documentElement.classList.remove("mf-scroll-smoother-ready");
      smoother.kill();
    };
  }, [pathname]);

  useEffect(() => {
    const smoother = ScrollSmoother.get();
    if (smoother) {
      smoother.scrollTo(0, false);
    } else {
      window.scrollTo(0, 0);
    }

    return refreshSmoothScroll();
  }, [pathname]);

  useEffect(() => {
    let frame = 0;
    let current = window.scrollY > 12;
    setScrolled(current);

    const syncScrolled = () => {
      frame = 0;
      const next = window.scrollY > 12;
      if (next !== current) {
        current = next;
        setScrolled(next);
      }
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncScrolled);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("mf-shell-mobile-menu-open", menuOpen);
    return () => document.body.classList.remove("mf-shell-mobile-menu-open");
  }, [menuOpen]);

  return (
    <div className="mf-shell">
      <EtherealBackground />
      <a href="#main" className="mf-skip-link">
        Skip to content
      </a>

      <nav className={cn("mf-shell-nav", scrolled && "mf-shell-nav--scrolled")}>
        <a href="/" className="mf-shell-nav-logo" aria-label="Meterflow home">
          <img src="/assets/brand/meterflow-mark.svg" alt="" className="mf-shell-brand-mark" aria-hidden="true" />
          Meterflow
        </a>

        <div className="mf-shell-nav-links">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              data-nav={item.href.slice(1)}
              className={cn(isActive(pathname, item.href) && "active")}
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="mf-shell-nav-actions">
          <div className="mf-shell-nav-socials">
            <a
              href="https://x.com/meterflowsol"
              target="_blank"
              rel="noopener"
              className="mf-shell-nav-social"
              aria-label="X"
            >
              <XIcon />
            </a>
            <a
              href="https://discord.gg/tned74z4eN"
              target="_blank"
              rel="noopener"
              className="mf-shell-nav-social"
              aria-label="Discord"
            >
              <DiscordIcon />
            </a>
            <a
              href={DEXSCREENER_URL}
              target="_blank"
              rel="noopener"
              className="mf-shell-nav-social"
              aria-label="DEX Screener"
            >
              <DexScreenerIcon className="mf-shell-nav-icon mf-shell-nav-icon--dexscreener" />
            </a>
          </div>
          <ButtonLink
            href="/dashboard"
            data-nav="dashboard"
            className={cn("mf-shell-login", isActive(pathname, "/dashboard") && "active")}
            size="sm"
          >
            <WalletIcon />
            <span>Launch Dashboard</span>
          </ButtonLink>
        </div>

        <button
          type="button"
          className={cn("mf-shell-menu-button", menuOpen && "active")}
          aria-label="Menu"
          aria-controls="mf-shell-mobile-menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span></span>
          <span></span>
          <span></span>
          <span className="sr-only">{menuOpen ? "Close menu" : "Open menu"}</span>
        </button>
      </nav>

      <div id="mf-shell-mobile-menu" className={cn("mf-shell-mobile-menu", menuOpen && "open")} aria-hidden={!menuOpen}>
        {navItems.map((item) => (
          <a key={item.href} href={item.href} data-nav={item.href.slice(1)} className={cn(isActive(pathname, item.href) && "active")}>
            {item.label}
          </a>
        ))}
        <a href="/dashboard" className="mf-shell-mobile-menu-cta primary" data-nav="dashboard">
          Launch Dashboard
        </a>
      </div>

      <div id="smooth-wrapper" className="mf-smooth-wrapper" ref={smoothWrapperRef}>
        <div id="smooth-content" className="mf-smooth-content" ref={smoothContentRef}>
          <main id="main" className="mf-main">
            {children}
          </main>

          <FlickeringFooter />
        </div>
      </div>
    </div>
  );
}

export function ArrowLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "ghost" }) {
  return (
    <ButtonLink href={href} variant={variant === "primary" ? "primary" : "secondary"}>
      {children}
      <ArrowRight className="h-4 w-4" />
    </ButtonLink>
  );
}
