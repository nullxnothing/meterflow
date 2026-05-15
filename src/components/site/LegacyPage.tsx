import { useLayoutEffect, useState } from "react";
import { FlickeringFooter } from "@/components/ui/flickering-footer";

const pageFiles: Record<string, string> = {
  "/status": "/site/status.html",
  "/buy": "/site/buy.html",
  "/apply": "/site/apply.html",
  "/privacy": "/site/privacy.html",
  "/terms": "/site/terms.html",
  "/404": "/site/404.html",
};

const activeNavByPath: Record<string, string> = {
  "/docs": "docs",
  "/how-it-works": "how-it-works",
  "/token": "token",
  "/status": "status",
  "/roadmap": "roadmap",
  "/apply": "apply",
  "/dashboard": "dashboard",
};

export function legacyPageForPath(pathname: string) {
  return pageFiles[pathname.replace(/\/$/, "") || "/"] ?? "/site/404.html";
}

function legacyStyleOrder(asset: HTMLLinkElement | HTMLStyleElement, index: number) {
  if (asset instanceof HTMLStyleElement) return 300 + index;

  const href = asset.getAttribute("href") ?? "";
  if (href.endsWith("/site/shared.css")) return 0 + index / 1000;
  if (href.endsWith("/site/public.css")) return 100 + index / 1000;
  return 200 + index / 1000;
}

function shouldSkipLegacyScript(src: string | null) {
  if (!src) return false;
  return src.includes("/_vercel/insights") || src.endsWith("/site/shared.js") || src.endsWith("/site/premium.js");
}

function shouldSkipLegacyStylesheet(href: string) {
  return href.includes("fonts.googleapis.com");
}

