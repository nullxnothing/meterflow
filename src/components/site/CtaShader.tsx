import { useEffect, useRef, useState } from "react";

const VERT = `
attribute vec2 a_position;
varying vec2 vUv;
void main() {
  vUv = (a_position + 1.0) * 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
uniform float u_time;
uniform float u_intensity;
uniform vec3 u_color1;
uniform vec3 u_color2;
uniform vec2 u_resolution;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;

  float noise = sin(uv.x * 20.0 + u_time) * cos(uv.y * 15.0 + u_time * 0.8);
  noise += sin(uv.x * 35.0 - u_time * 2.0) * cos(uv.y * 25.0 + u_time * 1.2) * 0.5;

  vec3 color = mix(u_color1, u_color2, noise * 0.5 + 0.5);
  color = mix(color, vec3(1.0), pow(abs(noise), 2.0) * u_intensity);

  vec2 aspect = vec2(u_resolution.x / u_resolution.y, 1.0);
  vec2 centered = (uv - 0.5) * aspect;
  float glow = 1.0 - length(centered) * 1.4;
  glow = pow(max(glow, 0.0), 2.2);

  gl_FragColor = vec4(color * glow, glow * 0.85);
}
`;

type Props = {
  color1?: string;
  color2?: string;
  className?: string;
  fps?: number;
};

function colorTokenToRgb(value: string): [number, number, number] {
  const raw = value.startsWith("var(")
    ? getComputedStyle(document.documentElement).getPropertyValue(value.slice(4, -1)).trim()
    : value;
  const [r = 120, g = 191, b = 255] = raw.split(",").map((part) => Number(part.trim()));
  return [r / 255, g / 255, b / 255];
}

export function CtaShader({ color1 = "var(--green-rgb)", color2 = "var(--accent-rgb)", className, fps = 18 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mm = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mm.matches);
    sync();
    mm.addEventListener("change", sync);
    return () => mm.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => setInView(e.isIntersecting)),
      { threshold: 0.08, rootMargin: "0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    if (!gl) return;

    const compile = (src: string, type: number) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(VERT, gl.VERTEX_SHADER);
    const fs = compile(FRAG, gl.FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const aPos = gl.getAttribLocation(prog, "a_position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(prog, "u_time");
    const uIntensity = gl.getUniformLocation(prog, "u_intensity");
    const uColor1 = gl.getUniformLocation(prog, "u_color1");
    const uColor2 = gl.getUniformLocation(prog, "u_color2");
    const uRes = gl.getUniformLocation(prog, "u_resolution");
    gl.uniform3fv(uColor1, colorTokenToRgb(color1));
    gl.uniform3fv(uColor2, colorTokenToRgb(color2));

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
        gl.uniform2f(uRes, w, h);
      }
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let timeoutId = 0;
    const t0 = performance.now();
    const frameInterval = 1000 / Math.max(1, fps);
    const draw = (t: number) => {
      gl.uniform1f(uTime, t);
      gl.uniform1f(uIntensity, 1.0 + Math.sin(t * 2.0) * 0.3);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    if (reduced) {
      draw(0);
    } else if (fps <= 0) {
      draw(0.8);
    } else {
      const tick = () => {
        draw((performance.now() - t0) / 1000);
        timeoutId = window.setTimeout(tick, frameInterval);
      };
      tick();
    }

    return () => {
      window.clearTimeout(timeoutId);
      ro.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [inView, reduced, color1, color2, fps]);

  return (
    <div ref={wrapRef} className={`mf-cta-shader${className ? ` ${className}` : ""}`} aria-hidden>
      <canvas ref={canvasRef} className="mf-cta-shader__canvas" />
    </div>
  );
}
