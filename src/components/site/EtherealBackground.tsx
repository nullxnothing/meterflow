import { useEffect, useState } from "react";
import { Component as EtherealShadow } from "@/components/ui/etheral-shadow";

export function EtherealBackground() {
  const [showEtherealShadow, setShowEtherealShadow] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setShowEtherealShadow(desktop.matches && !reducedMotion.matches);

    sync();
    desktop.addEventListener("change", sync);
    reducedMotion.addEventListener("change", sync);

    return () => {
      desktop.removeEventListener("change", sync);
      reducedMotion.removeEventListener("change", sync);
    };
  }, []);

  return (
    <div className="mf-background" aria-hidden="true">
      <div className="mf-background__shadow mf-background__shadow--primary" />
      <div className="mf-background__shadow mf-background__shadow--secondary" />
      <div className="mf-background__wash" />
      {showEtherealShadow ? (
        <EtherealShadow
          className="mf-background__ethereal"
          color="rgba(var(--accent-2-rgb), 0.32)"
          animation={{ scale: 48, speed: 46 }}
          noise={{ opacity: 0.14, scale: 1.05 }}
          sizing="fill"
          showTitle={false}
        />
      ) : null}
      <div className="mf-background__noise" />
    </div>
  );
}
