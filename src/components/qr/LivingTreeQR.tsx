"use client";
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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
import { detectQuality } from "@/lib/renderQuality";
import { usePrefersReducedMotion, useSceneActive } from "@/lib/hooks";
import { QUIET_ZONE_MODULES, type QRModel } from "@/types/qr";
import { domainRng, buildGenerativeSeed } from "@/lib/generativeSeed";

const RAIN_MAX = 400;

export interface LivingTreeQRProps extends RendererProps {
  view: "experience" | "scan";
  theme: ThemeName;
  buildNonce: number;
  hero?: boolean;
  onToggleView?: () => void;
  onWebglError?: (message: string) => void;
  leafPalette?: LeafPaletteName;
  customLeafColors?: [string, string, string];
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
  },
  ref,
) {
  const quality = useMemo(() => detectQuality(), []);
  const active = useSceneActive<HTMLDivElement>();
  const reduced = usePrefersReducedMotion();
  const [settled, setSettled] = useState(view === "scan");

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

  const tree = useMemo(() => generateLivingTree(model, quality.tier === "low"), [model, quality.tier]);

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
      style={{
        width: "100%",
        height: "100%",
        minHeight: studioPreview ? 0 : sizePx,
        position: "relative",
      }}
    >
      {result.scan ? (
        <>
          <Canvas
            orthographic
            dpr={hero ? [1, Math.min(1.5, quality.dpr[1])] : quality.dpr}
            gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }}
            camera={{ position: [40, 32, 40], near: 0.1, far: 400 }}
            onCreated={({ gl }) => {
              gl.setClearColor(0x000000, 0);
              gl.toneMapping = THREE.NoToneMapping;
              onReady?.();
            }}
            onError={() => onWebglError?.("3D rendering is unavailable. Standard QR mode has been enabled.")}
            style={{ cursor: onToggleView ? "pointer" : "default", touchAction: "pan-y" }}
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
              leafPalette={leafPalette}
              mobile={quality.tier === "low"}
              view={view}
              buildNonce={buildNonce}
              active={active.active}
              reduced={reduced}
              onToggle={onToggleView}
              onSettled={setSettled}
              inspectProgress={inspectProgress}
              inspectFlat={inspectFlat}
            />
          </Canvas>
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
  leafPalette: LeafPaletteName;
  mobile: boolean;
  view: "experience" | "scan";
  buildNonce: number;
  active: boolean;
  reduced: boolean;
  onToggle?: () => void;
  onSettled: (value: boolean) => void;
  inspectProgress?: number;
  inspectFlat: boolean;
}

interface Falling {
  leaf: number;
  target: Vec3;
  age: number;
  slot: number;
}

