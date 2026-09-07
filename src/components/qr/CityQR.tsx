"use client";

/**
 * CityQR — the URL becomes a living model city. Dark data modules are buildings,
 * protected modules are plain finder blocks, light modules are streets/plazas.
 * Windows are a procedural fragment-shader grid (no geometry). Traffic, birds
 * and a plane animate in useFrame and freeze in Scan / reduced motion.
 *
 * Export is unchanged: a strict orthographic top-down frame with buildings drawn
 * flat in colors.foreground on the colors.background slab — the jsQR gate.
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
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { QRColors, QRModel } from "@/types/qr";
import { captureCanvas, type ExportedImage } from "@/lib/export";
import type { RendererHandle, RendererProps } from "@/components/qr/types";
import { usePrefersReducedMotion, useSceneActive } from "@/lib/hooks";
import { detectQuality } from "@/lib/renderQuality";
import type { ThemeName } from "@/lib/living/themes";
import { cityTheme, type CityTheme } from "@/lib/city/cityThemes";
import { generateCity, BUILDING_WIDTH, type CityModel } from "@/lib/city/cityGen";
import { applyWindowShader, makeWindowUniforms } from "@/lib/city/cityWindows";
import { birdWingGeometry, lampGeometry, planeGeometry, plazaTreeGeometry } from "@/lib/city/cityMeshes";

export interface CityQRProps extends RendererProps {
  view: "explore" | "scan";
  roofDetail: boolean;
  growNonce?: number;
  theme?: ThemeName;
  onToggleView?: () => void;
  onWebglError?: (message: string) => void;
}

const CAR_COLORS = ["#8a8f9c", "#9c8a7e", "#7e8a80", "#6f7486"];

const CityQR = forwardRef<RendererHandle, CityQRProps>(function CityQR(
  { model, colors, sizePx, view, roofDetail, growNonce = 0, theme = "verdant", onToggleView, onReady, onWebglError },
  ref,
) {
  const active = useSceneActive<HTMLDivElement>();
  const quality = useMemo(() => detectQuality(), []);
  const mobile = quality.tier === "low";
  const glRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const [exportSignal, setExportSignal] = useState(0);
  const exportResolve = useRef<((img: ExportedImage) => void) | null>(null);

  const doExport = useCallback(
    (): Promise<ExportedImage> =>
      new Promise((resolve) => {
        exportResolve.current = resolve;
        setExportSignal((n) => n + 1);
      }),
    [],
  );

  useImperativeHandle(
    ref,
    (): RendererHandle => ({ canExport: () => Boolean(glRef.current), exportImage: doExport }),
    [doExport],
  );

  const ct = cityTheme(theme);
  const nightBg = view === "explore" && ct.stageBg ? ct.stageBg : null;

  return (
    <div
      ref={active.ref}
      style={{
        width: "100%",
        height: "100%",
        minHeight: sizePx,
        cursor: onToggleView ? "pointer" : "default",
        background: nightBg ?? "transparent",
        borderRadius: nightBg ? 14 : 0,
        transition: "background 500ms ease",
      }}
      role="img"
      aria-label={`City model for ${model.encodedUrl}, ${view === "scan" ? "scan view" : "experience view"}`}
    >
      <Canvas
        dpr={mobile ? [1, 1] : [1, 1.5]}
        frameloop={active.active ? "always" : "demand"}
        gl={{ preserveDrawingBuffer: true, antialias: true, alpha: true }}
        orthographic
        camera={{ position: [0, 40, 0], zoom: 10, near: 0.1, far: 400 }}
        style={{ touchAction: "pan-y" }}
        onCreated={({ gl, scene }) => {
          glRef.current = gl;
          sceneRef.current = scene;
          gl.setClearColor(new THREE.Color("#000000"), 0);
          scene.background = null;
          onReady?.();
        }}
        onError={() =>
          onWebglError?.("3D rendering is unavailable on this device. Standard QR mode has been enabled.")
        }
        onPointerMissed={onToggleView}
      >
        <CityScene
          model={model}
          colors={colors}
          view={view}
          roofDetail={roofDetail}
          growNonce={growNonce}
          theme={theme}
          mobile={mobile}
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

export default CityQR;

/* -------------------------------------------------------------------------- */

interface SceneProps {
  model: QRModel;
  colors: QRColors;
  view: "explore" | "scan";
  roofDetail: boolean;
  growNonce: number;
  theme: ThemeName;
  mobile: boolean;
  exportSignal: number;
  onExported: () => void;
}

