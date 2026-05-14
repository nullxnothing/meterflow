import { useEffect, useRef } from "react";

const vertexShaderSource = `
  attribute vec4 aVertexPosition;

  void main() {
    gl_Position = aVertexPosition;
  }
`;

const fragmentShaderSource = `
  precision highp float;

  uniform vec2 iResolution;
  uniform float iTime;
  uniform vec3 uBgA;
  uniform vec3 uBgB;
  uniform vec3 uLine;
  uniform vec3 uGrid;

  const float overallSpeed = 0.14;
  const float gridSmoothWidth = 0.015;
  const float axisWidth = 0.05;
  const float majorLineWidth = 0.025;
  const float minorLineWidth = 0.0125;
  const float majorLineFrequency = 5.0;
  const float minorLineFrequency = 1.0;
  const float scale = 5.0;
  const float minLineWidth = 0.01;
  const float maxLineWidth = 0.16;
  const float lineSpeed = 1.0 * overallSpeed;
  const float lineAmplitude = 0.82;
  const float lineFrequency = 0.2;
  const float warpSpeed = 0.2 * overallSpeed;
  const float warpFrequency = 0.5;
  const float warpAmplitude = 0.72;
  const float offsetFrequency = 0.5;
  const float offsetSpeed = 1.33 * overallSpeed;
  const float minOffsetSpread = 0.6;
  const float maxOffsetSpread = 2.0;
  const int linesPerGroup = 12;

  float drawCircle(vec2 pos, float radius, vec2 coord) {
    return smoothstep(radius + gridSmoothWidth, radius, length(coord - pos));
  }

  float drawSmoothLine(float pos, float halfWidth, float t) {
    return smoothstep(halfWidth, 0.0, abs(pos - t));
  }

  float drawCrispLine(float pos, float halfWidth, float t) {
    return smoothstep(halfWidth + gridSmoothWidth, halfWidth, abs(pos - t));
  }

  float drawPeriodicLine(float freq, float width, float t) {
    return drawCrispLine(freq / 2.0, width, abs(mod(t, freq) - freq / 2.0));
  }

  float drawGridLines(float axis) {
    return drawCrispLine(0.0, axisWidth, axis)
      + drawPeriodicLine(majorLineFrequency, majorLineWidth, axis)
      + drawPeriodicLine(minorLineFrequency, minorLineWidth, axis);
  }

  float drawGrid(vec2 space) {
    return min(1.0, drawGridLines(space.x) + drawGridLines(space.y));
  }

  float random(float t) {
    return (cos(t) + cos(t * 1.3 + 1.3) + cos(t * 1.4 + 1.4)) / 3.0;
  }

  float getPlasmaY(float x, float horizontalFade, float offset) {
    return random(x * lineFrequency + iTime * lineSpeed) * horizontalFade * lineAmplitude + offset;
  }

  void main() {
    vec2 fragCoord = gl_FragCoord.xy;
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec2 space = (fragCoord - iResolution.xy / 2.0) / iResolution.x * 2.0 * scale;

    float horizontalFade = 1.0 - (cos(uv.x * 6.28) * 0.5 + 0.5);
    float verticalFade = 1.0 - (cos(uv.y * 6.28) * 0.5 + 0.5);

    space.y += random(space.x * warpFrequency + iTime * warpSpeed) * warpAmplitude * (0.5 + horizontalFade);
    space.x += random(space.y * warpFrequency + iTime * warpSpeed + 2.0) * warpAmplitude * horizontalFade;

    vec4 lines = vec4(0.0);

    for (int l = 0; l < linesPerGroup; l++) {
      float normalizedLineIndex = float(l) / float(linesPerGroup);
      float offsetTime = iTime * offsetSpeed;
      float offsetPosition = float(l) + space.x * offsetFrequency;
      float rand = random(offsetPosition + offsetTime) * 0.5 + 0.5;
      float halfWidth = mix(minLineWidth, maxLineWidth, rand * horizontalFade) / 2.0;
      float offset = random(offsetPosition + offsetTime * (1.0 + normalizedLineIndex)) * mix(minOffsetSpread, maxOffsetSpread, horizontalFade);
      float linePosition = getPlasmaY(space.x, horizontalFade, offset);
      float line = drawSmoothLine(linePosition, halfWidth, space.y) / 2.0 + drawCrispLine(linePosition, halfWidth * 0.15, space.y);

      float circleX = mod(float(l) + iTime * lineSpeed, 25.0) - 12.0;
      vec2 circlePosition = vec2(circleX, getPlasmaY(circleX, horizontalFade, offset));
      float circle = drawCircle(circlePosition, 0.01, space) * 3.0;

      lines += (line + circle) * vec4(uLine, 1.0) * rand;
    }

    vec4 fragColor = vec4(mix(uBgA, uBgB, uv.x), 1.0);
    fragColor.rgb *= verticalFade;
    fragColor.rgb += uGrid * drawGrid(space) * 0.055;
    fragColor += lines * 0.9;

    gl_FragColor = fragColor;
  }
`;

