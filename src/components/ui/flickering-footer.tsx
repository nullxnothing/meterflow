"use client";

import { ChevronRight } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DEXSCREENER_URL } from "@/components/site/social-links";
import { cn } from "@/lib/utils";

interface FlickeringGridProps extends React.HTMLAttributes<HTMLDivElement> {
  squareSize?: number;
  gridGap?: number;
  flickerChance?: number;
  color?: string;
  width?: number;
  height?: number;
  className?: string;
  maxOpacity?: number;
  fps?: number;
}

type GridParams = {
  cols: number;
  rows: number;
  squares: Float32Array;
  dpr: number;
};

const parseRgb = (color: string) => {
  const channels = color.match(/\d+(\.\d+)?/g)?.slice(0, 3).map(Number);
  if (!channels || channels.length < 3) return "183, 221, 255";
  return `${channels[0]}, ${channels[1]}, ${channels[2]}`;
};

export const FlickeringGrid = ({
  squareSize = 2,
  gridGap = 8,
  flickerChance = 0.012,
  color = "183, 221, 255",
  width,
  height,
  className,
  maxOpacity = 0.1,
  fps = 0,
  ...props
}: FlickeringGridProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const rgb = useMemo(() => parseRgb(color), [color]);

  const setupCanvas = useCallback(
    (canvas: HTMLCanvasElement, nextWidth: number, nextHeight: number): GridParams => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1);
      canvas.width = Math.max(1, Math.floor(nextWidth * dpr));
      canvas.height = Math.max(1, Math.floor(nextHeight * dpr));
      canvas.style.width = `${nextWidth}px`;
      canvas.style.height = `${nextHeight}px`;

      const cols = Math.ceil(nextWidth / (squareSize + gridGap));
      const rows = Math.ceil(nextHeight / (squareSize + gridGap));
      const squares = new Float32Array(cols * rows);

      for (let i = 0; i < squares.length; i += 1) {
        squares[i] = Math.random() * maxOpacity;
      }

      return { cols, rows, squares, dpr };
    },
    [gridGap, maxOpacity, squareSize],
  );

  const drawGrid = useCallback(
    (ctx: CanvasRenderingContext2D, pixelWidth: number, pixelHeight: number, params: GridParams) => {
      ctx.clearRect(0, 0, pixelWidth, pixelHeight);

      const step = (squareSize + gridGap) * params.dpr;
      const size = squareSize * params.dpr;

      for (let i = 0; i < params.cols; i += 1) {
        for (let j = 0; j < params.rows; j += 1) {
          const opacity = params.squares[i * params.rows + j];
          if (opacity < 0.012) continue;

          ctx.fillStyle = `rgba(${rgb}, ${opacity})`;
          ctx.fillRect(i * step, j * step, size, size);
        }
      }
    },
    [gridGap, rgb, squareSize],
  );

  const updateSquares = useCallback(
    (squares: Float32Array, deltaTime: number) => {
      const chance = flickerChance * deltaTime;
      for (let i = 0; i < squares.length; i += 1) {
        if (Math.random() < chance) {
          squares[i] = Math.random() * maxOpacity;
        }
      }
    },
    [flickerChance, maxOpacity],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const intersectionObserver = new IntersectionObserver(([entry]) => setIsInView(entry.isIntersecting), {
      rootMargin: "0px",
      threshold: 0,
    });
    intersectionObserver.observe(container);

    return () => intersectionObserver.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !isInView || reducedMotion) return undefined;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return undefined;

    let timeoutId = 0;
    let params = setupCanvas(canvas, width || container.clientWidth, height || container.clientHeight);

    const updateCanvasSize = () => {
      const nextWidth = width || container.clientWidth;
      const nextHeight = height || container.clientHeight;
      params = setupCanvas(canvas, nextWidth, nextHeight);
      drawGrid(ctx, canvas.width, canvas.height, params);
    };

    updateCanvasSize();

    let lastTime = 0;
    const frameInterval = 1000 / Math.max(1, fps);

    const animate = () => {
      if (!isInView || reducedMotion) return;

      const time = performance.now();
      const deltaTime = lastTime ? (time - lastTime) / 1000 : frameInterval / 1000;
      lastTime = time;
      updateSquares(params.squares, deltaTime);
      drawGrid(ctx, canvas.width, canvas.height, params);

      timeoutId = window.setTimeout(animate, frameInterval);
    };

    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(container);

    if (fps <= 0) {
      return () => {
        resizeObserver.disconnect();
      };
    }

    timeoutId = window.setTimeout(animate, frameInterval);

    return () => {
      window.clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [drawGrid, fps, height, isInView, reducedMotion, setupCanvas, updateSquares, width]);

  return (
    <div ref={containerRef} className={cn("h-full w-full", className)} {...props}>
      <canvas
        ref={canvasRef}
        className="pointer-events-none block h-full w-full"
      />
    </div>
  );
};

