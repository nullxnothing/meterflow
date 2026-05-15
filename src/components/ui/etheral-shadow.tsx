"use client";

import React, { CSSProperties, ReactNode, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

interface ResponsiveImage {
  src: string;
  alt?: string;
  srcSet?: string;
}

interface AnimationConfig {
  preview?: boolean;
  scale: number;
  speed: number;
}

interface NoiseConfig {
  opacity: number;
  scale: number;
}

interface ShadowOverlayProps {
  type?: "preset" | "custom";
  presetIndex?: number;
  customImage?: ResponsiveImage;
  sizing?: "fill" | "stretch";
  color?: string;
  animation?: AnimationConfig;
  noise?: NoiseConfig;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
  showTitle?: boolean;
}

type CSSVarStyle = CSSProperties & Record<`--${string}`, string | number>;

function mapRange(
  value: number,
  fromLow: number,
  fromHigh: number,
  toLow: number,
  toHigh: number,
): number {
  if (fromLow === fromHigh) {
    return toLow;
  }
  const percentage = (value - fromLow) / (fromHigh - fromLow);
  return toLow + percentage * (toHigh - toLow);
}

const useInstanceId = (): string => {
  const id = useId();
  const cleanId = id.replace(/:/g, "");
  return `shadowoverlay-${cleanId}`;
};

export function Component({
  sizing = "fill",
  color = "var(--text-muted)",
  animation,
  noise,
  style,
  className,
  children,
  showTitle = true,
}: ShadowOverlayProps) {
  const id = useInstanceId();
  const animationEnabled = Boolean(animation && animation.scale > 0);
  const feColorMatrixRef = useRef<SVGFEColorMatrixElement>(null);

  const displacementScale = animation ? mapRange(animation.scale, 1, 100, 20, 100) : 0;
  const animationDuration = animation ? mapRange(animation.speed, 1, 100, 1000, 50) : 1;
  const overlayLayerStyle: CSSVarStyle = {
    "--shadow-overlay-inset": `${-displacementScale}px`,
    "--shadow-overlay-filter": animationEnabled ? `url(#${id}) blur(2px)` : "none",
  };
  const maskStyle: CSSVarStyle = {
    "--shadow-overlay-color": color,
    "--shadow-overlay-mask-size": sizing === "stretch" ? "100% 100%" : "cover",
  };
  const noiseStyle: CSSVarStyle | undefined = noise
    ? {
        "--shadow-overlay-noise-size": `${noise.scale * 200}px`,
        "--shadow-overlay-noise-opacity": noise.opacity / 2,
      }
    : undefined;

  useEffect(() => {
    if (!feColorMatrixRef.current || !animationEnabled) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      feColorMatrixRef.current.setAttribute("values", "180");
      return undefined;
    }

    const start = performance.now();
    const durationMs = Math.max(1200, (animationDuration / 25) * 1000);
    const frameInterval = 1000 / 20;

    const update = () => {
      const progress = ((performance.now() - start) % durationMs) / durationMs;
      feColorMatrixRef.current?.setAttribute("values", String(progress * 360));
    };

    update();
    const interval = window.setInterval(update, frameInterval);

    return () => {
      window.clearInterval(interval);
    };

  }, [animationEnabled, animationDuration]);

  return (
    <div className={cn("mf-shadow-overlay", className)} style={style}>
      <div className="mf-shadow-overlay__layer" style={overlayLayerStyle}>
        {animationEnabled && animation && (
          <svg aria-hidden="true" className="mf-shadow-overlay__filter">
            <defs>
              <filter id={id}>
                <feTurbulence
                  result="undulation"
                  numOctaves="2"
                  baseFrequency={`${mapRange(animation.scale, 0, 100, 0.001, 0.0005)},${mapRange(
                    animation.scale,
                    0,
                    100,
                    0.004,
                    0.002,
                  )}`}
                  seed="0"
                  type="turbulence"
                />
                <feColorMatrix ref={feColorMatrixRef} in="undulation" type="hueRotate" values="180" />
                <feColorMatrix
                  in="dist"
                  result="circulation"
                  type="matrix"
                  values="4 0 0 0 1  4 0 0 0 1  4 0 0 0 1  1 0 0 0 0"
                />
                <feDisplacementMap in="SourceGraphic" in2="circulation" scale={displacementScale} result="dist" />
                <feDisplacementMap in="dist" in2="undulation" scale={displacementScale} result="output" />
              </filter>
            </defs>
          </svg>
        )}
        <div className="mf-shadow-overlay__mask" style={maskStyle} />
      </div>

      {showTitle && !children && (
        <div className="mf-shadow-overlay__center">
          <h1 className="mf-shadow-overlay__title">
            Etheral Shadows
          </h1>
        </div>
      )}

      {children}

      {noise && noise.opacity > 0 && (
        <div className="mf-shadow-overlay__noise" style={noiseStyle} />
      )}
    </div>
  );
}
