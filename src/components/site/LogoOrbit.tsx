import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const PRIMARY_MODEL_URL = "/assets/brand/meterflow-logo-3d-styled.glb";
const TARGET_MODEL_URL = "/assets/brand/meterflow-logo-3d-target.glb";

type DragState = {
  active: boolean;
  lastX: number;
  lastY: number;
  velocityX: number;
  velocityY: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as THREE.Mesh).isMesh === true;
}

function colorFromToken(token: string, fallback: [number, number, number]) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(token).trim();

  if (raw.startsWith("#")) {
    const normalized = raw.slice(1);
    const value = Number.parseInt(normalized.length === 3
      ? normalized.split("").map((part) => part + part).join("")
      : normalized, 16);
    return new THREE.Color(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
  }

  const parts = raw.split(",").map((part) => Number.parseFloat(part.trim()));
  if (parts.length >= 3 && parts.every((part) => Number.isFinite(part))) {
    return new THREE.Color(parts[0] / 255, parts[1] / 255, parts[2] / 255);
  }

  return new THREE.Color(fallback[0] / 255, fallback[1] / 255, fallback[2] / 255);
}

function styledMaterial(sourceName: string) {
  const name = sourceName.toLowerCase();
  if (name.includes("edge") || name.includes("blue")) {
    return blueGlassMaterial();
  }

  if (name.includes("deep") || name.includes("side")) {
    return deepSideMaterial();
  }

  return pearlFaceMaterial();
}

function pearlFaceMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: colorFromToken("--text-strong", [244, 247, 251]),
    emissive: colorFromToken("--accent-2", [183, 221, 255]),
    emissiveIntensity: 0.105,
    metalness: 0.14,
    roughness: 0.22,
    clearcoat: 0.9,
    clearcoatRoughness: 0.14,
    sheen: 0.18,
    sheenColor: colorFromToken("--accent-2", [183, 221, 255]),
  });
}

function blueGlassMaterial(opacity = 1) {
  return new THREE.MeshPhysicalMaterial({
    color: colorFromToken("--accent", [120, 191, 255]),
    emissive: colorFromToken("--accent-deep", [47, 111, 174]),
    emissiveIntensity: 0.38,
    metalness: 0.24,
    roughness: 0.16,
    clearcoat: 0.78,
    clearcoatRoughness: 0.14,
    transparent: opacity < 0.995,
    opacity,
  });
}

function deepSideMaterial(opacity = 1) {
  return new THREE.MeshPhysicalMaterial({
    color: colorFromToken("--surface", [11, 17, 24]),
    emissive: colorFromToken("--sky-deep", [32, 63, 102]),
    emissiveIntensity: 0.2,
    metalness: 0.34,
    roughness: 0.34,
    clearcoat: 0.48,
    clearcoatRoughness: 0.24,
    transparent: opacity < 0.995,
    opacity,
  });
}

function assignStyledMaterials(model: THREE.Object3D, materialStore: Set<THREE.Material>, options?: { layeredTarget?: boolean }) {
  const targetMeshes: THREE.Mesh[] = [];

  model.traverse((object) => {
    if (!isMesh(object)) return;
    object.castShadow = false;
    object.receiveShadow = false;
    object.geometry.computeVertexNormals();

    const assign = (material: THREE.Material) => {
      const next = styledMaterial(material.name || "pearl");
      next.transparent = true;
      next.opacity = 1;
      next.depthWrite = true;
      materialStore.add(next);
      return next;
    };

    object.material = Array.isArray(object.material) ? object.material.map(assign) : assign(object.material);
    if (options?.layeredTarget) targetMeshes.push(object);
  });

  targetMeshes.forEach((mesh) => {
    const parent = mesh.parent;
    if (!parent) return;

    const blueEdge = mesh.clone(false);
    const blueMaterial = blueGlassMaterial(0.72);
    blueEdge.name = `${mesh.name || "x402"}_blue_edge`;
    blueEdge.material = blueMaterial;
    blueEdge.geometry = mesh.geometry;
    blueEdge.position.z += 0.018;
    blueEdge.scale.multiplyScalar(1.018);
    blueEdge.renderOrder = -1;
    materialStore.add(blueMaterial);

    const deepSide = mesh.clone(false);
    const sideMaterial = deepSideMaterial(0.86);
    deepSide.name = `${mesh.name || "x402"}_deep_side`;
    deepSide.material = sideMaterial;
    deepSide.geometry = mesh.geometry;
    deepSide.position.z -= 0.026;
    deepSide.position.y -= 0.01;
    deepSide.scale.multiplyScalar(1.01);
    deepSide.renderOrder = -2;
    materialStore.add(sideMaterial);

    parent.add(deepSide);
    parent.add(blueEdge);
  });
}

