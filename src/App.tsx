import { lazy, Suspense, useEffect } from "react";
import { ButtonLink } from "@/components/ui/button";
import { LegacyPage, legacyPageForPath } from "@/src/components/site/LegacyPage";
import { Shell } from "@/src/components/site/Shell";

const HomePage = lazy(() => import("@/src/components/site/HomePage").then((module) => ({ default: module.HomePage })));
const ProductRoute = lazy(() => import("@/src/components/site/ProductPages").then((module) => ({ default: module.ProductRoute })));

const productPaths = new Set(["/docs", "/docs.html", "/how-it-works", "/how-it-works.html", "/token", "/token.html", "/roadmap", "/roadmap.html"]);

export default function App() {
  const path = window.location.pathname.replace(/\/$/, "") || "/";

  if (path === "/dashboard") {
    return <DashboardRedirect />;
  }

  if (path === "/" || path === "/index.html") {
    return (
      <Shell>
        <Suspense fallback={<RouteFallback />}>
          <HomePage />
        </Suspense>
      </Shell>
    );
  }

  if (productPaths.has(path)) {
    return (
      <Shell>
        <Suspense fallback={<RouteFallback />}>
          <ProductRoute path={path} />
        </Suspense>
      </Shell>
    );
  }

  return <LegacyPage src={legacyPageForPath(path)} />;
}

function RouteFallback() {
  return <div className="mf-route-fallback" aria-hidden="true" />;
}

function DashboardRedirect() {
  useEffect(() => {
    window.location.replace("/dashboard/index.html");
  }, []);

  return (
    <Shell>
      <section className="mf-dashboard-redirect">
        <p className="mf-eyebrow">Dashboard</p>
        <h1 className="mf-redirect-title">Opening dashboard.</h1>
        <p className="mf-redirect-copy">The dashboard remains on the existing static bundle during this migration.</p>
        <ButtonLink className="mt-8 w-fit" href="/dashboard/index.html">
          Open dashboard
        </ButtonLink>
      </section>
    </Shell>
  );
}