const ISO_DIR = new THREE.Vector3(1, 0.8, 1).normalize();

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
  mobile,
  view,
  buildNonce,
  active,
  reduced,
  onToggle,
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

  const fallState = useRef<{
    next: number;
    fall: Falling | null;
    rest: { position: Vec3; yaw: number; tint: number }[];
    cursor: number;
    births: Map<number, number>;
  }>({ next: 22, fall: null, rest: tree.fallen.map((f) => ({ position: [...f.position] as Vec3, yaw: f.yaw, tint: f.tint })), cursor: 0, births: new Map() });

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
    fallState.current = {
      next: 22,
      fall: null,
      rest: tree.fallen.map((f) => ({ position: [...f.position] as Vec3, yaw: f.yaw, tint: f.tint })),
      cursor: 0,
      births: new Map(),
    };
    regen.current = reduced ? 1 : 0;
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
    return { leaf, tile, plate, lm, tm, gm, fm, base, wm, sm, rm, wood: woodGeometry(tree), slab: slabGeometry(side), tuft: tuftGeometry(), rain: rainGeometry() };
  }, [tree, side, flatUniform]);

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
      lockLight: new THREE.Color("#F7F3EA"),
    };
  }, [theme, tints, scan]);

  const cur = useRef({
    leaf: [new THREE.Color(), new THREE.Color(), new THREE.Color()],
    grass: [new THREE.Color(), new THREE.Color()],
    fallen: new THREE.Color(),
    tileFinder: new THREE.Color(),
    ready: false,
  });
  if (!cur.current.ready) {
    cur.current.leaf.forEach((c, i) => c.copy(target.leaf[i]));
    cur.current.grass.forEach((c, i) => c.copy(target.grass[i]));
    cur.current.fallen.copy(target.fallen);
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
      [fallen.current, 60],
      [rain.current, RAIN_MAX],
    ] as const) {
      if (!mesh) continue;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(1), 3);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
  }, [tree, model.size]);

  useFrame((_, deltaRaw) => {
    if (!active && inspectProgress === undefined) return;
    const delta = Math.min(deltaRaw, 0.05);
    const { d, color, q, end, e, dir, look, up } = scratch;

    const wanted = view === "scan" ? 1 : 0;
    if (previousView.current !== view) previousView.current = view;

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
    cam.zoom = 1;
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

    if (atEnd) return;

    /* ---- fallen leaves: 2–3 detach per minute, tumble, rest (cap 60) ---- */
    const fall = fallState.current;
    const fallenBase = Math.min(60, THEMES[theme].fallenBase);
    if (fall.rest.length > fallenBase) fall.rest.length = fallenBase;
    while (fall.rest.length < fallenBase && fall.rest.length < tree.fallen.length) {
      const f = tree.fallen[fall.rest.length];
      fall.rest.push({ position: [...f.position] as Vec3, yaw: f.yaw, tint: f.tint });
    }
    if (p === 0 && !reduced && !preview && growth === 1 && regen.current === 1 && tree.fallTargets.length) {
      if (!fall.fall && time.current >= fall.next) {
        const leaf = Math.floor(rng() * tree.leaves.length);
        const t = tree.fallTargets[Math.floor(rng() * tree.fallTargets.length)];
        const slot = fall.rest.length < 60 ? fall.rest.length : fall.cursor++ % 60;
        fall.fall = { leaf, target: [t[0], 0.06, t[2]], age: 0, slot };
        fall.next = time.current + 20 + rng() * 10;
      }
      if (fall.fall) {
        fall.fall.age += delta;
        if (fall.fall.age >= 3) {
          const f = fall.fall;
          fall.rest[f.slot] = { position: f.target, yaw: tree.leaves[f.leaf].yaw, tint: tree.leaves[f.leaf].tint };
          fall.births.set(f.leaf, time.current);
          fall.fall = null;
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
        let x = cluster.center[0] + dx * Math.cos(sway) - dy * Math.sin(sway);
        let y = cluster.center[1] + dx * Math.sin(sway) + dy * Math.cos(sway);
        let z = rz;

        const birth = fall.births.get(i);
        let leafScale = birth === undefined ? 1 : THREE.MathUtils.lerp(clamp01((time.current - birth) / 0.6), 1, ease(seconds / 0.1));
        if (birth !== undefined && time.current - birth >= 0.6) fall.births.delete(i);

        if (fall.fall?.leaf === i) {
          const f = fall.fall;
          const t = clamp01(f.age / 3) * (1 - ease(seconds / 0.1));
          x = THREE.MathUtils.lerp(x, f.target[0], t);
          y = THREE.MathUtils.lerp(y, f.target[1], t);
          z = THREE.MathUtils.lerp(z, f.target[2], t);
          leafScale = 1;
        }

        d.position.set(
          THREE.MathUtils.lerp(x, l.col + 0.5 - model.size / 2, a),
          THREE.MathUtils.lerp(y * growth, 0.02, a) + leafOvershoot(local),
          THREE.MathUtils.lerp(z, l.row + 0.5 - model.size / 2, a),
        );
        q.setFromEuler(e.set(l.rotation[0] + sway, l.rotation[1], l.rotation[2]));
        if (fall.fall?.leaf === i) {
          q.multiply(end.setFromEuler(e.set(fall.fall.age * 2, fall.fall.age, 0)));
        }
        end.setFromEuler(e.set(-Math.PI / 2, 0, l.yaw));
        d.quaternion.copy(q).slerp(end, a);
        d.scale.setScalar(THREE.MathUtils.lerp(0.4 * growth * leafScale * bornScale, l.tile ? 1 : 0, a));
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
      tree.grass.forEach((gcard, i) => {
        const s = growth * regenE * (gcard.finder ? finderFold : bandFade);
        d.position.set(...gcard.position);
        d.rotation.set((1 - s) * (Math.PI / 2), gcard.yaw, 0);
        d.scale.set(1, Math.max(0.0001, s), 1);
        d.updateMatrix();
        grass.current!.setMatrixAt(i, d.matrix);
        color.copy(cur.current.grass[gcard.tint]);
        if (gcard.pink && theme === "neon") color.lerp(target.pink, 0.6);
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
    <group
      onPointerDown={(event) => {
        if (onToggle) {
          event.stopPropagation();
          onToggle();
        }
      }}
    >
      <group ref={art}>
        <mesh ref={slab} geometry={resources.slab} material={resources.sm} />
        <mesh ref={ground} geometry={resources.plate} material={resources.base} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} />
        <instancedMesh ref={tiles} args={[resources.tile, resources.tm, model.size ** 2]} frustumCulled={false} />
        <mesh ref={wood} geometry={resources.wood} material={resources.wm} />
        <instancedMesh ref={leaves} args={[resources.leaf, resources.lm, tree.leaves.length]} frustumCulled={false} />
        <instancedMesh ref={grass} args={[resources.tuft, resources.gm, tree.grass.length]} frustumCulled={false} />
        <instancedMesh ref={fallen} args={[resources.leaf, resources.fm, 60]} frustumCulled={false} />
        <instancedMesh ref={rain} args={[resources.rain, resources.rm, RAIN_MAX]} frustumCulled={false} />
      </group>
      <group ref={flat} visible={false}>
        <mesh geometry={resources.plate} material={resources.base} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} />
        <primitive object={flatRender.base} />
        <primitive object={flatRender.data} />
      </group>
    </group>
  );
}