function centerAndScale(model: THREE.Object3D, targetSize: number) {
  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  model.position.sub(center);
  const scale = targetSize / Math.max(size.x, size.y, size.z);
  model.scale.setScalar(scale);
  return scale;
}

function setModelOpacity(model: THREE.Object3D | null, opacity: number) {
  if (!model) return;
  model.visible = opacity > 0.01;
  model.traverse((object) => {
    if (!isMesh(object)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      material.opacity = opacity;
      material.transparent = opacity < 0.995;
      material.depthWrite = opacity > 0.72;
    });
  });
}

export function LogoOrbit() {
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState>({ active: false, lastX: 0, lastY: 0, velocityX: 0, velocityY: 0 });
  const [inView, setInView] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true);
      },
      { rootMargin: "220px 0px", threshold: 0.01 },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return undefined;
    const host = hostRef.current;
    if (!host) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0, 8);

    const rig = new THREE.Group();
    rig.rotation.set(-0.12, -0.44, 0.08);
    scene.add(rig);

    const ambient = new THREE.HemisphereLight(0xdbe6f3, 0x030609, 2.0);
    scene.add(ambient);

    const key = new THREE.DirectionalLight(0xf4f7fb, 4.2);
    key.position.set(-2.6, 3.4, 5.2);
    scene.add(key);

    const rim = new THREE.PointLight(0x78bfff, 18, 12);
    rim.position.set(3.2, -2.6, 2.2);
    scene.add(rim);

    const lowGlow = new THREE.PointLight(0x22ddb1, 3.8, 10);
    lowGlow.position.set(-3.4, -2.2, -2.0);
    scene.add(lowGlow);

    const morphGlow = new THREE.PointLight(0xb7ddff, 0, 9);
    morphGlow.position.set(0, -1.2, 1.4);
    scene.add(morphGlow);

    const loader = new GLTFLoader();
    const materials = new Set<THREE.Material>();
    let primaryModel: THREE.Object3D | null = null;
    let targetModel: THREE.Object3D | null = null;
    let disposed = false;

    const loadModel = (url: string, targetSize: number, onLoad: (model: THREE.Object3D) => void, options?: { layeredTarget?: boolean }) => {
      loader.load(
        url,
        (gltf) => {
          if (disposed) return;
          const model = gltf.scene;
          assignStyledMaterials(model, materials, options);
          model.userData.baseScale = centerAndScale(model, targetSize);
          onLoad(model);
          rig.add(model);
        },
        undefined,
        () => setFailed(true),
      );
    };

    loadModel(PRIMARY_MODEL_URL, 4.2, (model) => {
        if (disposed) return;
        primaryModel = model;
      });

    loadModel(TARGET_MODEL_URL, 4.2, (model) => {
      if (disposed) return;
      targetModel = model;
      targetModel.rotation.y = -Math.PI * 0.10;
      setModelOpacity(targetModel, 0);
    }, { layeredTarget: true });

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    const targetRotation = new THREE.Vector2(rig.rotation.x, rig.rotation.y);
    const hostStyles = getComputedStyle(host);
    const pointerDown = (event: PointerEvent) => {
      dragRef.current.active = true;
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
      dragRef.current.velocityX = 0;
      dragRef.current.velocityY = 0;
      renderer.domElement.setPointerCapture(event.pointerId);
    };

    const pointerMove = (event: PointerEvent) => {
      if (!dragRef.current.active) return;
      const dx = event.clientX - dragRef.current.lastX;
      const dy = event.clientY - dragRef.current.lastY;
      dragRef.current.lastX = event.clientX;
      dragRef.current.lastY = event.clientY;
      dragRef.current.velocityX = dx * 0.012;
      dragRef.current.velocityY = dy * 0.010;
      targetRotation.y += dragRef.current.velocityX;
      targetRotation.x = clamp(targetRotation.x + dragRef.current.velocityY, -0.86, 0.86);
    };

    const pointerUp = (event: PointerEvent) => {
      dragRef.current.active = false;
      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }
    };

    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", pointerUp);

    let raf = 0;
    let rendering = false;
    let last = performance.now();
    const tick = (now: number) => {
      if (!rendering) {
        raf = 0;
        return;
      }

      const delta = Math.min(0.035, (now - last) / 1000);
      last = now;
      const scrollTurn = Number.parseFloat(hostStyles.getPropertyValue("--mf-logo-scroll-turn")) || 0;
      const morph = clamp(Number.parseFloat(hostStyles.getPropertyValue("--mf-logo-morph")) || 0, 0, 1);
      const scrollRotationY = scrollTurn * Math.PI * 2;
      const targetReveal = smoothstep(0.10, 0.78, morph);
      const primaryFade = smoothstep(0.28, 0.92, morph);
      const overlapGlow = Math.sin(smoothstep(0.08, 0.90, morph) * Math.PI);

      setModelOpacity(primaryModel, 1 - primaryFade);
      setModelOpacity(targetModel, targetReveal);

      if (primaryModel) {
        primaryModel.scale.setScalar(primaryModel.userData.baseScale * (1 - primaryFade * 0.12));
        primaryModel.rotation.z = primaryFade * 0.045;
      }
      if (targetModel) {
        targetModel.scale.setScalar(targetModel.userData.baseScale * (0.96 + targetReveal * 0.08));
        targetModel.rotation.y = -Math.PI * 0.10 * (1 - targetReveal);
        targetModel.rotation.z = -0.035 * (1 - targetReveal);
      }

      morphGlow.intensity = overlapGlow * 10;
      morphGlow.distance = 8 + overlapGlow * 3;

      if (!reducedMotion) {
        if (!dragRef.current.active) {
          const idleSpin = scrollTurn > 0.01 || morph > 0.01 ? 0 : 0.18;
          targetRotation.y += (idleSpin + Math.abs(dragRef.current.velocityX) * 1.8) * delta;
          targetRotation.x += dragRef.current.velocityY * delta;
          dragRef.current.velocityX *= 0.92;
          dragRef.current.velocityY *= 0.90;
        }

        rig.rotation.x += (targetRotation.x - rig.rotation.x) * 0.12;
        rig.rotation.y += (targetRotation.y + scrollRotationY - rig.rotation.y) * 0.12;
        rig.rotation.z = Math.sin(now * 0.00045) * 0.045;
      } else {
        rig.rotation.y = scrollRotationY;
      }

      renderer.render(scene, camera);
      raf = window.requestAnimationFrame(tick);
    };

    const startRendering = () => {
      if (rendering) return;
      rendering = true;
      last = performance.now();
      raf = window.requestAnimationFrame(tick);
    };

    const stopRendering = () => {
      rendering = false;
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    let hostVisible = typeof IntersectionObserver === "undefined";

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopRendering();
        return;
      }
      if (hostVisible) startRendering();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    const renderObserver = typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver(
        ([entry]) => {
          hostVisible = Boolean(entry?.isIntersecting);
          if (hostVisible && !document.hidden) {
            startRendering();
          } else if (!dragRef.current.active) {
            stopRendering();
          }
        },
        { rootMargin: "120px 0px", threshold: 0 },
      );

    if (renderObserver) {
      renderObserver.observe(host);
    } else {
      hostVisible = true;
      if (!document.hidden) startRendering();
    }

    return () => {
      disposed = true;
      stopRendering();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      renderObserver?.disconnect();
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", pointerUp);
      host.removeChild(renderer.domElement);
      materials.forEach((material) => material.dispose());
      primaryModel?.traverse((object) => {
        if (isMesh(object)) object.geometry.dispose();
      });
      targetModel?.traverse((object) => {
        if (isMesh(object)) object.geometry.dispose();
      });
      renderer.dispose();
    };
  }, [inView]);

  return (
    <div className="mf-logo-orbit" ref={hostRef}>
      {failed && <img src="/assets/brand/meterflow-mark.svg" alt="" className="mf-logo-orbit__fallback" />}
    </div>
  );
}
