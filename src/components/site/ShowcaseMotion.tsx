import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { useRef, type RefObject } from "react";

gsap.registerPlugin(useGSAP);

type Opts = {
  rootRef: RefObject<HTMLDivElement | null>;
  tab: string;
  enabled: boolean;
};

const NUMERIC_RE = /[-+]?\d[\d,]*\.?\d*/;

function tweenNumericText(el: HTMLElement, target: string, duration = 0.9) {
  const match = target.match(NUMERIC_RE);
  if (!match) {
    el.textContent = target;
    return;
  }
  const raw = match[0].replace(/,/g, "");
  const end = Number(raw);
  if (!Number.isFinite(end)) {
    el.textContent = target;
    return;
  }
  const decimals = (raw.split(".")[1] || "").length;
  const prefix = target.slice(0, match.index);
  const suffix = target.slice((match.index ?? 0) + match[0].length);
  const useGrouping = match[0].includes(",");
  const state = { v: 0 };
  gsap.fromTo(
    state,
    { v: 0 },
    {
      v: end,
      duration,
      ease: "power3.out",
      onUpdate: () => {
        const formatted = state.v.toLocaleString("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          useGrouping,
        });
        el.textContent = `${prefix}${formatted}${suffix}`;
      },
      onComplete: () => {
        el.textContent = target;
      },
    },
  );
}

