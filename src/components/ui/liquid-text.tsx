"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import type { CSSProperties, FC } from "react";

import { cn } from "@/lib/utils";

const morphTime = 1.5;
const cooldownTime = 0.5;

type CSSVarStyle = CSSProperties & Record<`--${string}`, string | number>;

const useMorphingText = (texts: string[]) => {
  const textIndexRef = useRef(0);
  const morphRef = useRef(0);
  const cooldownRef = useRef(0);
  const timeRef = useRef(0);
  const reducedMotionRef = useRef(false);
  const text1Ref = useRef<HTMLSpanElement>(null);
  const text2Ref = useRef<HTMLSpanElement>(null);
  const scrollingRef = useRef(false);

  const safeTexts = texts.length > 0 ? texts : [""];

  const setStyles = useCallback(
    (fraction: number) => {
      const current1 = text1Ref.current;
      const current2 = text2Ref.current;
      if (!current1 || !current2) return;

      current1.textContent = safeTexts[textIndexRef.current % safeTexts.length];
      current2.textContent = safeTexts[(textIndexRef.current + 1) % safeTexts.length];

      if (reducedMotionRef.current || safeTexts.length <= 1) {
        current2.style.filter = "none";
        current2.style.opacity = "100%";
        current1.style.filter = "none";
        current1.style.opacity = "0%";
        return;
      }

      const safeFraction = Math.max(fraction, 0.001);
      const invertedFraction = Math.max(1 - fraction, 0.001);

      current2.style.filter = `blur(${Math.min(7 / safeFraction - 7, 80)}px)`;
      current2.style.opacity = `${Math.pow(fraction, 0.4) * 100}%`;
      current1.style.filter = `blur(${Math.min(7 / invertedFraction - 7, 80)}px)`;
      current1.style.opacity = `${Math.pow(1 - fraction, 0.4) * 100}%`;
    },
    [safeTexts],
  );

  const doMorph = useCallback(() => {
    morphRef.current -= cooldownRef.current;
    cooldownRef.current = 0;

    let fraction = morphRef.current / morphTime;

    if (fraction > 1) {
      cooldownRef.current = cooldownTime;
      fraction = 1;
    }

    setStyles(fraction);

    if (fraction === 1) {
      textIndexRef.current += 1;
    }
  }, [setStyles]);

  const doCooldown = useCallback(() => {
    morphRef.current = 0;
    const current1 = text1Ref.current;
    const current2 = text2Ref.current;

    if (current1 && current2) {
      current2.style.filter = "none";
      current2.style.opacity = "100%";
      current1.style.filter = "none";
      current1.style.opacity = "0%";
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    reducedMotionRef.current = media.matches;

    setStyles(1);

    let animationFrameId = 0;
    let running = false;

    const stop = () => {
      running = false;
      cancelAnimationFrame(animationFrameId);
    };

    const animate = (now: number) => {
      if (!running) return;

      if (document.visibilityState !== "visible") {
        stop();
        return;
      }

      const dt = timeRef.current ? (now - timeRef.current) / 1000 : 0;
      timeRef.current = now;
      cooldownRef.current -= dt;

      if (cooldownRef.current <= 0) doMorph();
      else doCooldown();

      animationFrameId = requestAnimationFrame(animate);
    };

    const start = () => {
      if (running || scrollingRef.current || reducedMotionRef.current || safeTexts.length <= 1 || document.visibilityState !== "visible") {
        doCooldown();
        return;
      }

      running = true;
      timeRef.current = performance.now();
      animationFrameId = requestAnimationFrame(animate);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") start();
      else stop();
    };

    let scrollTimeout = 0;
    const onScroll = () => {
      scrollingRef.current = true;
      stop();
      doCooldown();
      window.clearTimeout(scrollTimeout);
      scrollTimeout = window.setTimeout(() => {
        scrollingRef.current = false;
        start();
      }, 180);
    };

    const syncMotion = () => {
      reducedMotionRef.current = media.matches;
      if (media.matches) {
        stop();
        doCooldown();
      } else {
        start();
      }
    };

    start();
    media.addEventListener("change", syncMotion);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      stop();
      window.clearTimeout(scrollTimeout);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      media.removeEventListener("change", syncMotion);
    };
  }, [doCooldown, doMorph, safeTexts.length, setStyles]);

  return { text1Ref, text2Ref };
};

interface MorphingTextProps {
  className?: string;
  texts: string[];
}

const Texts: FC<Pick<MorphingTextProps, "texts">> = ({ texts }) => {
  const { text1Ref, text2Ref } = useMorphingText(texts);

  return (
    <>
      <span className="mf-morphing-text__word" ref={text1Ref} />
      <span className="mf-morphing-text__word" ref={text2Ref} />
    </>
  );
};

const SvgFilters: FC<{ id: string }> = ({ id }) => (
  <svg className="mf-morphing-text__filters" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <filter id={id}>
        <feColorMatrix
          in="SourceGraphic"
          type="matrix"
          values="1 0 0 0 0
                  0 1 0 0 0
                  0 0 1 0 0
                  0 0 0 255 -140"
        />
      </filter>
    </defs>
  </svg>
);

const MorphingText: FC<MorphingTextProps> = ({ texts, className }) => {
  const filterId = `threshold-${useId().replace(/:/g, "")}`;
  const style: CSSVarStyle = {
    "--morph-filter": `url(#${filterId}) blur(0.6px)`,
  };

  return (
    <span className={cn("mf-morphing-text", className)} style={style} aria-live="polite">
      <Texts texts={texts} />
      <SvgFilters id={filterId} />
    </span>
  );
};

export { MorphingText };
