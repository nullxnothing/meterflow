import { LogoOrbit } from "@/components/site/LogoOrbit";

export function LogoMorphCapture() {
  return (
    <main className="mf-logo-capture-page" aria-label="Meterflow x402 logo morph capture">
      <div className="mf-logo-capture__frame" aria-hidden="true">
        <LogoOrbit className="mf-logo-capture__orbit" mode="recording" />
      </div>
    </main>
  );
}