type Rgb = [number, number, number];

function readRgbToken(name: string, fallback: Rgb): Rgb {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return fallback;
  return [parts[0] / 255, parts[1] / 255, parts[2] / 255];
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

function createProgram(gl: WebGLRenderingContext) {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  if (!vertexShader || !fragmentShader) {
    if (vertexShader) gl.deleteShader(vertexShader);
    if (fragmentShader) gl.deleteShader(fragmentShader);
    return null;
  }

  const program = gl.createProgram();
  if (!program) {
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    return null;
  }

  return { program, vertexShader, fragmentShader };
}

export function ShaderCardBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      premultipliedAlpha: true,
      stencil: false,
    });
    if (!gl) return;

    const shader = createProgram(gl);
    const positionBuffer = gl.createBuffer();
    if (!shader || !positionBuffer) {
      if (shader) {
        gl.deleteProgram(shader.program);
        gl.deleteShader(shader.vertexShader);
        gl.deleteShader(shader.fragmentShader);
      }
      if (positionBuffer) gl.deleteBuffer(positionBuffer);
      return;
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    const vertexPosition = gl.getAttribLocation(shader.program, "aVertexPosition");
    const resolution = gl.getUniformLocation(shader.program, "iResolution");
    const time = gl.getUniformLocation(shader.program, "iTime");
    const bgA = gl.getUniformLocation(shader.program, "uBgA");
    const bgB = gl.getUniformLocation(shader.program, "uBgB");
    const line = gl.getUniformLocation(shader.program, "uLine");
    const grid = gl.getUniformLocation(shader.program, "uGrid");
    const motionMedia = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (vertexPosition < 0 || !resolution || !time || !bgA || !bgB || !line || !grid) {
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(shader.program);
      gl.deleteShader(shader.vertexShader);
      gl.deleteShader(shader.fragmentShader);
      return;
    }

    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const width = Math.max(1, Math.floor(rect.width * dpr));
      const height = Math.max(1, Math.floor(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(canvas);
    resizeCanvas();

    const bgAColor = readRgbToken("--bg-rgb", [3 / 255, 6 / 255, 9 / 255]);
    const bgBColor = readRgbToken("--surface-2-rgb", [16 / 255, 26 / 255, 37 / 255]);
    const lineColor = readRgbToken("--accent-2-rgb", [183 / 255, 221 / 255, 255 / 255]);
    const gridColor = readRgbToken("--accent-rgb", [120 / 255, 191 / 255, 255 / 255]);

    let frameId = 0;
    let running = true;
    let visible = false;
    let reducedMotion = motionMedia.matches;
    let lastRender = 0;
    const startTime = performance.now();

    const drawFrame = (now = performance.now()) => {
      if (!running) return;

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(shader.program);

      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, reducedMotion ? 1.4 : (now - startTime) / 1000);
      gl.uniform3f(bgA, bgAColor[0], bgAColor[1], bgAColor[2]);
      gl.uniform3f(bgB, bgBColor[0], bgBColor[1], bgBColor[2]);
      gl.uniform3f(line, lineColor[0], lineColor[1], lineColor[2]);
      gl.uniform3f(grid, gridColor[0], gridColor[1], gridColor[2]);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.vertexAttribPointer(vertexPosition, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(vertexPosition);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const shouldAnimate = () => visible && !reducedMotion && document.visibilityState === "visible";

    const render = (now = performance.now()) => {
      if (!running) return;

      if (reducedMotion || now - lastRender >= 1000 / 30) {
        lastRender = now;
        drawFrame(now);
      }

      if (shouldAnimate()) frameId = requestAnimationFrame(render);
    };

    const requestRender = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(render);
    };

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) {
          requestRender();
        } else {
          cancelAnimationFrame(frameId);
        }
      },
      { rootMargin: "160px 0px", threshold: 0 },
    );

    const onMotionChange = () => {
      reducedMotion = motionMedia.matches;
      requestRender();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible" && visible) requestRender();
      else cancelAnimationFrame(frameId);
    };

    motionMedia.addEventListener("change", onMotionChange);
    document.addEventListener("visibilitychange", onVisibilityChange);
    intersectionObserver.observe(canvas);
    drawFrame();

    return () => {
      running = false;
      cancelAnimationFrame(frameId);
      intersectionObserver.disconnect();
      motionMedia.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      observer.disconnect();
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(shader.program);
      gl.deleteShader(shader.vertexShader);
      gl.deleteShader(shader.fragmentShader);
    };
  }, []);

  return <canvas className="mf-card-shader" ref={canvasRef} aria-hidden="true" />;
}
