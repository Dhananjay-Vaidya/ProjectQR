"use client";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { RendererHandle, RendererProps } from "./types";
import { THEME_LABEL, THEMES, type ThemeName } from "@/lib/living/themes";
import { generateLivingTree, type LivingTree, type Vec3 } from "@/lib/living/treeGen";
import { verifiedLivingScan, type VerifiedLivingScan } from "@/lib/living/verifiedScan";
import {
  isFinder,
  resolveLeafTints,
  scanModuleIsB,
  type LeafPaletteName,
} from "@/lib/living/scanColors";
import {
  clamp01,
  ease,
  leafOvershoot,
  leafProgress,
  LIVING_REVEAL_SECONDS,
  REVEAL_CAMERA_DONE,
  REVEAL_FINDER_FOLD,
  REVEAL_TRUNK_DOWN,
} from "@/lib/living/timeline";
import { livingMaterial, rainGeometry, slabGeometry, tuftGeometry, woodGeometry } from "@/lib/living/geometry";
import { birdWingGeometry } from "@/lib/city/cityMeshes";
import { detectQuality } from "@/lib/renderQuality";
import { usePrefersReducedMotion, useSceneActive } from "@/lib/hooks";
import { QUIET_ZONE_MODULES, type QRModel } from "@/types/qr";
import { domainRng, buildGenerativeSeed } from "@/lib/generativeSeed";

const RAIN_MAX = 400;
interface RotationControl {
  current: number;
  target: number;
  velocity: number;
  zoom: number;
  targetZoom: number;
  savedZoom: number;
  dragging: boolean;
  lastX: number;
  startX: number;
  pointers: Map<number, { x: number; y: number }>;
  pinchDistance: number;
  saved: number;
  idle: number;
  moved: boolean;
}

export interface LivingTreeQRProps extends RendererProps {
  view: "experience" | "scan";
  theme: ThemeName;
  buildNonce: number;
  hero?: boolean;
  onToggleView?: () => void;
  onWebglError?: (message: string) => void;
  leafPalette?: LeafPaletteName;
  customLeafColors?: [string, string, string];
  customTrunk?: string;
  /** Verification harness only: freeze the reversible clock at a chosen phase. */
  inspectProgress?: number;
  inspectFlat?: boolean;
}

const LivingTreeQR = forwardRef<RendererHandle, LivingTreeQRProps>(function LivingTreeQR(
  {
    model,
    sizePx,
    view,
    theme,
    buildNonce,
    hero = false,
    onToggleView,
    onReady,
    onWebglError,
    inspectProgress,
    inspectFlat = true,
    studioPreview = false,
    leafPalette = "theme",
    customLeafColors = ["#B9F07A", "#7ED957", "#4EA83A"],
    customTrunk = "#5C3A27",
  },
  ref,
) {
  const quality = useMemo(() => detectQuality(), []);
  const active = useSceneActive<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const [settled, setSettled] = useState(view === "scan");
  const [dragging, setDragging] = useState(false);
  const [didDrag, setDidDrag] = useState(false);
  const rotation = useRef<RotationControl>({
    current: 0,
    target: 0,
    velocity: 0,
    zoom: 1,
    targetZoom: 1,
    savedZoom: 1,
    dragging: false,
    lastX: 0,
    startX: 0,
    pointers: new Map(),
    pinchDistance: 0,
    saved: 0,
    idle: 0,
    moved: false,
  });

  const tints = useMemo<[string, string, string] | undefined>(
    () => (leafPalette === "theme" ? undefined : resolveLeafTints(theme, leafPalette, customLeafColors)),
    [leafPalette, theme, customLeafColors],
  );

  const result = useMemo(() => {
    try {
      return {
        scan: verifiedLivingScan(model, theme, Math.max(sizePx, 360), 1, tints),
        error: null as string | null,
      };
    } catch (error) {
      return { scan: null, error: error instanceof Error ? error.message : "Scan verification failed." };
    }
  }, [model, theme, sizePx, tints]);

  const tree = useMemo(() => generateLivingTree(model, quality.tier), [model, quality.tier]);

  useImperativeHandle(
    ref,
    () => ({
      canExport: () => !!result.scan,
      exportImage: async () => {
        if (!result.scan) throw new Error(result.error ?? "Scan verification failed.");
        return verifiedLivingScan(model, theme, Math.max(sizePx, 360), 1, tints).image;
      },
    }),
    [model, theme, sizePx, tints, result],
  );

  return (
    <div
      ref={active.ref}
      data-living-tree
      data-leaves={tree.leaves.length}
      data-slots={tree.slotsPerModule}
      data-fallback={result.scan?.fallback}
      onPointerDown={(event) => {
        if (view === "scan") return;
        const rot = rotation.current;
        rot.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (rot.pointers.size === 2) {
          const pts = [...rot.pointers.values()];
          rot.pinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          rot.dragging = false;
          setDragging(false);
          return;
        }
        rot.dragging = true;
        rot.lastX = event.clientX;
        rot.startX = event.clientX;
        rot.velocity = 0;
        rot.idle = 0;
        rot.moved = false;
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDragging(true);
      }}
      onPointerMove={(event) => {
        const rot = rotation.current;
        const point = rot.pointers.get(event.pointerId);
        if (point) {
          point.x = event.clientX;
          point.y = event.clientY;
        }
        if (rot.pointers.size === 2 && view !== "scan") {
          const pts = [...rot.pointers.values()];
          const next = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
          if (rot.pinchDistance > 0) {
            rot.targetZoom = THREE.MathUtils.clamp(rot.targetZoom * (next / rot.pinchDistance), 0.75, 1.8);
            rot.savedZoom = rot.targetZoom;
          }
          rot.pinchDistance = next;
          if (!didDrag) setDidDrag(true);
          return;
        }
        if (!rot.dragging || view === "scan") return;
        const dx = event.clientX - rot.lastX;
        rot.lastX = event.clientX;
        rot.target += dx * 0.012;
        rot.velocity = dx * 0.0012;
        rot.saved = rot.target;
        if (Math.abs(event.clientX - rot.startX) > 4) {
          rot.moved = true;
          if (!didDrag) setDidDrag(true);
        }
      }}
      onPointerUp={(event) => {
        const rot = rotation.current;
        const wasClick = !rot.moved;
        rot.pointers.delete(event.pointerId);
        rot.pinchDistance = 0;
        rot.dragging = false;
        setDragging(false);
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        if (wasClick && onToggleView) onToggleView();
      }}
      onPointerCancel={() => {
        rotation.current.dragging = false;
        rotation.current.pointers.clear();
        rotation.current.pinchDistance = 0;
        setDragging(false);
      }}
      onWheel={(event) => {
        if (view === "scan") return;
        event.preventDefault();
        const rot = rotation.current;
        rot.targetZoom = THREE.MathUtils.clamp(rot.targetZoom * Math.exp(-event.deltaY * 0.0012), 0.75, 1.8);
        rot.savedZoom = rot.targetZoom;
        rot.idle = 0;
      }}
      style={{
        width: "100%",
        height: "100%",
        minHeight: studioPreview ? 0 : sizePx,
        position: "relative",
        cursor: view === "scan" ? (onToggleView ? "pointer" : "default") : dragging ? "grabbing" : "grab",
        touchAction: "pan-y pinch-zoom",
      }}
    >
      {result.scan ? (
        <>
          <Canvas
            orthographic
            dpr={hero ? [1, Math.min(1.5, quality.dpr[1])] : quality.dpr}
            frameloop="always"
            gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
            camera={{ position: [40, 32, 40], near: 0.1, far: 400 }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0);
              gl.toneMapping = THREE.NoToneMapping;
              onReady?.();
            }}
            onError={() => onWebglError?.("3D rendering is unavailable. Standard QR mode has been enabled.")}
            style={{ touchAction: "pan-y pinch-zoom" }}
            aria-label={`Living tree, ${tree.leaves.length} leaves, ${view} view`}
          >
            <hemisphereLight args={[0xffffff, 0xdccfbf, 1.15]} />
            <directionalLight position={[6, 12, 4]} intensity={1.25} />
            <LivingScene
              key={quality.tier}
              model={model}
              tree={tree}
              scan={result.scan}
              theme={theme}
              tints={tints}
              customLeafColors={customLeafColors}
              customTrunk={customTrunk}
              leafPalette={leafPalette}
              mobile={quality.tier === "low"}
              qualityTier={quality.tier}
              view={view}
              buildNonce={buildNonce}
              active={active.active}
              reduced={reduced}
              rotation={rotation}
              onSettled={setSettled}
              inspectProgress={inspectProgress}
              inspectFlat={inspectFlat}
            />
          </Canvas>
          {!didDrag && view === "experience" ? <span className="diorama-rotate-hint" aria-hidden="true">↻ Drag to rotate · Scroll to zoom</span> : null}
          {result.scan.fallback !== "none" && (!studioPreview || view === "scan") ? (
            <span role="status" style={{ position: "absolute", bottom: 8, left: 0, right: 0, textAlign: "center", fontSize: 12 }}>
              {THEME_LABEL[theme]}: high-contrast scan colours ({result.scan.fallback}).
            </span>
          ) : null}
          <span className="sr-only" role="status">
            {settled ? "QR code revealed." : "Tree shown."}
          </span>
        </>
      ) : (
        <p role="alert">{result.error}</p>
      )}
    </div>
  );
});