const _d = new THREE.Object3D();
const _c = new THREE.Color();

function lerpTheme(a: CityTheme, b: CityTheme, t: number) {
  const mix = (x: string, y: string) => _c.set(x).lerp(new THREE.Color(y), t).getStyle();
  return {
    facades: [mix(a.facades[0], b.facades[0]), mix(a.facades[1], b.facades[1]), mix(a.facades[2], b.facades[2])] as [string, string, string],
    roof: mix(a.roof, b.roof),
    glass: mix(a.glass, b.glass),
    litColors: [mix(a.litColors[0], b.litColors[0]), mix(a.litColors[1], b.litColors[1])] as [string, string],
    litFraction: THREE.MathUtils.lerp(a.litFraction, b.litFraction, t),
    windowEmissive: THREE.MathUtils.lerp(a.windowEmissive, b.windowEmissive, t),
    flickerFraction: THREE.MathUtils.lerp(a.flickerFraction, b.flickerFraction, t),
    street: mix(a.street, b.street),
    streetDash: mix(a.streetDash, b.streetDash),
    plaza: mix(a.plaza, b.plaza),
    lampColor: mix(a.lampColor, b.lampColor),
    lampLit: t < 0.5 ? a.lampLit : b.lampLit,
    keyElevationDeg: THREE.MathUtils.lerp(a.keyElevationDeg, b.keyElevationDeg, t),
    keyIntensity: THREE.MathUtils.lerp(a.keyIntensity, b.keyIntensity, t),
    ambientIntensity: THREE.MathUtils.lerp(a.ambientIntensity, b.ambientIntensity, t),
    hemiIntensity: THREE.MathUtils.lerp(a.hemiIntensity, b.hemiIntensity, t),
    night: t < 0.5 ? a.night : b.night,
    carHeadlights: t < 0.5 ? a.carHeadlights : b.carHeadlights,
  };
}