export function useMediaQuery(query: string) {
  const [value, setValue] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    const checkQuery = () => setValue(mediaQuery.matches);
    checkQuery();
    mediaQuery.addEventListener("change", checkQuery);
    return () => mediaQuery.removeEventListener("change", checkQuery);
  }, [query]);

  return value;
}

const footerLinks = [
  {
    title: "Product",
    links: [
      { id: 1, title: "Dashboard", url: "/dashboard" },
      { id: 2, title: "Token", url: "/token" },
      { id: 3, title: "How it works", url: "/how-it-works" },
      { id: 4, title: "Documentation", url: "/docs" },
    ],
  },
  {
    title: "Build",
    links: [
      { id: 5, title: "Roadmap", url: "/roadmap" },
      { id: 6, title: "Status", url: "/status" },
      { id: 7, title: "Apply as provider", url: "/apply" },
      { id: 8, title: "Privacy", url: "/privacy" },
    ],
  },
  {
    title: "Community",
    links: [
      { id: 9, title: "X / Twitter", url: "https://x.com/meterflowsol" },
      { id: 10, title: "Discord", url: "https://discord.gg/tned74z4eN" },
      { id: 11, title: "DEX Screener", url: DEXSCREENER_URL },
      { id: 12, title: "GitHub", url: "https://github.com/nullxnothing/meterflow" },
      { id: 13, title: "Terms", url: "/terms" },
    ],
  },
];

export const Component = () => {
  const compact = useMediaQuery("(max-width: 1024px)");

  return (
    <footer className="mf-footer-art">
      <div className="mf-footer-art__canvas">
        <div className="mf-footer-art__canvas-bg" />
        <div className="mf-footer-art__watermark">
          {compact ? "Meterflow" : "Agent commerce"}
        </div>
        <div className="mf-footer-art__flicker">
          <FlickeringGrid
            className="h-full w-full"
            squareSize={2}
            gridGap={compact ? 5 : 4}
            color="183, 221, 255"
            maxOpacity={0.22}
            flickerChance={0.018}
          />
        </div>
        <div className="mf-footer-art__canvas-fade" />
        <div className="mf-footer-art__content">
          <div className="mf-footer-art__grid">
            <div className="mf-footer-art__brand">
              <a href="/" className="mf-footer-art__logo">
                <img src="/assets/brand/meterflow-mark.svg" alt="" className="size-7 opacity-80" aria-hidden="true" />
                Meterflow
              </a>
              <p className="mf-footer-art__summary">
                Control plane for agent commerce on Solana. Meter endpoints, track receipts, and cap autonomous spend.
              </p>
            </div>

            <div className="mf-footer-art__links">
              {footerLinks.map((column) => (
                <ul key={column.title} className="mf-footer-art__column">
                  <li className="mf-footer-art__title">{column.title}</li>
                  {column.links.map((link) => {
                    const external = link.url.startsWith("http");
                    return (
                      <li key={link.id} className="mf-footer-art__item">
                        <a href={link.url} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined}>
                          {link.title}
                        </a>
                        <span className="mf-footer-art__arrow">
                          <ChevronRight className="size-3" />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ))}
            </div>
          </div>

          <div className="mf-footer-art__bottom">
            <span>Copyright 2026 Meterflow / Built on Solana</span>
            <span>Payments, receipts, budgets, and provider revenue for agent commerce.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export { Component as FlickeringFooter };