export function useShowcaseMotion({ rootRef, tab, enabled }: Opts) {
  const firstRun = useRef(true);

  // A — Tab indicator FLIP
  useGSAP(
    () => {
      if (!enabled) return;
      const root = rootRef.current;
      if (!root) return;
      const indicator = root.querySelector<HTMLElement>(".mf-showcase-tab-indicator");
      const activeTab = root.querySelector<HTMLButtonElement>(".mf-showcase-tab.is-active");
      if (!indicator || !activeTab) return;
      const tabsWrap = activeTab.parentElement as HTMLElement;
      const wrapRect = tabsWrap.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      const x = tabRect.left - wrapRect.left;
      const width = tabRect.width;
      gsap.to(indicator, {
        x,
        width,
        duration: firstRun.current ? 0 : 0.55,
        ease: "expo.out",
        autoAlpha: 1,
        overwrite: "auto",
      });
    },
    { scope: rootRef, dependencies: [tab, enabled] },
  );

  // A+B+C+D — Choreographed swap on tab change
  useGSAP(
    () => {
      if (!enabled) return;
      const root = rootRef.current;
      if (!root) return;

      const swapTargets = root.querySelectorAll(
        ".mf-showcase-accent-line, .mf-showcase-progress__bar, .mf-tree-row, .mf-tree-item, .mf-tree-head, .mf-pane, .mf-code-line, .mf-sparkline polyline, .mf-row-value, .mf-showcase-score-value",
      );
      gsap.killTweensOf(swapTargets);

      const tl = gsap.timeline({
        defaults: { ease: "expo.out" },
        onComplete: () => {
          firstRun.current = false;
        },
      });

      // Accent line + progress bar wipe (A)
      const accent = root.querySelector(".mf-showcase-accent-line");
      const progress = root.querySelector(".mf-showcase-progress__bar");
      if (accent) {
        tl.fromTo(
          accent,
          { scaleX: 0, transformOrigin: "left center", autoAlpha: 0.4 },
          { scaleX: 1, autoAlpha: 1, duration: 0.7, overwrite: "auto" },
          0,
        );
      }
      if (progress) {
        tl.fromTo(
          progress,
          { scaleX: 0, transformOrigin: "left center" },
          { scaleX: 1, duration: 0.62, ease: "power2.inOut", overwrite: "auto" },
          0,
        );
      }

      // Tree rows cascade (A)
      const treeRows = gsap.utils.toArray<HTMLElement>(
        root.querySelectorAll(".mf-showcase-tree .mf-tree-row, .mf-showcase-tree .mf-tree-item, .mf-showcase-tree .mf-tree-head"),
      );
      if (treeRows.length) {
        tl.fromTo(
          treeRows,
          { autoAlpha: 0, x: -12, y: 6 },
          { autoAlpha: 1, x: 0, y: 0, duration: 0.5, stagger: 0.028 },
          0.06,
        );
      }

      // Panes scale-in (A)
      const panes = gsap.utils.toArray<HTMLElement>(root.querySelectorAll(".mf-showcase-detail .mf-pane"));
      if (panes.length) {
        tl.fromTo(
          panes,
          { autoAlpha: 0, y: 14, scale: 0.985, transformOrigin: "50% 0%" },
          { autoAlpha: 1, y: 0, scale: 1, duration: 0.55, stagger: 0.07 },
          0.08,
        );
      }

      // Code lines type-on via clip-path (B)
      const codeLines = gsap.utils.toArray<HTMLElement>(root.querySelectorAll(".mf-pane .mf-code-line"));
      if (codeLines.length) {
        tl.fromTo(
          codeLines,
          { clipPath: "inset(0 100% 0 0)", autoAlpha: 0.4 },
          {
            clipPath: "inset(0 0% 0 0)",
            autoAlpha: 1,
            duration: 0.42,
            ease: "power2.out",
            stagger: 0.045,
            clearProps: "clipPath",
          },
          0.22,
        );
      }

      // Sparkline draw (C)
      const sparkPolylines = gsap.utils.toArray<SVGPolylineElement>(root.querySelectorAll(".mf-sparkline polyline"));
      sparkPolylines.forEach((line) => {
        const total = typeof line.getTotalLength === "function" ? line.getTotalLength() : 240;
        gsap.set(line, { strokeDasharray: total, strokeDashoffset: total, autoAlpha: 1 });
        tl.to(
          line,
          {
            strokeDashoffset: 0,
            duration: 1.05,
            ease: "power2.inOut",
          },
          0.28,
        );
      });

      // Row value counters (D)
      const rowValues = gsap.utils.toArray<HTMLElement>(root.querySelectorAll(".mf-pane .mf-row-value"));
      rowValues.forEach((el, i) => {
        const target = el.textContent || "";
        tl.add(() => tweenNumericText(el, target, 0.85), 0.3 + i * 0.04);
      });

      // Score counter (D)
      const score = root.querySelector<HTMLElement>(".mf-showcase-score-value");
      if (score) {
        const target = score.textContent || "";
        tl.add(() => tweenNumericText(score, target, 0.7), 0.18);
      }
    },
    { scope: rootRef, dependencies: [tab, enabled] },
  );

  // E — 3D parallax tilt on hover ("push the corner" effect)
  useGSAP(
    () => {
      if (!enabled) return;
      if (typeof window === "undefined") return;
      if (window.matchMedia("(hover: none)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      const root = rootRef.current;
      if (!root) return;
      const frame = root.querySelector<HTMLElement>(".mf-showcase-frame");
      if (!frame) return;

      gsap.set(frame, {
        transformPerspective: 1200,
        transformOrigin: "50% 50%",
        z: 18,
        willChange: "transform",
      });

      const MAX_DEG = 7;
      const HOVER_Z = 42;
      const REST_Z = 18;
      const rotateXTo = gsap.quickTo(frame, "rotateX", { duration: 0.42, ease: "power3.out" });
      const rotateYTo = gsap.quickTo(frame, "rotateY", { duration: 0.42, ease: "power3.out" });
      const zTo = gsap.quickTo(frame, "z", { duration: 0.55, ease: "expo.out" });
      let frameRect: DOMRect | null = null;

      const onEnter = () => {
        frameRect = frame.getBoundingClientRect();
        zTo(HOVER_Z);
        frame.classList.add("is-hovering");
      };

      const onMove = (e: MouseEvent) => {
        const r = frameRect || frame.getBoundingClientRect();
        const dx = (e.clientX - r.left) / r.width - 0.5;
        const dy = (e.clientY - r.top) / r.height - 0.5;
        rotateYTo(dx * MAX_DEG * 2);
        rotateXTo(-dy * MAX_DEG * 2);
      };

      const onLeave = () => {
        frameRect = null;
        rotateYTo(0);
        rotateXTo(0);
        zTo(REST_Z);
        frame.classList.remove("is-hovering");
      };

      const resizeObserver = new ResizeObserver(() => {
        frameRect = frame.matches(":hover") ? frame.getBoundingClientRect() : null;
      });
      resizeObserver.observe(frame);
      frame.addEventListener("mouseenter", onEnter);
      frame.addEventListener("mousemove", onMove);
      frame.addEventListener("mouseleave", onLeave);

      return () => {
        resizeObserver.disconnect();
        frame.removeEventListener("mouseenter", onEnter);
        frame.removeEventListener("mousemove", onMove);
        frame.removeEventListener("mouseleave", onLeave);
        frame.classList.remove("is-hovering");
        gsap.killTweensOf(frame);
        gsap.set(frame, { rotateX: 0, rotateY: 0, z: 0, clearProps: "willChange" });
      };
    },
    { scope: rootRef, dependencies: [enabled] },
  );
}
