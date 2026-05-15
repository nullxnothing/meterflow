import { Component, type ErrorInfo, type ReactNode } from "react";

type RouteErrorBoundaryProps = {
  children: ReactNode;
};

type RouteErrorBoundaryState = {
  hasError: boolean;
};

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(): RouteErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error("Route render failed", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <section className="mf-dashboard-redirect" role="alert">
          <p className="mf-eyebrow">Route Error</p>
          <h1 className="mf-redirect-title">This page could not load.</h1>
          <p className="mf-redirect-copy">Refresh the page or return home while the route bundle recovers.</p>
        </section>
      );
    }

    return this.props.children;
  }
}
