import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Component as EtherealShadow } from "@/components/ui/etheral-shadow";

gsap.registerPlugin(useGSAP);

export function EtherealBackground() {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) return undefined;

      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const ethereal = q(".mf-background__ethereal");
        gsap.set(ethereal, {
          transformOrigin: "50% 50%",
          willChange: "transform, opacity",
        });

        const drift = gsap.timeline({
          repeat: -1,
          yoyo: true,
          defaults: { ease: "sine.inOut" },
        });

        drift
          .to(ethereal, {
            xPercent: 5.2,
            yPercent: -3.4,
            scale: 1.06,
            rotation: 2,
            opacity: 0.86,
            duration: 14,
          })
          .to(
            q(".mf-background__vignette"),
            {
              opacity: 0.88,
              duration: 14,
            },
            0,
          );

        return () => {
          drift.kill();
        };
      });

      return () => mm.revert();
    },
    { scope: rootRef },
  );

  return (
    <div className="mf-background" aria-hidden="true" ref={rootRef}>
      <div className="mf-background__shadow mf-background__shadow--primary" />
      <div className="mf-background__shadow mf-background__shadow--secondary" />
      <div className="mf-background__wash" />
      <EtherealShadow
        className="mf-background__ethereal"
        color="rgba(var(--accent-2-rgb), 0.32)"
        animation={{ scale: 48, speed: 46 }}
        noise={{ opacity: 0.14, scale: 1.05 }}
        sizing="fill"
        showTitle={false}
      />
      <div className="mf-background__noise" />
      <div className="mf-background__vignette" />
    </div>
  );
}
