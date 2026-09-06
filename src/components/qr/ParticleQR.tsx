"use client";

/**
 * ParticleQR — a cloud of points that assembles into a readable QR.
 *
 * - Points geometry, ~6000 particles by default.
 * - Scattered + assembled positions precomputed into typed arrays; a scalar
 *   progress lerps between them. Targets are never recomputed per frame.
 * - Protected modules get a solid underlay block so scan reliability never
 *   depends on particle coverage.
 * - Export only ever happens from the assembled state, top-down, with quiet zone.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { QRColors, QRModel } from "@/types/qr";
import {
  darkCells,
  framedWorldSize,
  scanOrthoHalfExtent,
} from "@/lib/renderShared";
import { hashString, makeRng } from "@/lib/qr";
import { captureCanvas, type ExportedImage } from "@/lib/export";
import type { RendererHandle, RendererProps } from "@/components/qr/types";
import { usePrefersReducedMotion, useSceneActive } from "@/lib/hooks";
import { THEMES, type ThemeName } from "@/lib/living/themes";

export interface ParticleQRProps extends RendererProps {
  state: "assembled" | "scattered";
  particleCount: number;
  theme?: ThemeName;
  experienceView?: "experience" | "scan";
  onToggleView?: () => void;
  onWebglError?: (message: string) => void;
}

const ParticleQR = forwardRef<RendererHandle, ParticleQRProps>(function ParticleQR(
  {
    model,
    colors,
    sizePx,
    state,
    particleCount,
    theme = "verdant",
    onToggleView,
    onReady,
    onWebglError,
  },
  ref
) {
  const themeObj = THEMES[theme];
  const active = useSceneActive<HTMLDivElement>();
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const assembledRef = useRef<boolean>(state === "assembled");
  const [exportSignal, setExportSignal] = useState(0);
  const exportResolve = useRef<((img: ExportedImage) => void) | null>(null);

  assembledRef.current = state === "assembled";

  const doExport = useCallback((): Promise<ExportedImage> => {
    return new Promise((resolve, reject) => {
      if (!assembledRef.current) {
        reject(
          new Error("Particle QR can only be exported from the assembled state.")
        );
        return;
      }
      exportResolve.current = resolve;
      setExportSignal((n) => n + 1);
    });
  }, []);

  useImperativeHandle(
    ref,
    (): RendererHandle => ({
      canExport: () => assembledRef.current && Boolean(glRef.current),
      exportImage: doExport,
    }),
    [doExport]
  );

  return (
    <div
      ref={active.ref}
      style={{ width: sizePx, height: sizePx, maxWidth: "100%" }}
      role="img"
      aria-label={`Particle 3D QR code for ${model.encodedUrl}, ${
        state === "assembled" ? "assembled" : "scattered"
      }`}
    >
      <Canvas
        dpr={[1, 1.5]}
        frameloop={active.active || state !== "assembled" ? "always" : "demand"}
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
        orthographic
        camera={{ position: [0, 40, 0], zoom: 10, near: 0.1, far: 400 }}
        style={{ touchAction: "pan-y", cursor: onToggleView ? "pointer" : "default" }}
        onCreated={({ gl, scene }) => {
          glRef.current = gl;
          gl.setClearColor(new THREE.Color("#000000"), 0);
          scene.background = null;
          onReady?.();
        }}
        onError={() =>
          onWebglError?.(
            "3D rendering is unavailable on this device. Standard QR mode has been enabled."
          )
        }
        onPointerMissed={onToggleView}
      >
        <ParticleScene
          model={model}
          colors={colors}
          state={state}
          particleCount={particleCount}
          slabColor={themeObj.slab}
          exportSignal={exportSignal}
          onExported={() => {
            const gl = glRef.current;
            if (gl && exportResolve.current) {
              exportResolve.current(captureCanvas(gl.domElement));
              exportResolve.current = null;
            }
          }}
        />
      </Canvas>
    </div>
  );
});

export default ParticleQR;

/* -------------------------------------------------------------------------- */

interface SceneProps {
  model: QRModel;
  colors: QRColors;
  state: "assembled" | "scattered";
  particleCount: number;
  slabColor: string;
  exportSignal: number;
  onExported: () => void;
}

