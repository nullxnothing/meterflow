import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP);

function tweenSurfaceValue(element: HTMLElement) {
  const source = element.dataset.mfSurfaceValue || element.textContent || "";
  const match = source.match(/-?\d[\d,]*(?:\.\d+)?/);
  if (!match) return undefined;

  const rawNumber = match[0];
  const end = Number(rawNumber.replace(/,/g, ""));
  if (!Number.isFinite(end)) return undefined;

  const decimals = rawNumber.includes(".") ? rawNumber.split(".")[1]?.length || 0 : 0;
  const state = { value: 0 };
  const prefix = source.slice(0, match.index || 0);
  const suffix = source.slice((match.index || 0) + rawNumber.length);

  return gsap.to(state, {
    value: end,
    duration: 0.74,
    ease: "power3.out",
    onUpdate: () => {
      const value = decimals > 0 ? state.value.toFixed(decimals) : Math.round(state.value).toLocaleString();
      element.textContent = `${prefix}${value}${suffix}`;
    },
    onComplete: () => {
      element.textContent = source;
    },
  });
}

export function useSurfaceFanMotion(scope: RefObject<HTMLDivElement | null>, activeIndex: number, paused: boolean) {
  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return undefined;

      return mountSurfaceFanMotion(root, activeIndex, paused);
    },
    { scope, dependencies: [activeIndex, paused], revertOnUpdate: true },
  );

  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return undefined;

      return mountSurfaceFanTilt(root);
    },
    { scope },
  );
}

export function mountSurfaceFanMotion(root: HTMLDivElement, activeIndex: number, paused: boolean) {
  const context = gsap.context(() => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();

      mm.add(
        {
          isDesktop: "(min-width: 1024px)",
          isMobile: "(max-width: 1023px)",
          reduceMotion: "(prefers-reduced-motion: reduce)",
        },
        (context) => {
          const { isDesktop, reduceMotion } = context.conditions as {
            isDesktop: boolean;
            isMobile: boolean;
            reduceMotion: boolean;
          };

          const activeCard = root.querySelector<HTMLElement>(".mf-home-surface-card--active");
          if (!activeCard) return undefined;

          const activeContent = activeCard.querySelector<HTMLElement>(".mf-home-surface-card__content");
          const activeTopline = activeCard.querySelector<HTMLElement>(".mf-home-surface-card__topline");
          const activeScan = activeCard.querySelector<HTMLElement>(".mf-home-surface-card__scan");
          const activeValues = gsap.utils.toArray<HTMLElement>(activeCard.querySelectorAll(".mf-home-surface-row strong"));
          const nearbyContent = gsap.utils.toArray<HTMLElement>(
            q(".mf-home-surface-card--next .mf-home-surface-card__content, .mf-home-surface-card--prev .mf-home-surface-card__content"),
          );
          const styles = getComputedStyle(document.documentElement);
          const textGlowStart = styles.getPropertyValue("--motion-text-glow-start").trim();
          const textGlowActive = styles.getPropertyValue("--motion-text-glow-active").trim();

          gsap.set(q(".mf-home-surface-card__bar, .mf-home-surface-card__foot, .mf-home-surface-row"), {
            clearProps: "opacity,visibility,transform,filter",
          });
          if (reduceMotion) {
            gsap.set(q(".mf-home-surface-card__content, .mf-home-surface-row, .mf-home-surface-card__bar, .mf-home-surface-card__foot"), {
              autoAlpha: 1,
              clearProps: "transform,opacity,visibility,filter",
            });
            return undefined;
          }

          gsap.set([activeCard, activeContent, ...nearbyContent], { willChange: "transform,opacity" });
          gsap.killTweensOf([activeContent, activeTopline, activeScan, activeValues, nearbyContent]);

          const valueTweens: gsap.core.Tween[] = [];
          const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
          intro
            .fromTo(
              activeTopline,
              { scaleX: 0.18, autoAlpha: 0.5, transformOrigin: "center center" },
              { scaleX: 1, autoAlpha: 1, duration: 0.42, clearProps: "transform,opacity,visibility" },
            )
            .fromTo(
              activeValues,
              { textShadow: textGlowStart },
            {
              textShadow: textGlowActive,
              duration: 0.22,
              stagger: 0.025,
              overwrite: "auto",
              yoyo: true,
              repeat: 1,
              clearProps: "textShadow",
              },
              "<0.14",
            )
            .add(() => {
              valueTweens.forEach((tween) => tween.kill());
              valueTweens.length = 0;
              activeValues.forEach((element) => {
                const tween = tweenSurfaceValue(element);
                if (tween) valueTweens.push(tween);
              });
            }, "<")
            .fromTo(
              activeScan,
              { xPercent: -120, autoAlpha: 0 },
              { xPercent: 120, autoAlpha: 0.8, duration: 0.72, ease: "power2.out", overwrite: "auto", clearProps: "transform,opacity,visibility" },
              "<0.02",
            );

          if (!isDesktop) {
            return () => {
              intro.kill();
              valueTweens.forEach((tween) => tween.kill());
              activeValues.forEach((element) => {
                element.textContent = element.dataset.mfSurfaceValue || element.textContent;
              });
              gsap.set([activeCard, activeContent, ...nearbyContent], { clearProps: "willChange" });
            };
          }

          const ambient = gsap.to(activeContent, {
            y: paused ? 0 : -5,
            duration: 2.8,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            overwrite: "auto",
          });

          const nearby = gsap.to(nearbyContent, {
            y: paused ? 0 : 4,
            duration: 3.8,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            stagger: 0.18,
            overwrite: "auto",
          });

          return () => {
            intro.kill();
            valueTweens.forEach((tween) => tween.kill());
            activeValues.forEach((element) => {
              element.textContent = element.dataset.mfSurfaceValue || element.textContent;
            });
            ambient.kill();
            nearby.kill();
            gsap.set([activeCard, activeContent, ...nearbyContent], { clearProps: "willChange" });
          };
        },
      );

      return () => mm.revert();
  }, root);

  return () => context.revert();
}