export function LegacyPage({ src }: { src: string }) {
  const [html, setHtml] = useState("");

  useLayoutEffect(() => {
    let cancelled = false;
    const injectedNodes: HTMLElement[] = [];
    const cleanups: Array<() => void> = [];
    const timers: number[] = [];

    const schedule = (fn: () => void, delay: number) => {
      const timer = window.setTimeout(fn, delay);
      timers.push(timer);
    };

    const bindShellBehavior = (host: Element) => {
      const activeKey = activeNavByPath[window.location.pathname.replace(/\/$/, "") || "/"];
      host.querySelectorAll("[data-nav]").forEach((link) => {
        link.classList.toggle("active", Boolean(activeKey && link.getAttribute("data-nav") === activeKey));
      });

      const nav = host.querySelector("nav.mf-nav");
      if (!(nav instanceof HTMLElement) || nav.dataset.reactShellBound === "true") return;
      nav.dataset.reactShellBound = "true";

      const hamburger = host.querySelector("#hamburger");
      const menu = host.querySelector("#mobileMenu");

      if (hamburger instanceof HTMLElement && menu instanceof HTMLElement) {
        const close = () => {
          menu.classList.remove("open");
          hamburger.classList.remove("active");
          hamburger.setAttribute("aria-expanded", "false");
          menu.setAttribute("aria-hidden", "true");
          document.body.classList.remove("mobile-menu-open");
        };

        const toggle = () => {
          const isOpen = menu.classList.toggle("open");
          hamburger.classList.toggle("active", isOpen);
          hamburger.setAttribute("aria-expanded", String(isOpen));
          menu.setAttribute("aria-hidden", String(!isOpen));
          document.body.classList.toggle("mobile-menu-open", isOpen);
        };

        const onDocumentClick = (event: MouseEvent) => {
          if (!menu.classList.contains("open")) return;
          if (menu.contains(event.target as Node)) return;
          if (hamburger.contains(event.target as Node)) return;
          close();
        };

        const onDocumentKeydown = (event: KeyboardEvent) => {
          if (event.key === "Escape") close();
        };

        hamburger.addEventListener("click", toggle);
        document.addEventListener("click", onDocumentClick);
        document.addEventListener("keydown", onDocumentKeydown);
        menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));

        cleanups.push(() => {
          close();
          hamburger.removeEventListener("click", toggle);
          document.removeEventListener("click", onDocumentClick);
          document.removeEventListener("keydown", onDocumentKeydown);
        });
      }

      const updateNavState = () => {
        document.body.classList.toggle("mf-nav-scrolled", window.scrollY > 12);
      };
      window.addEventListener("scroll", updateNavState, { passive: true });
      updateNavState();
      cleanups.push(() => {
        window.removeEventListener("scroll", updateNavState);
        document.body.classList.remove("mf-nav-scrolled", "mobile-menu-open");
      });
    };

    const syncRenderedPage = () => {
      const host = document.querySelector(".legacy-page-host");
      if (!(host instanceof HTMLElement)) return;

      bindShellBehavior(host);
      host.querySelectorAll(".reveal").forEach((element) => {
        element.classList.add("in", "visible");
      });
      host.querySelectorAll(".mf-load").forEach((element) => {
        element.classList.add("mf-in", "in", "visible");
      });
      host.querySelectorAll(".site-footer").forEach((element) => {
        element.remove();
      });
    };

    async function loadPage() {
      const response = await fetch(src);
      const text = await response.text();
      if (cancelled) return;

      const doc = new DOMParser().parseFromString(text, "text/html");
      document.title = doc.title || "Meterflow";
      document.body.className = doc.body.className;

      document.querySelectorAll("[data-legacy-page-asset]").forEach((node) => node.remove());

      Array.from(doc.head.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel="stylesheet"], style'))
        .map((asset, index) => ({ asset, index }))
        .sort((a, b) => legacyStyleOrder(a.asset, a.index) - legacyStyleOrder(b.asset, b.index))
        .map(({ asset }) => asset)
        .forEach((asset) => {
        if (asset instanceof HTMLLinkElement) {
          const href = asset.getAttribute("href");
          if (!href) return;
          if (shouldSkipLegacyStylesheet(href)) return;
          const next = document.createElement("link");
          next.rel = "stylesheet";
          next.href = href;
          next.setAttribute("data-legacy-page-asset", "true");
          document.head.appendChild(next);
          injectedNodes.push(next);
          return;
        }

        if (asset instanceof HTMLStyleElement) {
          const next = document.createElement("style");
          next.textContent = asset.textContent;
          next.setAttribute("data-legacy-page-asset", "true");
          document.head.appendChild(next);
          injectedNodes.push(next);
        }
      });

      const body = doc.body.cloneNode(true) as HTMLElement;
      body.querySelectorAll('link[rel="stylesheet"], style').forEach((asset) => asset.remove());
      const scripts = Array.from(body.querySelectorAll("script"));
      scripts.forEach((script) => script.remove());

      body.querySelectorAll(".reveal").forEach((element) => {
        element.classList.add("in", "visible");
      });
      body.querySelectorAll(".mf-load").forEach((element) => {
        element.classList.add("mf-in", "in", "visible");
      });
      body.querySelectorAll(".site-footer").forEach((element) => {
        element.remove();
      });

      setHtml(body.innerHTML);
      [0, 60, 180, 700, 1400, 2200].forEach((delay) => schedule(syncRenderedPage, delay));

      schedule(() => {
        if (cancelled) return;

        scripts.forEach((script) => {
          const src = script.getAttribute("src");
          if (shouldSkipLegacyScript(src)) return;

          const next = document.createElement("script");
          Array.from(script.attributes).forEach((attr) => next.setAttribute(attr.name, attr.value));
          if (!src) next.textContent = script.textContent;
          next.setAttribute("data-legacy-page-asset", "true");
          document.body.appendChild(next);
          injectedNodes.push(next);
        });
      }, 0);
    }

    loadPage().catch(() => {
      if (!cancelled) {
        setHtml('<main class="notfound"><div class="notfound-inner"><h1 class="notfound-title">Page failed to load.</h1></div></main>');
      }
    });

    return () => {
      cancelled = true;
      timers.forEach((timer) => window.clearTimeout(timer));
      cleanups.forEach((cleanup) => cleanup());
      injectedNodes.forEach((node) => node.remove());
    };
  }, [src]);

  return (
    <>
      <div className="legacy-page-host" dangerouslySetInnerHTML={{ __html: html }} />
      <FlickeringFooter />
    </>
  );
}
