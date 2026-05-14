import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { RefObject } from "react";

gsap.registerPlugin(useGSAP);

export function useSurfaceFanMotion(scope: RefObject<HTMLDivElement | null>, activeIndex: number, paused: boolean) {
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

          const activeCard = root.querySelector<HTMLElement>(".mf-home-surface-card--active");
          if (!activeCard) return undefined;

          const activeContent = activeCard.querySelector<HTMLElement>(".mf-home-surface-card__content");
          const activeTopline = activeCard.querySelector<HTMLElement>(".mf-home-surface-card__topline");
          const activeScan = activeCard.querySelector<HTMLElement>(".mf-home-surface-card__scan");
          const activeValues = gsap.utils.toArray<HTMLElement>(activeCard.querySelectorAll(".mf-home-surface-row strong"));

          gsap.set(q(".mf-home-surface-card__bar, .mf-home-surface-card__foot, .mf-home-surface-row"), {
            clearProps: "opacity,visibility,transform,filter",
          });
          gsap.set(activeCard, {
            "--surface-pointer-x": 50,
            "--surface-pointer-y": 42,
          });

          if (reduceMotion) {
            gsap.set(q(".mf-home-surface-card__content, .mf-home-surface-row, .mf-home-surface-card__bar, .mf-home-surface-card__foot"), {
              autoAlpha: 1,
              clearProps: "transform,opacity,visibility,filter",
            });
            return undefined;
          }

          const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
          intro
            .fromTo(
              activeTopline,
              { scaleX: 0.18, autoAlpha: 0.5, transformOrigin: "center center" },
              { scaleX: 1, autoAlpha: 1, duration: 0.42, clearProps: "transform,opacity,visibility" },
            )
            .fromTo(
              activeValues,
              { textShadow: "0 0 0 rgba(125, 199, 255, 0)" },
              {
                textShadow: "0 0 18px rgba(125, 199, 255, 0.42)",
                duration: 0.22,
                stagger: 0.025,
                yoyo: true,
                repeat: 1,
                clearProps: "textShadow",
              },
              "<0.14",
            )
            .fromTo(
              activeScan,
              { xPercent: -120, autoAlpha: 0 },
              { xPercent: 120, autoAlpha: 0.8, duration: 0.72, ease: "power2.out", clearProps: "transform,opacity,visibility" },
              "<0.02",
            );

          if (!isDesktop) {
            return () => intro.kill();
          }

          const ambient = gsap.to(activeContent, {
            y: paused ? 0 : -5,
            duration: 2.8,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
          });

          const nearby = gsap.to(q(".mf-home-surface-card--next .mf-home-surface-card__content, .mf-home-surface-card--prev .mf-home-surface-card__content"), {
            y: paused ? 0 : 4,
            duration: 3.8,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            stagger: 0.18,
          });

          return () => {
            intro.kill();
            ambient.kill();
            nearby.kill();
          };
        },
      );

      return () => mm.revert();
    },
    { scope, dependencies: [activeIndex, paused], revertOnUpdate: true },
  );

  useGSAP(
    (context, contextSafe) => {
      const root = scope.current;
      if (!root) return undefined;

      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const canTilt = window.matchMedia("(min-width: 1024px)").matches && !reducedMotion;
      if (!canTilt) return undefined;

      const tiltToX = gsap.quickTo(root, "--surface-tilt-x", { duration: 0.38, ease: "power3.out" });
      const tiltToY = gsap.quickTo(root, "--surface-tilt-y", { duration: 0.38, ease: "power3.out" });

      const onPointerMove = contextSafe((event: PointerEvent) => {
        const activeCard = root.querySelector<HTMLElement>(".mf-home-surface-card--active");
        if (!activeCard) return;

        const rect = activeCard.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const localX = (event.clientX - rect.left) / rect.width;
        const localY = (event.clientY - rect.top) / rect.height;
        if (localX < -0.12 || localX > 1.12 || localY < -0.12 || localY > 1.12) return;

        const rotateY = gsap.utils.clamp(-5, 5, (localX - 0.5) * 9);
        const rotateX = gsap.utils.clamp(-4, 4, (0.5 - localY) * 8);

        tiltToY(rotateY);
        tiltToX(rotateX);
        gsap.to(activeCard, {
          "--surface-pointer-x": gsap.utils.clamp(0, 100, localX * 100),
          "--surface-pointer-y": gsap.utils.clamp(0, 100, localY * 100),
          duration: 0.32,
          ease: "power3.out",
          overwrite: "auto",
        });
      });

      const onPointerLeave = contextSafe(() => {
        tiltToX(0);
        tiltToY(0);
        const activeCard = root.querySelector<HTMLElement>(".mf-home-surface-card--active");
        if (activeCard) {
          gsap.to(activeCard, {
            "--surface-pointer-x": 50,
            "--surface-pointer-y": 42,
            duration: 0.44,
            ease: "power3.out",
            overwrite: "auto",
          });
        }
      });

      root.addEventListener("pointermove", onPointerMove, { passive: true });
      root.addEventListener("pointerleave", onPointerLeave);

      return () => {
        root.removeEventListener("pointermove", onPointerMove);
        root.removeEventListener("pointerleave", onPointerLeave);
      };
    },
    { scope },
  );
}