export function mountSurfaceFanTilt(root: HTMLDivElement) {
  const context = gsap.context(() => {
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const canTilt = window.matchMedia("(min-width: 1024px)").matches && !reducedMotion;
      if (!canTilt) return undefined;

      const tiltToX = gsap.quickTo(root, "--surface-tilt-x", { duration: 0.38, ease: "power3.out" });
      const tiltToY = gsap.quickTo(root, "--surface-tilt-y", { duration: 0.38, ease: "power3.out" });
      let activeCard: HTMLElement | null = null;
      let activeRect: DOMRect | null = null;
      let measureFrame = 0;

      const measureActiveCard = () => {
        measureFrame = 0;
        activeCard = root.querySelector<HTMLElement>(".mf-home-surface-card--active");
        activeRect = activeCard?.getBoundingClientRect() ?? null;
      };

      const queueMeasure = () => {
        if (measureFrame) return;
        measureFrame = window.requestAnimationFrame(measureActiveCard);
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!activeRect) measureActiveCard();
        const rect = activeRect;
        if (!rect?.width || !rect.height) return;

        const localX = (event.clientX - rect.left) / rect.width;
        const localY = (event.clientY - rect.top) / rect.height;
        if (localX < -0.12 || localX > 1.12 || localY < -0.12 || localY > 1.12) return;

        const rotateY = gsap.utils.clamp(-5, 5, (localX - 0.5) * 9);
        const rotateX = gsap.utils.clamp(-4, 4, (0.5 - localY) * 8);

        tiltToY(rotateY);
        tiltToX(rotateX);
      };

      const onPointerLeave = () => {
        tiltToX(0);
        tiltToY(0);
      };

      measureActiveCard();
      const mutationObserver = new MutationObserver(queueMeasure);
      mutationObserver.observe(root, { attributes: true, attributeFilter: ["class"], subtree: true });
      const resizeObserver = new ResizeObserver(queueMeasure);
      resizeObserver.observe(root);

      root.addEventListener("pointermove", onPointerMove, { passive: true });
      root.addEventListener("pointerleave", onPointerLeave);

      return () => {
        if (measureFrame) window.cancelAnimationFrame(measureFrame);
        mutationObserver.disconnect();
        resizeObserver.disconnect();
        root.removeEventListener("pointermove", onPointerMove);
        root.removeEventListener("pointerleave", onPointerLeave);
      };
  }, root);

  return () => context.revert();
}
