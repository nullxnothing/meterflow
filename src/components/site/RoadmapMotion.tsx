import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function useRoadmapMotion(scope: RefObject<HTMLDivElement | null>) {
  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return undefined;

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

          const motionTargets = q(
            ".mf-page-hero__content > *, .mf-page-hero__aside, .mf-metric-panel__item, .mf-roadmap-strip span, .mf-timeline-item__rail span, .mf-timeline-item__body, .mf-check-list li, .mf-cta-panel",
          );

          const clearActiveState = () => {
            q(".mf-roadmap-strip span, .mf-timeline-item").forEach((element) => element.classList.remove("is-active"));
          };

          if (reduceMotion) {
            gsap.set(motionTargets, {
              autoAlpha: 1,
              clearProps: "transform,opacity,visibility,filter",
            });
            gsap.set(q(".mf-roadmap-progress"), { scaleY: 1, autoAlpha: 1 });
            return clearActiveState;
          }

          const heroTimeline = gsap.timeline({ defaults: { duration: 0.72, ease: "power3.out" } });
          heroTimeline
            .from(q(".mf-page-hero__content > *"), {
              autoAlpha: 0,
              y: 26,
              stagger: 0.075,
              clearProps: "transform,opacity,visibility",
            })
            .from(
              q(".mf-page-hero__aside"),
              {
                autoAlpha: 0,
                y: isDesktop ? 28 : 20,
                scale: 0.975,
                rotationX: isDesktop ? 5 : 0,
                transformOrigin: "50% 70%",
                duration: 0.86,
                clearProps: "transform,opacity,visibility",
              },
              "<0.16",
            )
            .from(
              q(".mf-metric-panel__item"),
              {
                autoAlpha: 0,
                x: isDesktop ? 18 : 0,
                y: isDesktop ? 0 : 12,
                stagger: 0.075,
                duration: 0.46,
                clearProps: "transform,opacity,visibility",
              },
              "<0.22",
            );

          gsap.from(q(".mf-roadmap-strip span"), {
            autoAlpha: 0,
            y: 16,
            scale: 0.96,
            stagger: 0.045,
            duration: 0.5,
            ease: "power3.out",
            clearProps: "transform,opacity,visibility",
            scrollTrigger: {
              trigger: q(".mf-roadmap-strip")[0],
              start: "top 84%",
              once: true,
            },
          });

          if (isDesktop) {
            gsap.fromTo(
              q(".mf-roadmap-progress"),
              { scaleY: 0, transformOrigin: "top center" },
              {
                scaleY: 1,
                ease: "none",
                scrollTrigger: {
                  trigger: q(".mf-timeline")[0],
                  start: "top 72%",
                  end: "bottom 62%",
                  scrub: 0.6,
                },
              },
            );
          } else {
            gsap.set(q(".mf-roadmap-progress"), { autoAlpha: 0 });
          }

          const activatePillar = (item: HTMLElement) => {
            const pillar = item.dataset.roadmapPillar;
            clearActiveState();
            item.classList.add("is-active");
            if (pillar) {
              q(`.mf-roadmap-strip span[data-roadmap-pillar="${pillar}"]`).forEach((element) => element.classList.add("is-active"));
            }
          };

          gsap.utils.toArray<HTMLElement>(q(".mf-timeline-item")).forEach((item, index) => {
            const body = item.querySelector<HTMLElement>(".mf-timeline-item__body");
            const marker = item.querySelector<HTMLElement>(".mf-timeline-item__rail span");
            const checklistItems = gsap.utils.toArray<HTMLElement>(item.querySelectorAll(".mf-check-list li"));

            const timeline = gsap.timeline({
              scrollTrigger: {
                trigger: item,
                start: "top 78%",
                once: true,
              },
              defaults: { ease: "power3.out" },
            });

            timeline
              .from(marker, {
                autoAlpha: 0,
                scale: 0.72,
                y: 12,
                duration: 0.42,
                clearProps: "transform,opacity,visibility",
              })
              .from(
                body,
                {
                  autoAlpha: 0,
                  y: 32,
                  scale: 0.985,
                  duration: 0.62,
                  clearProps: "transform,opacity,visibility",
                },
                "<0.06",
              )
              .from(
                checklistItems,
                {
                  autoAlpha: 0,
                  x: 12,
                  stagger: 0.045,
                  duration: 0.34,
                  clearProps: "transform,opacity,visibility",
                },
                "<0.22",
              );

            ScrollTrigger.create({
              trigger: item,
              start: index === 0 ? "top 84%" : "top center",
              end: "bottom center",
              onEnter: () => activatePillar(item),
              onEnterBack: () => activatePillar(item),
            });
          });

          gsap.from(q(".mf-cta-panel"), {
            autoAlpha: 0,
            y: 36,
            scale: 0.985,
            duration: 0.72,
            ease: "power3.out",
            clearProps: "transform,opacity,visibility",
            scrollTrigger: {
              trigger: q(".mf-cta-panel")[0],
              start: "top 82%",
              once: true,
            },
          });

          return clearActiveState;
        },
      );

      return () => mm.revert();
    },
    { scope },
  );
}
