import { lazy, Suspense, type ReactNode } from "react";
import { Route, Switch, useLocation } from "wouter";
import { HomePage } from "@/components/site/HomePage";
import { LegacyPage, legacyPageForPath } from "@/components/site/LegacyPage";
import { RouteErrorBoundary } from "@/components/site/RouteErrorBoundary";
import { Shell } from "@/components/site/Shell";

const ProductRoute = lazy(() => import("@/pages/ProductRoute").then((module) => ({ default: module.ProductRoute })));
const LogoMorphCapture = lazy(() => import("@/pages/LogoMorphCapture").then((module) => ({ default: module.LogoMorphCapture })));

const homePaths = ["/", "/index.html"];
const capturePaths = ["/logo-morph", "/logo-morph.html"];
const productPaths = ["/docs", "/docs.html", "/how-it-works", "/how-it-works.html", "/token", "/token.html", "/registry", "/registry.html", "/roadmap", "/roadmap.html"];
const dashboardPaths = ["/dashboard", "/dashboard/index.html"];

export default function App() {
  return (
    <Switch>
      {homePaths.map((path) => (
        <Route path={path} key={path}>
          <RouteFrame>
            <HomePage />
          </RouteFrame>
        </Route>
      ))}
      {capturePaths.map((path) => (
        <Route path={path} key={path}>
          <Suspense fallback={<RouteFallback />}>
            <LogoMorphCapture />
          </Suspense>
        </Route>
      ))}
      {productPaths.map((path) => (
        <Route path={path} key={path}>
          <RouteFrame>
            <ProductRoute path={path} />
          </RouteFrame>
        </Route>
      ))}
      {dashboardPaths.map((path) => (
        <Route path={path} key={path}>
          <LegacyPage src={legacyPageForPath(path)} />
        </Route>
      ))}
      <Route>
        <LegacyFallback />
      </Route>
    </Switch>
  );
}

function RouteFallback() {
  return <div className="mf-route-fallback" aria-hidden="true" />;
}

function RouteFrame({ children }: { children: ReactNode }) {
  return (
    <Shell>
      <RouteErrorBoundary>
        <Suspense fallback={<RouteFallback />}>{children}</Suspense>
      </RouteErrorBoundary>
    </Shell>
  );
}

function LegacyFallback() {
  const [path] = useLocation();
  return <LegacyPage src={legacyPageForPath(path)} />;
}