function ParticleScene({
  model,
  colors,
  state,
  particleCount,
  slabColor,
  exportSignal,
  onExported,
}: SceneProps) {
  const { gl, scene, camera, size } = useThree();
  const pointsRef = useRef<THREE.Points | null>(null);
  const underlayRef = useRef<THREE.InstancedMesh | null>(null);
  const progressRef = useRef<number>(state === "assembled" ? 1 : 0);
  const reducedMotion = usePrefersReducedMotion();

  const cells = useMemo(() => darkCells(model), [model]);
  const protectedCells = useMemo(
    () => cells.filter((c) => c.protected),
    [cells]
  );
  const worldSize = useMemo(() => framedWorldSize(model), [model]);
  const halfExtent = useMemo(() => scanOrthoHalfExtent(model), [model]);

  const bgColor = useMemo(
    () => new THREE.Color(colors.background),
    [colors.background]
  );
  const fgColor = useMemo(
    () => new THREE.Color(colors.foreground),
    [colors.foreground]
  );

  const count = useMemo(() => {
    const clamped = Math.max(1500, Math.min(9000, Math.round(particleCount)));
    return clamped;
  }, [particleCount]);

  // Precompute per-particle scatter + target + control (arc) point + a
  // deterministic delay and speed. All in typed arrays, once per model/count.
  // The scatter positions occupy a real 3D volume; assembly eases each particle
  // along a quadratic Bézier (scatter -> control -> target) so paths arc.
  const { targets, scatter, control, colorsBuf, delay, speed } = useMemo(() => {
    const targets = new Float32Array(count * 3);
    const scatter = new Float32Array(count * 3);
    const control = new Float32Array(count * 3);
    const colorsBuf = new Float32Array(count * 3);
    const delay = new Float32Array(count);
    const speed = new Float32Array(count);
    const rng = makeRng(hashString(model.encodedUrl + ":particles"));
    const tone = new THREE.Color();
    const violet = new THREE.Color("#8b5cf6");

    const darkList = cells.length > 0 ? cells : [{ x: 0, z: 0 }];

    for (let i = 0; i < count; i++) {
      const cell = darkList[i % darkList.length];
      // Tighter fill (was 0.84) so assembled cells read solid, not speckled.
      const jx = (rng() - 0.5) * 0.66;
      const jz = (rng() - 0.5) * 0.66;
      const tx = cell.x + jx;
      const tz = cell.z + jz;
      targets[i * 3] = tx;
      targets[i * 3 + 1] = 0.05 + rng() * 0.05;
      targets[i * 3 + 2] = tz;

      // Scatter: a real 3D dome/volume above and around the matrix.
      const radius = worldSize * (0.55 + rng() * 0.8);
      const theta = rng() * Math.PI * 2;
      const phi = rng() * Math.PI * 0.55;
      const sx = Math.cos(theta) * Math.sin(phi) * radius;
      const sy = Math.cos(phi) * radius * 0.7 + 2.5;
      const sz = Math.sin(theta) * Math.sin(phi) * radius;
      scatter[i * 3] = sx;
      scatter[i * 3 + 1] = sy;
      scatter[i * 3 + 2] = sz;

      // Control point: midway, pushed outward + upward so the path bows.
      control[i * 3] = (sx + tx) * 0.5 + (rng() - 0.5) * worldSize * 0.3;
      control[i * 3 + 1] =
        (sy + targets[i * 3 + 1]) * 0.5 + worldSize * (0.15 + rng() * 0.25);
      control[i * 3 + 2] = (sz + tz) * 0.5 + (rng() - 0.5) * worldSize * 0.3;

      // Deterministic stagger + per-particle speed.
      delay[i] = rng() * 0.45; // 0..0.45 of the assembly window
      speed[i] = 0.85 + rng() * 0.4;

      // Mostly foreground; a small violet minority for depth.
      if (rng() < 0.08) tone.copy(violet);
      else tone.copy(fgColor);
      colorsBuf[i * 3] = tone.r;
      colorsBuf[i * 3 + 1] = tone.g;
      colorsBuf[i * 3 + 2] = tone.b;
    }
    return { targets, scatter, control, colorsBuf, delay, speed };
  }, [count, cells, model.encodedUrl, worldSize, fgColor]);

  const positions = useMemo(() => {
    const p = new Float32Array(count * 3);
    p.set(scatter);
    return p;
  }, [count, scatter]);

  // Underlay solid blocks for protected modules.
  useEffect(() => {
    const mesh = underlayRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < protectedCells.length; i++) {
      const cell = protectedCells[i];
      dummy.position.set(cell.x, 0.02, cell.z);
      dummy.scale.set(0.98, 0.04, 0.98);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, fgColor);
    }
    mesh.count = protectedCells.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [protectedCells, fgColor]);

  useEffect(() => {
    gl.setClearColor(bgColor, 1);
    scene.background = bgColor;
  }, [gl, scene, bgColor]);

  // Jump immediately when reduced motion is requested.
  useEffect(() => {
    if (reducedMotion) {
      progressRef.current = state === "assembled" ? 1 : 0;
    }
  }, [reducedMotion, state]);

  // Camera: top-down scan framing (Particle preview is always top-down;
  // the interest is in the assembly, not orbiting).
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    const aspect = size.width / Math.max(1, size.height);
    cam.position.set(0, worldSize, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cam.left = -halfExtent * aspect;
    cam.right = halfExtent * aspect;
    cam.top = halfExtent;
    cam.bottom = -halfExtent;
    cam.near = 0.1;
    cam.far = worldSize * 6;
    cam.zoom = 1;
    cam.updateProjectionMatrix();
  }, [camera, worldSize, halfExtent, size.width, size.height]);

  useFrame((_, delta) => {
    const points = pointsRef.current;
    if (!points) return;

    const targetProgress = state === "assembled" ? 1 : 0;
    if (reducedMotion) {
      progressRef.current = targetProgress;
    } else {
      // ~2.4s traversal, leaving headroom for per-particle delay + speed.
      const rate = delta / 2.4;
      if (progressRef.current < targetProgress) {
        progressRef.current = Math.min(targetProgress, progressRef.current + rate);
      } else if (progressRef.current > targetProgress) {
        progressRef.current = Math.max(targetProgress, progressRef.current - rate);
      }
    }

    const g = progressRef.current; // global 0..1
    const arr = points.geometry.attributes.position.array as Float32Array;

    if (g <= 0) {
      arr.set(scatter);
      points.geometry.attributes.position.needsUpdate = true;
      return;
    }
    if (g >= 1) {
      arr.set(targets);
      points.geometry.attributes.position.needsUpdate = true;
      return;
    }

    for (let i = 0; i < count; i++) {
      const d = delay[i];
      // remap the global progress into this particle's own window
      let local = (g - d) / Math.max(0.001, (1 - d) / speed[i]);
      local = local < 0 ? 0 : local > 1 ? 1 : local;
      const t = smoothstep(local);
      const mt = 1 - t;
      const b = i * 3;
      // quadratic Bézier: (1-t)^2*S + 2(1-t)t*C + t^2*T
      const w0 = mt * mt;
      const w1 = 2 * mt * t;
      const w2 = t * t;
      arr[b] = w0 * scatter[b] + w1 * control[b] + w2 * targets[b];
      arr[b + 1] =
        w0 * scatter[b + 1] + w1 * control[b + 1] + w2 * targets[b + 1];
      arr[b + 2] =
        w0 * scatter[b + 2] + w1 * control[b + 2] + w2 * targets[b + 2];
    }
    points.geometry.attributes.position.needsUpdate = true;
  });

  // Deterministic assembled top-down capture.
  useEffect(() => {
    if (exportSignal === 0) return;
    const points = pointsRef.current;
    if (!points) return;

    // Force assembled positions exactly.
    const arr = points.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < count * 3; i++) arr[i] = targets[i];
    points.geometry.attributes.position.needsUpdate = true;
    progressRef.current = 1;

    const EXPORT_PX = 900;
    const prevSize = new THREE.Vector2();
    gl.getSize(prevSize);
    const prevPixelRatio = gl.getPixelRatio();

    const cam = new THREE.OrthographicCamera(
      -halfExtent,
      halfExtent,
      halfExtent,
      -halfExtent,
      0.1,
      worldSize * 6
    );
    cam.position.set(0, worldSize, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();

    gl.setPixelRatio(1);
    gl.setSize(EXPORT_PX, EXPORT_PX, false);
    gl.setClearColor(bgColor, 1);
    gl.render(scene, cam);

    onExported();

    gl.setPixelRatio(prevPixelRatio);
    gl.setSize(prevSize.x, prevSize.y, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportSignal]);

  // World-space point size (attenuated) so it scales identically in the preview
  // and the 900px export. One module is 1 world unit. With ~16 particles/cell
  // and this size the assembled dark cells read solid. Tuned via browser QA
  // (was ~0.08 — far too sparse to read as a QR).
  const pointSize = useMemo(() => {
    const perCell = count / Math.max(1, cells.length);
    return Math.max(0.22, Math.min(0.6, 1.6 / Math.sqrt(perCell)));
  }, [count, cells.length]);

  return (
    <>
      <hemisphereLight args={[0xffffff, 0xd9cfc0, 0.9]} />
      <directionalLight position={[5, 10, 4]} intensity={1.2} />

      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[worldSize, worldSize]} />
        <meshStandardMaterial
          color={state === "assembled" ? bgColor : new THREE.Color(slabColor)}
          roughness={0.95}
          metalness={0}
        />
      </mesh>

      <instancedMesh
        ref={underlayRef}
        args={[undefined, undefined, Math.max(1, protectedCells.length)]}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial vertexColors />
      </instancedMesh>

      <points ref={pointsRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[positions, 3]}
          />
          <bufferAttribute
            attach="attributes-color"
            args={[colorsBuf, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          size={pointSize}
          vertexColors
          sizeAttenuation
          transparent={false}
        />
      </points>
    </>
  );
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}