export default LivingTreeQR;

interface SceneProps {
  model: QRModel;
  tree: LivingTree;
  scan: VerifiedLivingScan;
  theme: ThemeName;
  tints?: [string, string, string];
  customLeafColors: [string, string, string];
  customTrunk: string;
  leafPalette: LeafPaletteName;
  mobile: boolean;
  qualityTier: "low" | "medium" | "high";
  view: "experience" | "scan";
  buildNonce: number;
  active: boolean;
  reduced: boolean;
  rotation: RefObject<RotationControl>;
  onSettled: (value: boolean) => void;
  inspectProgress?: number;
  inspectFlat: boolean;
}

interface Falling {
  leaf: number;
  x: number;
  y: number;
  z: number;
  baseX: number;
  baseZ: number;
  phaseX: number;
  phaseZ: number;
  spinA: number;
  spinB: number;
  rateA: number;
  rateB: number;
  landed: boolean;
  bounceT: number;
  landX: number;
  landZ: number;
  snapX: number;
  snapZ: number;
  yaw: number;
  tint: number;
}

const ISO_DIR = new THREE.Vector3(1, 0.8, 1).normalize();
const TAU = Math.PI * 2;

function lowSaturation(hex: string, factor: number): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s * factor, hsl.l);
  return c;
}

