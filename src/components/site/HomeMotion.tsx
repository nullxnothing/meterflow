import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

function formatCount(value: number, template: string) {
  const trimmed = template.trim();
  const prefix = trimmed.startsWith("$") ? "$" : "";
  const suffix = trimmed.endsWith("%") ? "%" : "";
  const rounded = Math.round(value);

  return `${prefix}${rounded.toLocaleString("en-US")}${suffix}`;
}

function numericValue(template: string) {
  const parsed = Number(template.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function revealTrigger(trigger: Element, start: string) {
  return {
    trigger,
    start,
    once: true,
    toggleActions: "play none none none",
  };
}

export function useHomeMotion(scope: RefObject<HTMLDivElement | null>) {
  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return undefined;

      return mountHomeMotion(root);
    },
    { scope },
  );
}

export function mountHomeMotion(root: HTMLDivElement) {
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

          gsap.defaults({ ease: "power3.out" });

          if (reduceMotion) {
            gsap.set(q("[data-mf-motion], [data-mf-count]"), {
              autoAlpha: 1,
              clearProps: "transform,opacity,visibility,filter",
            });
            return undefined;
          }

          const heroTimeline = gsap.timeline({ defaults: { duration: 0.82 }, delay: 0.06 });
          heroTimeline
            .from(q(".mf-home-hero__title"), {
              autoAlpha: 0,
              y: 34,
              filter: "blur(12px)",
              duration: 0.92,
              clearProps: "transform,opacity,visibility,filter",
            })
            .from(
              q(".mf-home-hero__attribution, .mf-home-hero__copy, .mf-home-hero__actions"),
              {
                autoAlpha: 0,
                y: 20,
                stagger: 0.09,
                clearProps: "transform,opacity,visibility",
              },
              "<0.22",
            );

          const statsTimeline = gsap.timeline({
            scrollTrigger: revealTrigger(q(".mf-home-stats")[0], "top 74%"),
          });
          statsTimeline
            .from(q(".mf-home-stats .mf-home-section-head"), {
              autoAlpha: 0,
              x: isDesktop ? -28 : 0,
              y: isDesktop ? 0 : 24,
              duration: 0.72,
              clearProps: "transform,opacity,visibility",
            })
            .from(
              q(".mf-home-stat"),
              {
                autoAlpha: 0,
                y: 28,
                stagger: 0.055,
                duration: 0.66,
                clearProps: "transform,opacity,visibility",
              },
              "<0.12",
            );

          gsap.utils.toArray<HTMLElement>(q("[data-mf-count]")).forEach((element) => {
            const template = element.dataset.mfCount || element.textContent || "0";
            const state = { value: 0 };
            gsap.to(state, {
              value: numericValue(template),
              duration: 1.35,
              ease: "power4.out",
              scrollTrigger: revealTrigger(element.closest(".mf-home-stats") || element, "top 72%"),
              onUpdate: () => {
                element.textContent = formatCount(state.value, template);
              },
              onComplete: () => {
                element.textContent = template;
              },
            });
          });

          const surfacesTimeline = gsap.timeline({
            scrollTrigger: revealTrigger(q(".mf-home-surfaces")[0], "top 72%"),
          });
          surfacesTimeline
            .from(q(".mf-home-surfaces .mf-home-section-head"), {
              autoAlpha: 0,
              y: 26,
              duration: 0.64,
              clearProps: "transform,opacity,visibility",
            })
            .from(
              q(".mf-home-surface-stage"),
              {
                autoAlpha: 0,
                y: 48,
                scale: 0.98,
                duration: 0.78,
                clearProps: "transform,opacity,visibility",
              },
              "<0.08",
            )
            .from(
              q(".mf-home-surface-nav button"),
              {
                autoAlpha: 0,
                y: 10,
                stagger: 0.035,
                duration: 0.36,
                clearProps: "transform,opacity,visibility",
              },
              "<0.44",
            );

          gsap.from(q(".mf-home-cta__inner"), {
            autoAlpha: 0,
            y: 42,
            scale: 0.985,
            duration: 0.82,
            clearProps: "transform,opacity,visibility",
            scrollTrigger: revealTrigger(q(".mf-home-cta")[0], "top 78%"),
          });

          gsap.from(q(".mf-home-cta .mf-kicker, .mf-home-cta h2, .mf-home-cta p:not(.mf-kicker), .mf-home-cta__actions a"), {
            autoAlpha: 0,
            y: 18,
            stagger: 0.08,
            duration: 0.52,
            clearProps: "transform,opacity,visibility",
            scrollTrigger: revealTrigger(q(".mf-home-cta")[0], "top 72%"),
          });

          return undefined;
        },
      );

      return () => mm.revert();
  }, root);

  return () => context.revert();
}
