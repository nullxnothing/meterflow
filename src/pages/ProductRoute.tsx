import { lazy } from "react";

const DocsPage = lazy(() => import("@/pages/Docs").then((module) => ({ default: module.DocsPage })));
const HowItWorksPage = lazy(() => import("@/pages/HowItWorks").then((module) => ({ default: module.HowItWorksPage })));
const TokenPage = lazy(() => import("@/pages/Token").then((module) => ({ default: module.TokenPage })));
const RegistryPage = lazy(() => import("@/pages/Registry").then((module) => ({ default: module.RegistryPage })));
const RoadmapPage = lazy(() => import("@/pages/Roadmap").then((module) => ({ default: module.RoadmapPage })));

const pageMap = {
  "/docs": DocsPage,
  "/docs.html": DocsPage,
  "/how-it-works": HowItWorksPage,
  "/how-it-works.html": HowItWorksPage,
  "/token": TokenPage,
  "/token.html": TokenPage,
  "/registry": RegistryPage,
  "/registry.html": RegistryPage,
  "/roadmap": RoadmapPage,
  "/roadmap.html": RoadmapPage,
};

export function productPageForPath(pathname: string) {
  const PageComponent = pageMap[pathname.replace(/\/$/, "") as keyof typeof pageMap];
  return PageComponent ? <PageComponent /> : null;
}

export function ProductRoute({ path }: { path: string }) {
  return <>{productPageForPath(path)}</>;
}