function CityScene({ model, colors, view, roofDetail, growNonce, theme, mobile, exportSignal, onExported }: SceneProps) {
  const { gl, scene, camera, size } = useThree();
  const reduced = usePrefersReducedMotion();
  const city = useMemo<CityModel>(() => generateCity(model, mobile), [model, mobile]);
  const worldSize = city.worldSize;
  const half = worldSize / 2 + 0.5;

  const buildings = useRef<THREE.InstancedMesh>(null);
  const roofs = useRef<THREE.InstancedMesh>(null);
  const antennas = useRef<THREE.InstancedMesh>(null);
  const tanks = useRef<THREE.InstancedMesh>(null);
  const streets = useRef<THREE.InstancedMesh>(null);
  const trees = useRef<THREE.InstancedMesh>(null);
  const benches = useRef<THREE.InstancedMesh>(null);
  const lamps = useRef<THREE.InstancedMesh>(null);
  const cars = useRef<THREE.InstancedMesh>(null);
  const carLights = useRef<THREE.InstancedMesh>(null);
  const birds = useRef<THREE.InstancedMesh>(null);
  const plane = useRef<THREE.Group>(null);
  const contrail = useRef<THREE.Points>(null);
  const decor = useRef<THREE.Group>(null);
  const slab = useRef<THREE.Mesh>(null);
  const keyLight = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);

  const uniforms = useMemo(() => makeWindowUniforms(), []);
  const buildingMat = useMemo(
    () => applyWindowShader(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }), uniforms),
    [uniforms],
  );
  const exportMat = useMemo(() => new THREE.MeshBasicMaterial({ color: colors.foreground }), [colors.foreground]);
  const treeGeo = useMemo(() => plazaTreeGeometry(), []);
  const lampGeo = useMemo(() => lampGeometry(cityTheme(theme).lampColor), [theme]);
  const wingGeo = useMemo(() => birdWingGeometry(), []);
  const planeGeo = useMemo(() => planeGeometry(), []);
  useEffect(
    () => () => {
      buildingMat.dispose();
      exportMat.dispose();
      treeGeo.dispose();
      lampGeo.dispose();
      wingGeo.dispose();
      planeGeo.dispose();
    },
    [buildingMat, exportMat, treeGeo, lampGeo, wingGeo, planeGeo],
  );

  const roofCount = city.buildings.filter((b) => b.roof !== "none").length;
  const antennaCount = city.buildings.filter((b) => b.antenna).length;
  const tankCount = city.buildings.filter((b) => b.watertank).length;
  const treeCount = city.props.filter((p) => p.kind === "tree").length;
  const benchCount = city.props.filter((p) => p.kind === "bench").length;
  const streetCap = Math.max(1, city.streetTiles.length * 2);

  /* clocks */
  const grow = useRef(reduced ? 1 : 0);
  const clock = useRef(0);
  const themeT = useRef(1);
  const fromTheme = useRef<ThemeName>(theme);
  const toThemeRef = useRef<ThemeName>(theme);
  const flock = useRef({ mode: "circle" as "circle" | "away" | "back", timer: 30 + Math.random() * 40, edge: 0 });
  const planeState = useRef({ next: city.plane.firstDelay, active: false, u: 0 });
  const trailIdx = useRef(0);
  const trailAge = useRef<Float32Array>(new Float32Array(40));
  const trailPos = useMemo(() => new Float32Array(120), []);

  useEffect(() => {
    grow.current = reduced ? 1 : 0;
    clock.current = 0;
  }, [growNonce, model.encodedUrl, reduced]);

  // Start a 500ms colour + lit-fraction lerp whenever the theme changes.
  useEffect(() => {
    if (toThemeRef.current !== theme) {
      fromTheme.current = toThemeRef.current;
      toThemeRef.current = theme;
      themeT.current = 0;
    }
  }, [theme]);

  /* ---- static population (geometry + base colours), once per model/theme ---- */
  useEffect(() => {
    const et = themeT.current * themeT.current * (3 - 2 * themeT.current);
    const pal = lerpTheme(cityTheme(fromTheme.current), cityTheme(theme), et);

    // buildings
    const bm = buildings.current;
    if (bm) {
      const seeds = new Float32Array(city.buildings.length);
      for (let i = 0; i < city.buildings.length; i++) {
        const b = city.buildings[i];
        seeds[i] = b.klass === "protected" ? -1 : b.seed;
        const h0 = reduced ? b.height : 0.0001;
        _d.position.set(b.x, h0 / 2, b.z);
        _d.rotation.set(0, 0, 0);
        _d.scale.set(b.spanX, h0, b.spanZ);
        _d.updateMatrix();
        bm.setMatrixAt(i, _d.matrix);
        // Scan view previews the flat verified QR: every dark module renders in
        // colors.foreground, matching the export exactly.
        bm.setColorAt(
          i,
          _c.set(view === "scan" ? colors.foreground : b.klass === "protected" ? pal.roof : pal.facades[b.toneIndex]),
        );
      }
      bm.geometry.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
      bm.count = city.buildings.length;
      bm.instanceMatrix.needsUpdate = true;
      if (bm.instanceColor) bm.instanceColor.needsUpdate = true;
    }

    // roof detail (setback / hvac / spire), all in one mesh
    const rm = roofs.current;
    if (rm) {
      let ri = 0;
      for (const b of city.buildings) {
        if (b.roof === "none" || b.klass === "protected") continue;
        if (b.roof === "setback") {
          _d.position.set(b.x, b.height + 0.11, b.z);
          _d.scale.set(b.spanX * 0.7, 0.22, b.spanZ * 0.7);
          _d.rotation.set(0, 0, 0);
          _d.updateMatrix();
          rm.setMatrixAt(ri, _d.matrix);
          rm.setColorAt(ri++, _c.set(pal.roof));
        } else if (b.roof === "hvac") {
          for (let k = 0; k < 3 && ri < roofCount * 3; k++) {
            _d.position.set(b.x + (k - 1) * 0.22, b.height + 0.07, b.z + (k % 2 ? 0.16 : -0.12));
            _d.scale.set(0.14, 0.14, 0.14);
            _d.rotation.set(0, 0, 0);
            _d.updateMatrix();
            rm.setMatrixAt(ri, _d.matrix);
            rm.setColorAt(ri++, _c.set(pal.roof));
          }
        } else if (b.roof === "spire") {
          _d.position.set(b.x, b.height + 0.2, b.z);
          _d.scale.set(0.08, 0.4, 0.08);
          _d.rotation.set(0, 0, 0);
          _d.updateMatrix();
          rm.setMatrixAt(ri, _d.matrix);
          rm.setColorAt(ri++, _c.set(pal.roof));
        }
      }
      rm.count = ri;
      rm.instanceMatrix.needsUpdate = true;
      if (rm.instanceColor) rm.instanceColor.needsUpdate = true;
    }

    // antennas + water tanks
    const am = antennas.current;
    if (am) {
      let ai = 0;
      for (const b of city.buildings) {
        if (!b.antenna) continue;
        _d.position.set(b.x + 0.2, b.height + 0.3, b.z);
        _d.scale.set(0.03, 0.6, 0.03);
        _d.rotation.set(0, 0, 0);
        _d.updateMatrix();
        am.setMatrixAt(ai, _d.matrix);
        am.setColorAt(ai++, _c.set(pal.roof));
      }
      am.count = ai;
      am.instanceMatrix.needsUpdate = true;
      if (am.instanceColor) am.instanceColor.needsUpdate = true;
    }
    const tm = tanks.current;
    if (tm) {
      let ti = 0;
      for (const b of city.buildings) {
        if (!b.watertank) continue;
        _d.position.set(b.x - 0.18, b.height + 0.12, b.z + 0.15);
        _d.scale.set(0.28, 0.24, 0.28);
        _d.rotation.set(0, 0, 0);
        _d.updateMatrix();
        tm.setMatrixAt(ti, _d.matrix);
        tm.setColorAt(ti++, _c.set(pal.roof));
      }
      tm.count = ti;
      tm.instanceMatrix.needsUpdate = true;
      if (tm.instanceColor) tm.instanceColor.needsUpdate = true;
    }

    // streets: lowered tile + centre dash on alternate cells
    const sm = streets.current;
    if (sm) {
      let si = 0;
      for (const s of city.streetTiles) {
        _d.position.set(s.x, -0.03, s.z);
        _d.scale.set(0.98, 0.04, 0.98);
        _d.rotation.set(0, 0, 0);
        _d.updateMatrix();
        sm.setMatrixAt(si, _d.matrix);
        sm.setColorAt(si++, _c.set(pal.street));
        if (s.dash) {
          _d.position.set(s.x, -0.005, s.z);
          _d.scale.set(0.4, 0.02, 0.06);
          _d.updateMatrix();
          sm.setMatrixAt(si, _d.matrix);
          sm.setColorAt(si++, _c.set(pal.streetDash));
        }
      }
      sm.count = si;
      sm.instanceMatrix.needsUpdate = true;
      if (sm.instanceColor) sm.instanceColor.needsUpdate = true;
    }

    // plaza props
    const trm = trees.current;
    if (trm) {
      let i = 0;
      for (const p of city.props) {
        if (p.kind !== "tree") continue;
        _d.position.set(p.x, 0, p.z);
        _d.rotation.set(0, p.rot, 0);
        _d.scale.setScalar(1);
        _d.updateMatrix();
        trm.setMatrixAt(i++, _d.matrix);
      }
      trm.count = i;
      trm.instanceMatrix.needsUpdate = true;
    }
    const bem = benches.current;
    if (bem) {
      let i = 0;
      for (const p of city.props) {
        if (p.kind !== "bench") continue;
        _d.position.set(p.x, 0.05, p.z);
        _d.rotation.set(0, p.rot, 0);
        _d.scale.set(0.4, 0.1, 0.15);
        _d.updateMatrix();
        bem.setMatrixAt(i, _d.matrix);
        bem.setColorAt(i++, _c.set("#6E4B34"));
      }
      bem.count = i;
      bem.instanceMatrix.needsUpdate = true;
      if (bem.instanceColor) bem.instanceColor.needsUpdate = true;
    }

    // lamps
    const lm = lamps.current;
    if (lm) {
      city.lamps.forEach((p, i) => {
        _d.position.set(p.x, 0, p.z);
        _d.rotation.set(0, 0, 0);
        _d.scale.setScalar(1);
        _d.updateMatrix();
        lm.setMatrixAt(i, _d.matrix);
      });
      lm.count = city.lamps.length;
      lm.instanceMatrix.needsUpdate = true;
      const mat = lm.material as THREE.MeshStandardMaterial;
      mat.emissive.set(pal.lampColor);
      mat.emissiveIntensity = pal.lampLit ? 0.9 : 0;
    }

    // slab + lights
    if (slab.current) (slab.current.material as THREE.MeshStandardMaterial).color.set(view === "scan" ? colors.background : pal.plaza);
    if (ambient.current) ambient.current.intensity = view === "scan" ? 0.9 : pal.ambientIntensity;
    if (hemi.current) hemi.current.intensity = view === "scan" ? 0.55 : pal.hemiIntensity;
    if (keyLight.current) {
      const el = (pal.keyElevationDeg * Math.PI) / 180;
      keyLight.current.position.set(Math.cos(el) * worldSize * 0.6, Math.sin(el) * worldSize * 0.7 + 2, worldSize * 0.25);
      keyLight.current.intensity = view === "scan" ? 0.35 : pal.keyIntensity;
    }

    uniforms.uGlass.value.set(pal.glass);
    uniforms.uLitA.value.set(pal.litColors[0]);
    uniforms.uLitB.value.set(pal.litColors[1]);
    uniforms.uLitFraction.value = view === "scan" ? 0 : pal.litFraction;
    uniforms.uEmissive.value = view === "scan" ? 0 : pal.windowEmissive;
    uniforms.uFlicker.value = view === "scan" || reduced ? 0 : pal.flickerFraction;
  }, [city, theme, view, roofDetail, reduced, colors.background, colors.foreground, worldSize, roofCount, uniforms]);

  /* ---- camera ---- */
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    const aspect = size.width / Math.max(1, size.height);
    if (view === "scan") {
      cam.position.set(0, worldSize, 0);
      cam.up.set(0, 0, -1);
      cam.lookAt(0, 0, 0);
      cam.left = -half * aspect;
      cam.right = half * aspect;
      cam.top = half;
      cam.bottom = -half;
      cam.zoom = 1;
    } else {
      cam.position.set(worldSize * 0.72, worldSize * 0.46, worldSize * 0.84);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
      cam.zoom = size.width < 760 ? 6.4 : 7.6;
    }
    cam.near = 0.1;
    cam.far = worldSize * 6;
    cam.updateProjectionMatrix();
  }, [camera, view, worldSize, half, size.width, size.height]);

  useEffect(() => {
    if (decor.current) decor.current.visible = view === "explore";
    if (roofs.current) roofs.current.visible = view === "explore" && roofDetail;
  }, [view, roofDetail]);

  useEffect(() => {
    if (view === "scan") {
      gl.setClearColor(new THREE.Color(colors.background), 1);
      scene.background = new THREE.Color(colors.background);
    } else {
      gl.setClearColor(0x000000, 0);
      scene.background = null;
    }
  }, [gl, scene, colors.background, view]);

  /* ---- per-frame ---- */
  const animate = view === "explore" && !reduced;
  useFrame((_, deltaRaw) => {
    const delta = Math.min(deltaRaw, 0.05);
    clock.current += animate ? delta : 0;
    uniforms.uTime.value = clock.current;

    // growth wave
    const bm = buildings.current;
    if (bm && grow.current < 1) {
      grow.current = Math.min(1, grow.current + delta / 1.8);
      const g = grow.current;
      for (let i = 0; i < city.buildings.length; i++) {
        const b = city.buildings[i];
        const dist = Math.hypot(b.x, b.z) / (worldSize * 0.55);
        const local = THREE.MathUtils.clamp((g - dist * 0.5) / 0.4, 0, 1);
        const h = Math.max(0.0001, b.height * (1 - (1 - local) ** 3));
        _d.position.set(b.x, h / 2, b.z);
        _d.scale.set(b.spanX, h, b.spanZ);
        _d.rotation.set(0, 0, 0);
        _d.updateMatrix();
        bm.setMatrixAt(i, _d.matrix);
      }
      bm.instanceMatrix.needsUpdate = true;
    }

    // theme colour + lit-fraction lerp (500ms) — Scan renders flat foreground.
    if (themeT.current < 1 && view !== "scan") {
      themeT.current = Math.min(1, themeT.current + delta / 0.5);
      const t = themeT.current * themeT.current * (3 - 2 * themeT.current);
      const pal = lerpTheme(cityTheme(fromTheme.current), cityTheme(theme), t);
      for (let i = 0; i < city.buildings.length; i++) {
        const b = city.buildings[i];
        bm?.setColorAt(i, _c.set(b.klass === "protected" ? pal.roof : pal.facades[b.toneIndex]));
      }
      if (bm?.instanceColor) bm.instanceColor.needsUpdate = true;
      uniforms.uGlass.value.set(pal.glass);
      uniforms.uLitA.value.set(pal.litColors[0]);
      uniforms.uLitB.value.set(pal.litColors[1]);
      uniforms.uLitFraction.value = pal.litFraction;
      uniforms.uEmissive.value = pal.windowEmissive;
      uniforms.uFlicker.value = reduced ? 0 : pal.flickerFraction;
      if (slab.current) (slab.current.material as THREE.MeshStandardMaterial).color.set(pal.plaza);
      const lm = lamps.current;
      if (lm) {
        const mat = lm.material as THREE.MeshStandardMaterial;
        mat.emissive.set(pal.lampColor);
        mat.emissiveIntensity = pal.lampLit ? 0.9 : 0;
      }
      if (keyLight.current) keyLight.current.intensity = pal.keyIntensity;
    }

    const ct = cityTheme(theme);

    // traffic
    const carM = cars.current;
    const lightM = carLights.current;
    if (carM && city.cars.length && city.runs.length) {
      for (let i = 0; i < city.cars.length; i++) {
        const car = city.cars[i];
        const run = city.runs[car.run % city.runs.length];
        if (animate) {
          car.t += (car.dir * car.speed * delta) / Math.max(1, run.length);
          if (car.t <= 0) { car.t = 0; car.dir = 1; }
          else if (car.t >= 1) { car.t = 1; car.dir = -1; }
        }
        const x = THREE.MathUtils.lerp(run.ax, run.bx, car.t);
        const z = THREE.MathUtils.lerp(run.az, run.bz, car.t);
        const hz = run.axis === "h";
        _d.position.set(x + (hz ? 0 : car.lane), 0.09, z + (hz ? car.lane : 0));
        _d.rotation.set(0, hz ? (car.dir > 0 ? 0 : Math.PI) : car.dir > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        _d.scale.set(0.35, 0.15, 0.18);
        _d.updateMatrix();
        carM.setMatrixAt(i, _d.matrix);
        carM.setColorAt(i, _c.set(CAR_COLORS[car.color]));
        if (lightM) {
          for (let k = 0; k < 2; k++) {
            const fx = hz ? car.dir * 0.18 : 0;
            const fz = hz ? 0 : car.dir * 0.18;
            _d.position.set(x + (hz ? 0 : car.lane) + fx, 0.1, z + (hz ? car.lane : 0) + fz + (k ? 0.05 : -0.05) * (hz ? 1 : 0));
            _d.scale.setScalar(0.04);
            _d.rotation.set(0, 0, 0);
            _d.updateMatrix();
            lightM.setMatrixAt(i * 2 + k, _d.matrix);
          }
        }
      }
      carM.instanceMatrix.needsUpdate = true;
      if (carM.instanceColor) carM.instanceColor.needsUpdate = true;
      if (lightM) {
        lightM.instanceMatrix.needsUpdate = true;
        lightM.visible = ct.carHeadlights && view === "explore";
      }
    }

    // birds — loose V circling the city
    const bd = birds.current;
    if (bd) {
      const f = flock.current;
      if (animate) {
        f.timer -= delta;
        if (f.mode === "circle" && f.timer <= 0) { f.mode = "away"; f.timer = 12; f.edge = Math.floor(Math.random() * 4); }
        else if (f.mode === "away" && f.timer <= 0) { f.mode = "back"; f.timer = 6; f.edge = Math.floor(Math.random() * 4); }
        else if (f.mode === "back" && f.timer <= 0) { f.mode = "circle"; f.timer = 90 + Math.random() * 60; }
      }
      const lap = (clock.current * (Math.PI * 2)) / city.birds.lapSeconds;
      let cx = Math.cos(lap) * city.birds.radius;
      let cz = Math.sin(lap) * city.birds.radius;
      let cy = city.birds.altitude + Math.sin(clock.current * 0.2) * 0.4;
      if (f.mode !== "circle") {
        const ex = [1, -1, 0, 0][f.edge] * worldSize;
        const ez = [0, 0, 1, -1][f.edge] * worldSize;
        const away = f.mode === "away" ? 1 - f.timer / 12 : f.timer / 6;
        cx = THREE.MathUtils.lerp(cx, ex, away);
        cz = THREE.MathUtils.lerp(cz, ez, away);
        cy += away * 2;
      }
      const head = Math.atan2(-Math.sin(lap), Math.cos(lap));
      for (let i = 0; i < city.birds.count; i++) {
        const rank = Math.floor(i / 2) + 1;
        const sideSign = i % 2 ? 1 : -1;
        const bx = -rank * 0.35;
        const bz = sideSign * rank * 0.32;
        const px = cx + Math.cos(head) * bx - Math.sin(head) * bz;
        const pz = cz + Math.sin(head) * bx + Math.cos(head) * bz;
        const flap = animate ? Math.sin(clock.current * Math.PI * 2 * 4 + city.birds.phases[i]) * (35 * Math.PI) / 180 : 0.1;
        for (let w = 0; w < 2; w++) {
          _d.position.set(px, cy, pz);
          _d.rotation.set(0, head + (w ? Math.PI : 0), (w ? -1 : 1) * flap);
          _d.scale.setScalar(f.mode === "circle" ? 1 : Math.max(0.001, f.mode === "away" ? 1 - (1 - f.timer / 12) : f.timer / 6));
          _d.updateMatrix();
          bd.setMatrixAt(i * 2 + w, _d.matrix);
        }
      }
      bd.instanceMatrix.needsUpdate = true;
      bd.count = city.birds.count * 2;
    }

    // plane + contrail
    const pg = plane.current;
    if (pg) {
      const ps = planeState.current;
      if (animate) {
        if (!ps.active) {
          ps.next -= delta;
          if (ps.next <= 0) { ps.active = true; ps.u = 0; }
        } else {
          ps.u += (city.plane.speed * delta) / (worldSize * 2.4);
          if (ps.u >= 1) { ps.active = false; ps.next = 75 + Math.random() * 45; }
        }
      }
      pg.visible = ps.active || !animate;
      const a = city.plane.angle;
      const travel = (ps.active ? ps.u : 0.5) * worldSize * 2.4 - worldSize * 1.2;
      pg.position.set(Math.cos(a) * travel, city.plane.altitude, Math.sin(a) * travel);
      pg.rotation.set(0, -a, 0);
      const tr = contrail.current;
      if (tr) {
        const pos = tr.geometry.attributes.position as THREE.BufferAttribute;
        if (animate && ps.active) {
          trailAge.current[trailIdx.current] = 0;
          pos.setXYZ(trailIdx.current, pg.position.x, pg.position.y, pg.position.z);
          trailIdx.current = (trailIdx.current + 1) % 40;
        }
        for (let i = 0; i < 40; i++) trailAge.current[i] += delta;
        pos.needsUpdate = true;
        (tr.material as THREE.PointsMaterial).opacity = ps.active ? 0.5 : 0;
        tr.visible = view === "explore";
      }
      // night blink
      const blink = pg.children[1] as THREE.Mesh | undefined;
      if (blink) blink.visible = ct.night && Math.sin(clock.current * Math.PI) > 0;
    }
  });

  /* ---- export: deterministic flat top-down frame ---- */
  useEffect(() => {
    if (exportSignal === 0) return;
    const bm = buildings.current;
    if (!bm) return;

    grow.current = 1;
    for (let i = 0; i < city.buildings.length; i++) {
      const b = city.buildings[i];
      _d.position.set(b.x, b.height / 2, b.z);
      _d.scale.set(b.spanX, b.height, b.spanZ);
      _d.rotation.set(0, 0, 0);
      _d.updateMatrix();
      bm.setMatrixAt(i, _d.matrix);
    }
    bm.instanceMatrix.needsUpdate = true;

    const prevMat = bm.material;
    const prevDecor = decor.current?.visible ?? true;
    const prevRoofs = roofs.current?.visible ?? true;
    bm.material = exportMat;
    uniforms.uExport.value = 1;
    if (decor.current) decor.current.visible = false;
    if (roofs.current) roofs.current.visible = false;

    const prevSize = new THREE.Vector2();
    gl.getSize(prevSize);
    const prevRatio = gl.getPixelRatio();
    const prevAuto = gl.autoClear;
    const EXPORT_PX = 900;

    const cam = new THREE.OrthographicCamera(-half, half, half, -half, 0.1, worldSize * 6);
    cam.position.set(0, worldSize, 0);
    cam.up.set(0, 0, -1);
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();

    gl.setPixelRatio(1);
    gl.setSize(EXPORT_PX, EXPORT_PX, false);
    gl.setClearColor(new THREE.Color(colors.background), 1);
    gl.autoClear = true;
    if (slab.current) (slab.current.material as THREE.MeshStandardMaterial).color.set(colors.background);
    gl.render(scene, cam);
    onExported();

    gl.setPixelRatio(prevRatio);
    gl.setSize(prevSize.x, prevSize.y, false);
    gl.autoClear = prevAuto;
    bm.material = prevMat;
    uniforms.uExport.value = 0;
    if (decor.current) decor.current.visible = prevDecor;
    if (roofs.current) roofs.current.visible = prevRoofs;
    if (slab.current) (slab.current.material as THREE.MeshStandardMaterial).color.set(view === "scan" ? colors.background : cityTheme(theme).plaza);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportSignal]);

  const B = BUILDING_WIDTH;
  return (
    <>
      <ambientLight ref={ambient} intensity={1.8} />
      <hemisphereLight ref={hemi} args={[0xffffff, 0xd9ded1, 1.2]} />
      <directionalLight ref={keyLight} position={[10, 24, 8]} intensity={1.1} />

      <mesh ref={slab} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[worldSize, worldSize]} />
        <meshStandardMaterial color="#ece7db" roughness={0.96} metalness={0} />
      </mesh>

      <instancedMesh ref={buildings} args={[undefined, undefined, Math.max(1, city.buildings.length)]} frustumCulled={false} material={buildingMat}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>

      <instancedMesh ref={roofs} args={[undefined, undefined, Math.max(1, roofCount * 3)]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial vertexColors roughness={0.9} metalness={0} />
      </instancedMesh>

      <group ref={decor}>
        <instancedMesh ref={antennas} args={[undefined, undefined, Math.max(1, antennaCount)]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial vertexColors roughness={0.8} />
        </instancedMesh>
        <instancedMesh ref={tanks} args={[undefined, undefined, Math.max(1, tankCount)]} frustumCulled={false}>
          <cylinderGeometry args={[0.5, 0.5, 1, 10]} />
          <meshStandardMaterial vertexColors roughness={0.85} />
        </instancedMesh>
        <instancedMesh ref={streets} args={[undefined, undefined, streetCap]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial vertexColors roughness={1} metalness={0} />
        </instancedMesh>
        <instancedMesh ref={trees} args={[treeGeo, undefined, Math.max(1, treeCount)]} frustumCulled={false}>
          <meshStandardMaterial vertexColors roughness={0.9} />
        </instancedMesh>
        <instancedMesh ref={benches} args={[undefined, undefined, Math.max(1, benchCount)]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial vertexColors roughness={0.9} />
        </instancedMesh>
        <instancedMesh ref={lamps} args={[lampGeo, undefined, Math.max(1, city.lamps.length)]} frustumCulled={false}>
          <meshStandardMaterial vertexColors roughness={0.7} emissive="#000000" />
        </instancedMesh>
        <instancedMesh ref={cars} args={[undefined, undefined, Math.max(1, city.cars.length)]} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial vertexColors roughness={0.6} />
        </instancedMesh>
        <instancedMesh ref={carLights} args={[undefined, undefined, Math.max(2, city.cars.length * 2)]} frustumCulled={false}>
          <sphereGeometry args={[1, 6, 6]} />
          <meshBasicMaterial color="#fff2c2" toneMapped={false} />
        </instancedMesh>
        <instancedMesh ref={birds} args={[wingGeo, undefined, Math.max(2, city.birds.count * 2)]} frustumCulled={false}>
          <meshBasicMaterial color="#23273a" side={THREE.DoubleSide} toneMapped={false} />
        </instancedMesh>
        <group ref={plane}>
          <mesh geometry={planeGeo}>
            <meshStandardMaterial color="#c9ccd2" roughness={0.7} />
          </mesh>
          <mesh position={[-0.24, 0, 0]}>
            <sphereGeometry args={[0.025, 6, 6]} />
            <meshBasicMaterial color="#ff3b3b" toneMapped={false} />
          </mesh>
        </group>
        <points ref={contrail}>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[trailPos, 3]} />
          </bufferGeometry>
          <pointsMaterial size={0.14} color="#ffffff" transparent opacity={0} sizeAttenuation depthWrite={false} />
        </points>
      </group>

      {B > 0 && view === "explore" && !reduced && (
        <OrbitControls enablePan={false} minPolarAngle={0.15} maxPolarAngle={Math.PI / 2.2} enableDamping />
      )}
    </>
  );
}
