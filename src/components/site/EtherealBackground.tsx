import { Component as EtherealShadow } from "@/components/ui/etheral-shadow";

export function EtherealBackground() {
  return (
    <div className="mf-background" aria-hidden="true">
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
    </div>
  );
}