function LivingScene({
  model,
  tree,
  scan,
  theme,
  tints,
  customTrunk,
  leafPalette,
  mobile,
  qualityTier,
  view,
  buildNonce,
  active,
  reduced,
  rotation,
  onSettled,
  inspectProgress,
  inspectFlat,
}: SceneProps) {
  const { camera, size } = useThree();
  const gl = useThree((s) => s.gl);

  const leaves = useRef<THREE.InstancedMesh>(null);
  const tiles = useRef<THREE.InstancedMesh>(null);
  const grass = useRef<THREE.InstancedMesh>(null);
  const fallen = useRef<THREE.InstancedMesh>(null);
  const rain = useRef<THREE.InstancedMesh>(null);
  const perchBirds = useRef<THREE.InstancedMesh>(null);
  const birdBodies = useRef<THREE.InstancedMesh>(null);
  const butterflies = useRef<THREE.InstancedMesh>(null);
  const butterflyBodies = useRef<THREE.InstancedMesh>(null);
  const worldGroup = useRef<THREE.Group>(null);
  const wood = useRef<THREE.Mesh>(null);
  const slab = useRef<THREE.Mesh>(null);
  const ground = useRef<THREE.Mesh>(null);
  const flat = useRef<THREE.Group>(null);
  const art = useRef<THREE.Group>(null);

  const progress = useRef(view === "scan" ? 1 : 0);
  const build = useRef(reduced ? 1 : 0);
  const regen = useRef(1);
  const time = useRef(0);
  const settled = useRef(view === "scan");
  const rainOpacity = useRef(THEMES[theme].rain ? 0.45 : 0);
  const previousView = useRef(view);
  const flatUniform = useMemo(() => ({ value: 0 }), []);

  const rng = useMemo(() => domainRng(buildGenerativeSeed(model.encodedUrl), "motionSeed"), [model.encodedUrl]);
  const side = model.size + QUIET_ZONE_MODULES * 2;

  const makeFallState = () => ({
    falling: [] as Falling[],
    detached: new Set<number>(),
    rest: tree.fallen
      .slice(0, THEMES[theme].fallenBase)
      .map((f) => ({ position: [...f.position] as Vec3, yaw: f.yaw, tint: f.tint })),
    cursor: 0,
    detachTimer: 60 / Math.max(1, THEMES[theme].leafFall),
    gustTimer: 20 + Math.random() * 20,
    gustUntil: 0,
  });
  const fallState = useRef(makeFallState());
  const fallingByLeaf = useMemo(() => new Map<number, Falling>(), []);

  // Live-regeneration morph: remember the previous canopy's resting positions so
  // new leaves grow from 0 while carried-over leaves lerp to their new home.
  const prevLeaf = useRef<{ pos: Float32Array; len: number }>({ pos: new Float32Array(0), len: 0 });
  const treeRef = useRef(tree);
  useEffect(() => {
    if (treeRef.current === tree) return;
    const old = treeRef.current;
    const pos = new Float32Array(old.leaves.length * 3);
    for (let i = 0; i < old.leaves.length; i++) {
      pos[i * 3] = old.leaves[i].position[0];
      pos[i * 3 + 1] = old.leaves[i].position[1];
      pos[i * 3 + 2] = old.leaves[i].position[2];
    }
    prevLeaf.current = { pos, len: old.leaves.length };
    treeRef.current = tree;
    fallState.current = makeFallState();
    fallingByLeaf.clear();
    regen.current = reduced ? 1 : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, reduced]);

  const resources = useMemo(() => {
    const leaf = new THREE.PlaneGeometry(1, 1);
    const tile = new THREE.BoxGeometry(1, 1, 1);
    const plate = new THREE.PlaneGeometry(side, side);
    const lm = livingMaterial(flatUniform);
    const tm = livingMaterial(flatUniform);
    const gm = livingMaterial(flatUniform);
    const fm = livingMaterial(flatUniform);
    const base = livingMaterial(flatUniform);
    const wm = new THREE.MeshLambertMaterial({ vertexColors: true, toneMapped: false });
    const sm = new THREE.MeshLambertMaterial({ color: "#CFC7B9", transparent: true, toneMapped: false });
    const rm = new THREE.MeshBasicMaterial({
      color: "#B9B2A6",
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const birdMat = new THREE.MeshBasicMaterial({ color: "#23273A", side: THREE.DoubleSide, toneMapped: false });
    const butterflyMat = new THREE.MeshBasicMaterial({ color: "#F2B866", side: THREE.DoubleSide, toneMapped: false });
    return { leaf, tile, plate, lm, tm, gm, fm, base, wm, sm, rm, birdMat, butterflyMat, wood: woodGeometry(tree), slab: slabGeometry(side), tuft: tuftGeometry(), rain: rainGeometry(), bird: birdWingGeometry() };
  }, [tree, side, flatUniform]);

  const birdCount = qualityTier === "low" ? 1 : qualityTier === "medium" ? 2 : 3;
  const butterflyCount = qualityTier === "low" ? 2 : qualityTier === "medium" ? 5 : 8;
  const perch = useMemo(() => {
    const r = domainRng(buildGenerativeSeed(model.encodedUrl), "particleSeed");
    const tips = tree.branches.filter((b) => b.primary).map((b) => b.to as Vec3);
    for (let i = tips.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [tips[i], tips[j]] = [tips[j], tips[i]];
    }
    return tips.slice(0, birdCount).map((p) => ({
      pos: p,
      dir: [r() * 2 - 1, 0.6 + r() * 0.6, r() * 2 - 1] as Vec3,
      turnAt: 8 + r() * 7,
      phase: r() * TAU,
    }));
  }, [tree, model.encodedUrl, birdCount]);
  const birdState = useRef({ clock: 0, wasRevealed: view === "scan", returnClock: -1, turns: perch.map((p) => p.turnAt) });
  useEffect(() => {
    birdState.current = { clock: 0, wasRevealed: false, returnClock: -1, turns: perch.map((p) => p.turnAt) };
  }, [perch]);
  const butterflyData = useMemo(() => {
    const r = domainRng(buildGenerativeSeed(model.encodedUrl), "colorSeed");
    return Array.from({ length: butterflyCount }, (_, i) => ({
      radius: tree.canopyRadius * (0.28 + r() * 0.34),
      height: tree.height * (0.2 + r() * 0.55),
      speed: 0.08 + r() * 0.08,
      phase: (i / butterflyCount) * TAU + r() * 0.6,
      bob: 0.25 + r() * 0.45,
      tint: r(),
    }));
  }, [model.encodedUrl, butterflyCount, tree.canopyRadius, tree.height]);

  // Target colours (theme + custom palette). Frame loop lerps toward these.
  const target = useMemo(() => {
    const lt = tints ?? THEMES[theme].leaves;
    return {
      leaf: lt.map((c) => new THREE.Color(c)) as THREE.Color[],
      grass: THEMES[theme].grass.map((c) => new THREE.Color(c)) as THREE.Color[],
      pink: new THREE.Color("#F7A8CF"),
      darkA: new THREE.Color(scan.colors.darkA),
      darkB: new THREE.Color(scan.colors.darkB),
      finder: new THREE.Color(scan.colors.finder),
      scanLight: new THREE.Color(scan.colors.light),
      tileLight: new THREE.Color("#F2ECE0"),
      tileData: new THREE.Color("#DED6C7"),
      tileFinder: lowSaturation(THEMES[theme].grass[1], 0.6),
      fallen: new THREE.Color(lt[2]),
      trunk: new THREE.Color(leafPalette === "custom" ? customTrunk : THEMES[theme].wood),
      lockLight: new THREE.Color("#F7F3EA"),
    };
  }, [theme, tints, scan, leafPalette, customTrunk]);

  const cur = useRef({
    leaf: [new THREE.Color(), new THREE.Color(), new THREE.Color()],
    grass: [new THREE.Color(), new THREE.Color()],
    fallen: new THREE.Color(),
    trunk: new THREE.Color(),
    tileFinder: new THREE.Color(),
    ready: false,
  });
  if (!cur.current.ready) {
    cur.current.leaf.forEach((c, i) => c.copy(target.leaf[i]));
    cur.current.grass.forEach((c, i) => c.copy(target.grass[i]));
    cur.current.fallen.copy(target.fallen);
    cur.current.trunk.copy(target.trunk);
    cur.current.tileFinder.copy(target.tileFinder);
    cur.current.ready = true;
  }

  const scratch = useMemo(
    () => ({
      d: new THREE.Object3D(),
      color: new THREE.Color(),
      q: new THREE.Quaternion(),
      end: new THREE.Quaternion(),
      e: new THREE.Euler(),
      dir: new THREE.Vector3(),
      look: new THREE.Vector3(),
      up: new THREE.Vector3(0, 1, 0),
    }),
    [],
  );

  const rainField = useMemo(() => {
    const r = domainRng(buildGenerativeSeed(model.encodedUrl), "particleSeed");
    const x = new Float32Array(RAIN_MAX);
    const y = new Float32Array(RAIN_MAX);
    const z = new Float32Array(RAIN_MAX);
    const spread = side * 1.4;
    for (let i = 0; i < RAIN_MAX; i++) {
      x[i] = (r() - 0.5) * spread;
      z[i] = (r() - 0.5) * spread;
      y[i] = r() * (tree.height + 4);
    }
    return { x, y, z, top: tree.height + 4 };
  }, [model.encodedUrl, side, tree.height]);

  const flatRender = useMemo(() => {
    const base = new THREE.InstancedMesh(resources.tile, resources.tm, model.size ** 2);
    const data = new THREE.InstancedMesh(resources.leaf, resources.lm, tree.dataModuleCount);
    const d = new THREE.Object3D();
    for (let r = 0; r < model.size; r++) {
      for (let c = 0; c < model.size; c++) {
        const dark = model.dark[r][c];
        const isData = dark && !model.protected[r][c];
        const h = isData ? 0.005 : 0.02;
        d.position.set(c + 0.5 - model.size / 2, h / 2, r + 0.5 - model.size / 2);
        d.rotation.set(0, 0, 0);
        d.scale.set(1, h, 1);
        d.updateMatrix();
        base.setMatrixAt(r * model.size + c, d.matrix);
        // Data modules read dark via their tile leaf; the ground beneath is light.
        base.setColorAt(
          r * model.size + c,
          dark && !isData
            ? isFinder(model.size, r, c)
              ? target.finder
              : target.darkA
            : target.lockLight,
        );
      }
    }
    let index = 0;
    for (const l of tree.leaves) {
      if (!l.tile) continue;
      d.position.set(l.col + 0.5 - model.size / 2, 0.02, l.row + 0.5 - model.size / 2);
      d.rotation.set(-Math.PI / 2, 0, l.yaw);
      d.scale.setScalar(1);
      d.updateMatrix();
      data.setMatrixAt(index, d.matrix);
      data.setColorAt(index++, scanModuleIsB(model, l.row, l.col) ? target.darkB : target.darkA);
    }
    base.frustumCulled = false;
    data.frustumCulled = false;
    return { base, data };
  }, [resources, model, tree, target]);

  useEffect(
    () => () => Object.values(resources).forEach((r) => (r as { dispose(): void }).dispose()),
    [resources],
  );
  useEffect(() => () => {
    flatRender.base.dispose();
    flatRender.data.dispose();
  }, [flatRender]);
  useEffect(() => {
    build.current = reduced ? 1 : 0;
  }, [buildNonce, reduced]);

  useEffect(() => {
    for (const [mesh, count] of [
      [leaves.current, tree.leaves.length],
      [tiles.current, model.size ** 2],
      [grass.current, tree.grass.length],
      [fallen.current, 90],
      [rain.current, RAIN_MAX],
      [perchBirds.current, 10],
      [birdBodies.current, birdCount],
      [butterflies.current, Math.max(2, butterflyCount * 2)],
      [butterflyBodies.current, butterflyCount],
    ] as const) {
      if (!mesh) continue;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
  }, [tree, model.size, butterflyCount, birdCount]);

  useEffect(() => {
    const reset = () => {
      rotation.current.current = 0;
      rotation.current.target = 0;
      rotation.current.saved = 0;
      rotation.current.velocity = 0;
      rotation.current.zoom = 1;
      rotation.current.targetZoom = 1;
      rotation.current.savedZoom = 1;
      rotation.current.idle = 0;
    };
    window.addEventListener("linkforge:reset-living-view", reset);
    return () => window.removeEventListener("linkforge:reset-living-view", reset);
  }, [rotation]);

  useFrame((_, deltaRaw) => {
    if (!active && inspectProgress === undefined) return;
    const delta = Math.min(deltaRaw, 0.05);
    const { d, color, q, end, e, dir, look, up } = scratch;

    const wanted = view === "scan" ? 1 : 0;
    if (previousView.current !== view) {
      if (view === "scan") {
        rotation.current.saved = rotation.current.target;
        rotation.current.savedZoom = rotation.current.targetZoom;
      }
      previousView.current = view;
    }

    const p =
      inspectProgress === undefined
        ? reduced
          ? wanted
          : THREE.MathUtils.clamp(
              progress.current + Math.sign(wanted - progress.current) * (delta / LIVING_REVEAL_SECONDS),
              Math.min(progress.current, wanted),
              Math.max(progress.current, wanted),
            )
        : clamp01(inspectProgress);
    progress.current = p;

    const seconds = p * LIVING_REVEAL_SECONDS;
    const finish = ease((seconds - 0.6) / 0.15);
    const camMix = ease(clamp01(seconds / REVEAL_CAMERA_DONE));
    flatUniform.value = finish;

    if (settled.current !== (p === 1)) {
      settled.current = p === 1;
      onSettled(p === 1);
    }
    gl.domElement.dataset.reveal = p.toFixed(4);
    const rot = rotation.current;
    if (p < 0.001 && !rot.dragging && !reduced) {
      rot.idle += delta;
      if (rot.idle > 5) rot.velocity += delta * 0.002;
    }
    if (!rot.dragging) {
      rot.target += rot.velocity;
      rot.velocity *= 0.92;
    }
    const targetRotation = view === "scan" ? 0 : rot.saved;
    const targetZoom = view === "scan" ? 1 : rot.savedZoom;
    const rotationMix = view === "scan" ? ease(clamp01(p / 0.35)) : ease(1 - clamp01(p / 0.35));
    if (view === "scan") rot.target = THREE.MathUtils.lerp(rot.target, 0, rotationMix * 0.18);
    else if (p > 0.001) rot.target = THREE.MathUtils.lerp(0, targetRotation, rotationMix);
    if (view === "scan") rot.targetZoom = THREE.MathUtils.lerp(rot.targetZoom, 1, ease(clamp01(p / 0.45)) * 0.22);
    else if (p > 0.001) rot.targetZoom = THREE.MathUtils.lerp(1, targetZoom, ease(1 - clamp01(p / 0.45)));
    rot.current = THREE.MathUtils.lerp(rot.current, rot.target, reduced ? 1 : 0.18);
    rot.zoom = THREE.MathUtils.lerp(rot.zoom, rot.targetZoom, reduced ? 1 : 0.18);
    if (worldGroup.current) worldGroup.current.rotation.y = p > 0.985 ? 0 : rot.current;

    const preview = inspectProgress !== undefined;
    build.current = preview ? 1 : Math.min(1, build.current + delta / 1.5);
    regen.current = preview ? 1 : Math.min(1, regen.current + delta / 0.35);
    const growth = ease(build.current);
    const regenE = ease(regen.current);
    if (p === 0 && !reduced) time.current += delta;

    /* ---- fixed isometric camera → axis-aligned top-down by 0.60 ---- */
    const cam = camera as THREE.OrthographicCamera;
    const aspect = size.width / Math.max(1, size.height);
    const narrow = size.width < 620;
    const fillV = narrow ? 0.84 : 0.78;
    const needV = tree.height * 0.66 + side * 0.42;
    const needH = side * 1.34;
    const expHalf = Math.max(needV / 2 / fillV, needH / 2 / fillV / aspect);
    const scanHalf = (side / 2 / 0.92) * Math.max(1, 1 / aspect);
    const half = THREE.MathUtils.lerp(expHalf, scanHalf, camMix);
    cam.top = half;
    cam.bottom = -half;
    cam.right = half * aspect;
    cam.left = -half * aspect;
    cam.zoom = p > 0.985 ? 1 : rot.zoom;
    cam.updateProjectionMatrix();

    dir.copy(ISO_DIR).lerp(up.set(0, 1, 0), camMix).normalize();
    look.set(0, THREE.MathUtils.lerp(tree.height * 0.3, 0, camMix), 0);
    cam.position.copy(dir).multiplyScalar(140).add(look);
    cam.up.set(0, Math.cos((camMix * Math.PI) / 2), -Math.sin((camMix * Math.PI) / 2));
    cam.lookAt(look);

    const atEnd = p === 1 && (inspectProgress === undefined || inspectFlat);
    if (flat.current) flat.current.visible = atEnd;
    if (art.current) art.current.visible = !atEnd;

    /* ---- colour transitions (theme 500ms / palette 400ms → one 0.45s lerp) ---- */
    const cLerp = Math.min(1, delta / 0.45);
    cur.current.leaf.forEach((c, i) => c.lerp(target.leaf[i], cLerp));
    cur.current.grass.forEach((c, i) => c.lerp(target.grass[i], cLerp));
    cur.current.fallen.lerp(target.fallen, cLerp);
    cur.current.trunk.lerp(target.trunk, cLerp);
    resources.wm.color.copy(cur.current.trunk);
    cur.current.tileFinder.lerp(target.tileFinder, cLerp);

    /* ---- trunk + branches: scale-y → 0 into the platform by 0.30 ---- */
    if (wood.current) {
      const regenSettle = 0.6 + 0.4 * regenE;
      wood.current.scale.y = growth * regenSettle * (1 - clamp01(seconds / REVEAL_TRUNK_DOWN) ** 2);
      wood.current.visible = seconds < REVEAL_TRUNK_DOWN;
    }
    if (slab.current) {
      resources.sm.opacity = 1 - finish;
      slab.current.visible = finish < 1;
    }
    resources.base.color.copy(target.tileLight).lerp(target.lockLight, finish);

    /* ---- rain (Ember): 9 modules/s, respawns above canopy, pauses in Scan ---- */
    if (rain.current) {
      const rainCount = THEMES[theme].rain ? (mobile ? THEMES[theme].rain!.mobile : THEMES[theme].rain!.desktop) : 0;
      rain.current.count = rainCount;
      const rainActive = rainCount > 0 && p < 0.02 && !reduced;
      rainOpacity.current = THREE.MathUtils.lerp(rainOpacity.current, rainActive ? 0.45 : 0, Math.min(1, delta / 0.5));
      resources.rm.opacity = rainOpacity.current;
      rain.current.visible = rainOpacity.current > 0.01;
      for (let i = 0; i < rainCount; i++) {
        if (rainActive) {
          rainField.y[i] -= 9 * delta;
          if (rainField.y[i] < -0.2) rainField.y[i] = rainField.top + rng() * 3;
        }
        d.position.set(rainField.x[i], rainField.y[i], rainField.z[i]);
        d.rotation.set(0, 0, 0);
        d.scale.set(1, 1, 1);
        d.updateMatrix();
        rain.current.setMatrixAt(i, d.matrix);
      }
      rain.current.instanceMatrix.needsUpdate = true;
    }

    /* ---- perched birds: take off on reveal, glide back on return ---- */
    if (perchBirds.current) {
      const bs = birdState.current;
      bs.clock += delta;
      if (bs.wasRevealed && p < 0.98) {
        bs.returnClock = 0;
        bs.wasRevealed = false;
      }
      if (!bs.wasRevealed && p > 0.98) {
        bs.wasRevealed = true;
        bs.returnClock = -1;
      }
      if (bs.returnClock >= 0) bs.returnClock += delta;
      const flapFast = reduced ? 0 : Math.sin(bs.clock * TAU * 4);
      for (let i = 0; i < perch.length; i++) {
        const pc = perch[i];
        const loop = ((bs.clock + i * 4.7) % 18) / 18;
        const orbit = loop * TAU + pc.phase;
        const flyX = Math.cos(orbit) * tree.canopyRadius * 0.9;
        const flyZ = Math.sin(orbit) * tree.canopyRadius * 0.9;
        const flyY = tree.height * (0.62 + 0.12 * Math.sin(orbit * 2));
        let bx = flyX;
        let by = flyY;
        let bz = flyZ;
        let sc = 1;
        let flap = flapFast * 0.75;
        let tilt = 0;
        let yaw = orbit + Math.PI / 2;
        if (reduced) {
          sc = p < 0.5 ? 1 : 0;
        } else if (p > 0.001 && bs.returnClock < 0) {
          const to = clamp01((seconds - i * 0.04) / 0.4);
          bx = THREE.MathUtils.lerp(bx, bx + pc.dir[0] * 7, to);
          by = THREE.MathUtils.lerp(by, by + pc.dir[1] * 7, to);
          bz = THREE.MathUtils.lerp(bz, bz + pc.dir[2] * 7, to);
          sc = 1 - to;
          flap = flapFast * 0.9;
        } else if (bs.returnClock >= 0) {
          const rt = clamp01((bs.returnClock - 1.5 - i * 0.3) / 0.4);
          if (rt <= 0) {
            sc = 0;
          } else {
            const ex = pc.pos[0] + pc.dir[0] * 8;
            const ey = pc.pos[1] + 5;
            const ez = pc.pos[2] + pc.dir[2] * 8;
            bx = THREE.MathUtils.lerp(ex, pc.pos[0], ease(rt));
            by = THREE.MathUtils.lerp(ey, pc.pos[1], ease(rt));
            bz = THREE.MathUtils.lerp(ez, pc.pos[2], ease(rt));
            sc = Math.min(1, rt * 2);
            flap = rt < 1 ? flapFast * 0.6 : 0.14;
          }
        } else {
          if (loop > 0.5 && loop < 0.62) {
            const a = ease((loop - 0.5) / 0.12);
            bx = THREE.MathUtils.lerp(flyX, pc.pos[0], a);
            by = THREE.MathUtils.lerp(flyY, pc.pos[1] + 0.12, a);
            bz = THREE.MathUtils.lerp(flyZ, pc.pos[2], a);
            flap = flapFast * (1 - a);
          } else if (loop >= 0.62 && loop < 0.86) {
            bx = pc.pos[0];
            by = pc.pos[1] + 0.12;
            bz = pc.pos[2];
            flap = 0.08;
            tilt = 0.08;
            yaw = pc.phase;
          } else if (loop >= 0.86) {
            const a = ease((loop - 0.86) / 0.14);
            bx = THREE.MathUtils.lerp(pc.pos[0], flyX, a);
            by = THREE.MathUtils.lerp(pc.pos[1] + 0.12, flyY, a);
            bz = THREE.MathUtils.lerp(pc.pos[2], flyZ, a);
            flap = flapFast * a;
          }
        }
        for (let w = 0; w < 2; w++) {
          d.position.set(bx, by, bz);
          d.rotation.set(tilt, yaw + (w ? Math.PI : 0), (w ? -1 : 1) * flap);
          d.scale.setScalar(Math.max(0.0001, sc * 2.1));
          d.updateMatrix();
          perchBirds.current.setMatrixAt(i * 2 + w, d.matrix);
        }
        if (birdBodies.current) {
          d.position.set(bx, by, bz);
          d.rotation.set(tilt, yaw, 0);
          d.scale.set(Math.max(0.0001, sc * 0.34), Math.max(0.0001, sc * 0.2), Math.max(0.0001, sc * 0.2));
          d.updateMatrix();
          birdBodies.current.setMatrixAt(i, d.matrix);
        }
      }
      perchBirds.current.count = perch.length * 2;
      perchBirds.current.instanceMatrix.needsUpdate = true;
      perchBirds.current.visible = growth > 0.4;
      if (birdBodies.current) {
        birdBodies.current.count = perch.length;
        birdBodies.current.instanceMatrix.needsUpdate = true;
        birdBodies.current.visible = growth > 0.4 && p < 0.3;
      }
    }

    if (butterflies.current) {
      butterflies.current.visible = p < 0.3 && growth > 0.45;
      const fade = 1 - ease(clamp01(p / 0.3));
      for (let i = 0; i < butterflyData.length; i++) {
        const b = butterflyData[i];
        const a = time.current * TAU * b.speed + b.phase;
        const x = Math.cos(a) * b.radius + Math.sin(a * 2.1) * 0.7;
        const z = Math.sin(a) * b.radius + Math.cos(a * 1.7) * 0.7;
        const y = b.height + Math.sin(a * 3) * b.bob;
        const heading = -a + Math.PI / 2;
        const flap = reduced ? 0.2 : Math.sin(time.current * TAU * (5 + b.tint * 3) + b.phase) * 0.75;
        for (let w = 0; w < 2; w++) {
          d.position.set(x, y, z);
          d.rotation.set(0, heading + (w ? Math.PI : 0), (w ? -1 : 1) * flap);
          d.scale.setScalar(Math.max(0.0001, fade * 1.15));
          d.updateMatrix();
          butterflies.current.setMatrixAt(i * 2 + w, d.matrix);
          color.set(b.tint < 0.34 ? "#F7F3EA" : b.tint < 0.67 ? THEMES[theme].accent : "#F2B866");
          butterflies.current.setColorAt(i * 2 + w, color);
        }
        if (butterflyBodies.current) {
          d.position.set(x, y, z);
          d.rotation.set(0, heading, 0);
          d.scale.set(Math.max(0.0001, fade * 0.13), Math.max(0.0001, fade * 0.08), Math.max(0.0001, fade * 0.24));
          d.updateMatrix();
          butterflyBodies.current.setMatrixAt(i, d.matrix);
          butterflyBodies.current.setColorAt(i, color.set("#2B2630"));
        }
      }
      butterflies.current.count = butterflyData.length * 2;
      butterflies.current.instanceMatrix.needsUpdate = true;
      if (butterflies.current.instanceColor) butterflies.current.instanceColor.needsUpdate = true;
      if (butterflyBodies.current) {
        butterflyBodies.current.count = butterflyData.length;
        butterflyBodies.current.visible = butterflies.current.visible;
        butterflyBodies.current.instanceMatrix.needsUpdate = true;
        if (butterflyBodies.current.instanceColor) butterflyBodies.current.instanceColor.needsUpdate = true;
      }
    }

    if (atEnd) return;

    /* ---- leaf fall: detach from the outer canopy, tumble, settle flat, stay ---- */
    const fall = fallState.current;
    const REST_CAP = 80;
    const spawnFall = () => {
      let leaf = Math.floor(rng() * tree.leaves.length);
      for (
        let tries = 0;
        tries < 8 && (tree.leaves[leaf].distance < 0.7 || fall.detached.has(leaf) || fallingByLeaf.has(leaf));
        tries++
      ) {
        leaf = Math.floor(rng() * tree.leaves.length);
      }
      if (tree.leaves[leaf].distance < 0.7 || fall.detached.has(leaf) || fallingByLeaf.has(leaf)) return;
      const l = tree.leaves[leaf];
      const f: Falling = {
        leaf,
        x: l.position[0],
        y: l.position[1] * growth,
        z: l.position[2],
        baseX: l.position[0],
        baseZ: l.position[2],
        phaseX: rng() * TAU,
        phaseZ: rng() * TAU,
        spinA: 0,
        spinB: 0,
        rateA: 1 + rng(),
        rateB: 1 + rng(),
        landed: false,
        bounceT: 0,
        landX: 0,
        landZ: 0,
        snapX: 0,
        snapZ: 0,
        yaw: l.yaw,
        tint: l.tint,
      };
      fall.falling.push(f);
      fallingByLeaf.set(leaf, f);
    };

    if (p === 0 && !reduced && !preview && growth === 1 && regen.current === 1 && tree.leaves.length) {
      fall.detachTimer -= delta;
      if (fall.detachTimer <= 0) {
        spawnFall();
        fall.detachTimer = 60 / Math.max(1, THEMES[theme].leafFall);
      }
      fall.gustTimer -= delta;
      if (fall.gustTimer <= 0) {
        fall.gustUntil = time.current + 1.5;
        for (let k = 0; k < 3; k++) spawnFall();
        fall.gustTimer = 20 + rng() * 20;
      }
      const gust = time.current < fall.gustUntil ? 2 : 1;
      for (let i = fall.falling.length - 1; i >= 0; i--) {
        const f = fall.falling[i];
        if (!f.landed) {
          const slow = THREE.MathUtils.clamp((f.y - 0.06) / 0.3, 0.25, 1);
          f.y -= 0.9 * delta * slow;
          f.x = f.baseX + Math.sin(time.current * TAU * 0.5 + f.phaseX) * 0.4 * gust;
          f.z = f.baseZ + Math.sin(time.current * TAU * 0.5 + f.phaseZ) * 0.4 * gust;
          f.spinA += f.rateA * delta;
          f.spinB += f.rateB * delta;
          if (f.y <= 0.06) {
            f.y = 0.06;
            f.landed = true;
            f.bounceT = 0;
            f.landX = f.x;
            f.landZ = f.z;
            let best = -1;
            let bd = Infinity;
            for (let m = 0; m < tree.lightModules.length; m++) {
              const lm = tree.lightModules[m];
              const dd = (lm[0] - f.x) ** 2 + (lm[2] - f.z) ** 2;
              if (dd < bd) {
                bd = dd;
                best = m;
              }
            }
            if (best >= 0 && bd > 0.36) {
              f.snapX = tree.lightModules[best][0];
              f.snapZ = tree.lightModules[best][2];
            } else {
              f.snapX = f.x;
              f.snapZ = f.z;
            }
          }
        } else {
          f.bounceT += delta;
          const k = clamp01(f.bounceT / 0.12);
          f.x = THREE.MathUtils.lerp(f.landX, f.snapX, k);
          f.z = THREE.MathUtils.lerp(f.landZ, f.snapZ, k);
          if (f.bounceT >= 0.12) {
            const slot = fall.rest.length < REST_CAP ? fall.rest.length : fall.cursor++ % REST_CAP;
            fall.rest[slot] = { position: [f.snapX, 0.06, f.snapZ], yaw: f.yaw, tint: f.tint };
            fall.detached.add(f.leaf);
            fallingByLeaf.delete(f.leaf);
            fall.falling.splice(i, 1);
          }
        }
      }
    }

    /* ---- leaves: sway ±1° @ 0.3Hz, then fly to their data module ---- */
    if (leaves.current) {
      const prev = prevLeaf.current;
      for (let i = 0; i < tree.leaves.length; i++) {
        const l = tree.leaves[i];
        const local = leafProgress(seconds, l.distance);
        const a = ease(local);
        const cluster = tree.clusters[l.cluster];
        const sway = reduced ? 0 : Math.sin(time.current * Math.PI * 2 * 0.3 + cluster.phase) * (Math.PI / 180) * (1 - a);

        // Detached (now resting on the ground) — the canopy leaf is gone.
        if (fall.detached.has(i)) {
          d.scale.setScalar(0);
          d.updateMatrix();
          leaves.current.setMatrixAt(i, d.matrix);
          continue;
        }
        // Currently tumbling down.
        const ff = fallingByLeaf.get(i);
        if (ff) {
          d.position.set(ff.x, ff.y, ff.z);
          if (ff.landed) {
            const bs = 1 + 0.25 * Math.sin(clamp01(ff.bounceT / 0.12) * Math.PI);
            d.quaternion.setFromEuler(e.set(-Math.PI / 2, 0, ff.yaw));
            d.scale.setScalar(0.4 * bs);
          } else {
            d.quaternion.setFromEuler(e.set(ff.spinA, l.rotation[1], ff.spinB));
            d.scale.setScalar(0.4);
          }
          d.updateMatrix();
          leaves.current.setMatrixAt(i, d.matrix);
          color.copy(cur.current.leaf[ff.tint]);
          leaves.current.setColorAt(i, color);
          continue;
        }

        let rx = l.position[0];
        let ry = l.position[1];
        let rz = l.position[2];
        let bornScale = 1;
        if (i < prev.len && regenE < 1) {
          rx = THREE.MathUtils.lerp(prev.pos[i * 3], rx, regenE);
          ry = THREE.MathUtils.lerp(prev.pos[i * 3 + 1], ry, regenE);
          rz = THREE.MathUtils.lerp(prev.pos[i * 3 + 2], rz, regenE);
        } else if (i >= prev.len) {
          bornScale = regenE;
        }

        // sway rotates the leaf around its cluster centre in the XY plane
        const dx = rx - cluster.center[0];
        const dy = ry - cluster.center[1];
        const x = cluster.center[0] + dx * Math.cos(sway) - dy * Math.sin(sway);
        const y = cluster.center[1] + dx * Math.sin(sway) + dy * Math.cos(sway);
        const z = rz;

        d.position.set(
          THREE.MathUtils.lerp(x, l.col + 0.5 - model.size / 2, a),
          THREE.MathUtils.lerp(y * growth, 0.02, a) + leafOvershoot(local),
          THREE.MathUtils.lerp(z, l.row + 0.5 - model.size / 2, a),
        );
        q.setFromEuler(e.set(l.rotation[0] + sway, l.rotation[1], l.rotation[2]));
        end.setFromEuler(e.set(-Math.PI / 2, 0, l.yaw));
        d.quaternion.copy(q).slerp(end, a);
        d.scale.setScalar(THREE.MathUtils.lerp(0.4 * growth * bornScale, l.tile ? 1 : 0, a));
        d.updateMatrix();
        leaves.current.setMatrixAt(i, d.matrix);

        const moduleDark = scanModuleIsB(model, l.row, l.col) ? target.darkB : target.darkA;
        color.copy(cur.current.leaf[l.tint]).lerp(moduleDark, a);
        leaves.current.setColorAt(i, color);
      }
      leaves.current.instanceMatrix.needsUpdate = true;
      if (leaves.current.instanceColor) leaves.current.instanceColor.needsUpdate = true;
    }

    /* ---- platform-top QR: low contrast always, resolves during reveal ---- */
    if (tiles.current) {
      const tileMix = ease(clamp01(seconds / 0.6));
      const finderMix = ease(clamp01(seconds / REVEAL_FINDER_FOLD));
      for (let r = 0; r < model.size; r++) {
        for (let c = 0; c < model.size; c++) {
          const dark = model.dark[r][c];
          const finder = dark && isFinder(model.size, r, c);
          const data = dark && !model.protected[r][c];
          const h = THREE.MathUtils.lerp(dark ? 0.14 : 0.08, data ? 0.005 : 0.02, tileMix);
          const w = THREE.MathUtils.lerp(0.96, 1, tileMix);
          d.position.set(c + 0.5 - model.size / 2, h / 2, r + 0.5 - model.size / 2);
          d.rotation.set(0, 0, 0);
          d.scale.set(w, h, w);
          d.updateMatrix();
          tiles.current.setMatrixAt(r * model.size + c, d.matrix);
          if (finder) {
            color.copy(cur.current.tileFinder).lerp(target.finder, finderMix);
          } else if (data) {
            // The descending leaf becomes the dark module; the ground goes light.
            color.copy(target.tileData).lerp(target.lockLight, tileMix);
          } else if (dark) {
            // Timing / alignment / dark module — no leaf covers these.
            color.copy(target.tileData).lerp(target.darkA, tileMix);
          } else {
            color.copy(target.tileLight).lerp(target.lockLight, finish);
          }
          tiles.current.setColorAt(r * model.size + c, color);
        }
      }
      tiles.current.instanceMatrix.needsUpdate = true;
      if (tiles.current.instanceColor) tiles.current.instanceColor.needsUpdate = true;
    }

    /* ---- grass: finder tufts fold (scale-y → 0 by 0.35); outer band fades ---- */
    if (grass.current) {
      const finderFold = 1 - ease(clamp01(seconds / REVEAL_FINDER_FOLD));
      const bandFade = 1 - finish;
      const accentColor = new THREE.Color(THEMES[theme].accent);
      tree.grass.forEach((gcard, i) => {
        const s = growth * regenE * (gcard.finder ? finderFold : bandFade);
        d.position.set(...gcard.position);
        d.rotation.set((1 - s) * (Math.PI / 2), gcard.yaw, 0);
        d.scale.set(1, Math.max(0.0001, s * (gcard.h ?? 1)), 1);
        d.updateMatrix();
        grass.current!.setMatrixAt(i, d.matrix);
        color.copy(cur.current.grass[gcard.tint]);
        if (gcard.pink && theme === "neon") color.lerp(target.pink, 0.6);
        else if (gcard.accent) color.lerp(accentColor, 0.5);
        grass.current!.setColorAt(i, color);
      });
      grass.current.visible = growth > 0;
      grass.current.instanceMatrix.needsUpdate = true;
      if (grass.current.instanceColor) grass.current.instanceColor.needsUpdate = true;
    }

    /* ---- resting fallen leaves ---- */
    if (fallen.current) {
      fallen.current.count = fall.rest.length;
      fall.rest.forEach((f, i) => {
        d.position.set(...f.position);
        d.rotation.set(-Math.PI / 2, 0, f.yaw);
        d.scale.setScalar(0.4 * growth * (1 - ease(clamp01(seconds / 0.2))));
        d.updateMatrix();
        fallen.current!.setMatrixAt(i, d.matrix);
        fallen.current!.setColorAt(i, cur.current.fallen);
      });
      fallen.current.instanceMatrix.needsUpdate = true;
      if (fallen.current.instanceColor) fallen.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      <group ref={worldGroup}>
      <group ref={art}>
        <mesh ref={slab} geometry={resources.slab} material={resources.sm} />
        <mesh ref={ground} geometry={resources.plate} material={resources.base} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} />
        <instancedMesh ref={tiles} args={[resources.tile, resources.tm, model.size ** 2]} frustumCulled={false} />
        <mesh ref={wood} geometry={resources.wood} material={resources.wm} />
        <instancedMesh ref={leaves} args={[resources.leaf, resources.lm, tree.leaves.length]} frustumCulled={false} />
        <instancedMesh ref={grass} args={[resources.tuft, resources.gm, tree.grass.length]} frustumCulled={false} />
        <instancedMesh ref={fallen} args={[resources.leaf, resources.fm, 90]} frustumCulled={false} />
        <instancedMesh ref={rain} args={[resources.rain, resources.rm, RAIN_MAX]} frustumCulled={false} />
        <instancedMesh ref={perchBirds} args={[resources.bird, resources.birdMat, 10]} frustumCulled={false} />
        <instancedMesh ref={birdBodies} args={[undefined, undefined, birdCount]} frustumCulled={false}>
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color="#23273A" toneMapped={false} />
        </instancedMesh>
        <instancedMesh ref={butterflies} args={[resources.bird, resources.butterflyMat, Math.max(2, butterflyCount * 2)]} frustumCulled={false} />
        <instancedMesh ref={butterflyBodies} args={[undefined, undefined, butterflyCount]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial vertexColors toneMapped={false} />
        </instancedMesh>
      </group>
      <group ref={flat} visible={false}>
        <mesh geometry={resources.plate} material={resources.base} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} />
        <primitive object={flatRender.base} />
        <primitive object={flatRender.data} />
      </group>
      </group>
    </group>
  );
}
