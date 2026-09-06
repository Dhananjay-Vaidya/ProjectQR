"use client";

/**
 * CityQR — each dark module is a building footprint, each light module is
 * ground. Preview can be orbited (Explore); export is always a strict
 * orthographic top-down frame (Scan) whose silhouette is a valid QR.
 *
 * Performance: one InstancedMesh for all buildings. Matrices/colours are
 * rebuilt only when the model or colours change, never per frame.
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
import {
  darkCells,
  buildingHeights,
  framedWorldSize,
  scanOrthoHalfExtent,
  type ModuleCell,
} from "@/lib/renderShared";
import { captureCanvas, type ExportedImage } from "@/lib/export";
import type { RendererHandle, RendererProps } from "@/components/qr/types";
import { usePrefersReducedMotion, useSceneActive } from "@/lib/hooks";
import { THEMES, type ThemeName } from "@/lib/living/themes";

export interface CityQRProps extends RendererProps {
  view: "explore" | "scan";
  roofDetail: boolean;
  /** bump to replay the city-growth wave (identity is unchanged) */
  growNonce?: number;
  /** presentation theme — recolours slab / building tones */
  theme?: ThemeName;
  /** tap toggles Experience ⇄ Scan */
  onToggleView?: () => void;
  onWebglError?: (message: string) => void;
}

const BUILDING_WIDTH = 0.86; // fits inside the 1-unit cell, no bleed
const WINDOW_ROWS = 4;

function cityPalette(theme: ThemeName) {
  switch (theme) {
    case "neon":
      return {
        slab: "#d9dbe1",
        road: "#eceef2",
        tower: ["#6f7f8f", "#8292a2", "#9aa7b5"],
        roof: "#c7ccd4",
        glass: "#bfc9d8",
        glow: "#c9f2ff",
        light: "#f5dca8",
      };
    case "ember":
      return {
        slab: "#ded0bf",
        road: "#f0e2d0",
        tower: ["#806c5b", "#9a8370", "#b1987e"],
        roof: "#d3b98f",
        glass: "#e1c499",
        glow: "#ffcf85",
        light: "#ffe1a6",
      };
    case "verdant":
    default:
      return {
        slab: "#d9ddcf",
        road: "#eef1e8",
        tower: ["#8d9b91", "#a6b0a6", "#c0c7bd"],
        roof: "#c3d0bb",
        glass: "#c7d9d0",
        glow: "#f3dfa2",
        light: "#fff0b9",
      };
  }
}

function cityBuildingHeight(cell: ModuleCell, baseHeight: number, worldSize: number, compact = false) {
  if (cell.protected) return compact ? 0.62 : 0.7;
  const distance = Math.hypot(cell.x, cell.z);
  const centreBoost = Math.max(0, 1 - distance / (worldSize * 0.48));
  const jitter = (((cell.row + 11) * 73856093) ^ ((cell.col + 17) * 19349663)) >>> 0;
  const landmark = centreBoost > 0.22 && jitter % 11 === 0 ? 1.85 : jitter % 23 === 0 ? 1.35 : 1;
  const scale = compact ? 2.35 : 2.25 + centreBoost * 5.6;

  return baseHeight * scale * landmark;
}

const CityQR = forwardRef<RendererHandle, CityQRProps>(function CityQR(
  {
    model,
    colors,
    sizePx,
    view,
    roofDetail,
    growNonce = 0,
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
  const sceneRef = useRef<THREE.Scene | null>(null);
  const exportCamRef = useRef<THREE.OrthographicCamera | null>(null);
  const [exportSignal, setExportSignal] = useState(0);
  const exportResolve = useRef<((img: ExportedImage) => void) | null>(null);

  const doExport = useCallback((): Promise<ExportedImage> => {
    return new Promise((resolve) => {
      exportResolve.current = resolve;
      setExportSignal((n) => n + 1);
    });
  }, []);

  useImperativeHandle(
    ref,
    (): RendererHandle => ({
      canExport: () => Boolean(glRef.current),
      exportImage: doExport,
    }),
    [doExport]
  );

  return (
    <div
      ref={active.ref}
      style={{ width: "100%", height: "100%", minHeight: sizePx, cursor: onToggleView ? "pointer" : "default" }}
      role="img"
      aria-label={`City voxel diorama for ${model.encodedUrl}, ${
        view === "scan" ? "scan view" : "experience view"
      }`}
    >
      <Canvas
        dpr={[1, 1.5]}
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
          onWebglError?.(
            "3D rendering is unavailable on this device. Standard QR mode has been enabled."
          )
        }
        onPointerMissed={onToggleView}
      >
        <CityScene
          model={model}
          colors={colors}
          view={view}
          roofDetail={roofDetail}
          growNonce={growNonce}
          slabColor={themeObj.slab}
          theme={theme}
          exportSignal={exportSignal}
          onExported={() => {
            const gl = glRef.current;
            if (gl && exportResolve.current) {
              const img = captureCanvas(gl.domElement);
              exportResolve.current(img);
              exportResolve.current = null;
            }
          }}
          exportCamRef={exportCamRef}
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
  slabColor: string;
  theme: ThemeName;
  exportSignal: number;
  onExported: () => void;
  exportCamRef: React.RefObject<THREE.OrthographicCamera | null>;
}

/* module-level scratch for the per-frame growth wave */
const _cityDummy = new THREE.Object3D();

function CityScene({
  model,
  colors,
  view,
  roofDetail,
  growNonce,
  slabColor,
  theme,
  exportSignal,
  onExported,
  exportCamRef,
}: SceneProps) {
  const { gl, scene, camera, size } = useThree();
  const meshRef = useRef<THREE.InstancedMesh | null>(null);
  const roofRef = useRef<THREE.InstancedMesh | null>(null);
  const windowRef = useRef<THREE.InstancedMesh | null>(null);
  const streetRef = useRef<THREE.InstancedMesh | null>(null);
  const sweepRef = useRef<THREE.PointLight | null>(null);

  const cells = useMemo(() => darkCells(model), [model]);
  const heights = useMemo(() => buildingHeights(model), [model]);
  const worldSize = useMemo(() => framedWorldSize(model), [model]);
  const halfExtent = useMemo(() => scanOrthoHalfExtent(model), [model]);
  const reducedMotion = usePrefersReducedMotion();

  const fgColor = useMemo(() => new THREE.Color(colors.foreground), [colors.foreground]);
  const bgColor = useMemo(() => new THREE.Color(colors.background), [colors.background]);
  const city = useMemo(() => cityPalette(theme), [theme]);
  const towerColors = useMemo(() => city.tower.map((value) => new THREE.Color(value)), [city]);
  const roadColor = useMemo(() => new THREE.Color(city.road), [city.road]);

  /* per-building rise delay: a wave outward from the centre + a seeded jitter,
     normalised to [0, 1]. Precomputed, never per frame. */
  const riseDelay = useMemo(() => {
    const n = cells.length;
    const d = new Float32Array(n);
    let maxDist = 0.0001;
    for (let i = 0; i < n; i++) {
      const dist = Math.hypot(cells[i].x, cells[i].z);
      if (dist > maxDist) maxDist = dist;
    }
    for (let i = 0; i < n; i++) {
      const dist = Math.hypot(cells[i].x, cells[i].z) / maxDist;
      const jitter = (((i * 2654435761) >>> 0) % 1000) / 1000;
      d[i] = THREE.MathUtils.clamp(dist * 0.7 + jitter * 0.2, 0, 0.9);
    }
    return d;
  }, [cells]);

  const growRef = useRef(reducedMotion ? 1 : 0);
  const cityClockRef = useRef(0);
  useEffect(() => {
    growRef.current = reducedMotion ? 1 : 0;
    cityClockRef.current = 0;
  }, [growNonce, model.encodedUrl, reducedMotion]);

  // Populate the InstancedMesh once per model/colour change.
  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    let windowIndex = 0;

    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const h = cityBuildingHeight(cell, heights[i], worldSize);
      // start collapsed if we're going to animate the growth wave
      const h0 = reducedMotion ? h : 0.0001;
      dummy.position.set(cell.x, h0 / 2, cell.z);
      dummy.scale.set(BUILDING_WIDTH, h0, BUILDING_WIDTH);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const jitter = ((i * 2654435761) >>> 0) % 1000 / 1000;
      tint.copy(cell.protected ? towerColors[0] : towerColors[i % towerColors.length]);
      tint.offsetHSL(0, 0, (jitter - 0.5) * 0.08);
      mesh.setColorAt(i, tint);

      if (!cell.protected && windowRef.current && h > 1.15) {
        const floors = Math.min(WINDOW_ROWS, Math.max(2, Math.floor(h * 1.3)));
        for (let floor = 0; floor < floors && windowIndex < windowRef.current.count; floor++) {
          const y = 0.36 + floor * Math.max(0.32, h / (floors + 1));
          const side = floor % 2 === 0 ? 1 : -1;
          dummy.position.set(cell.x + side * (BUILDING_WIDTH / 2 + 0.004), y, cell.z - 0.16);
          dummy.rotation.set(0, Math.PI / 2, 0);
          dummy.scale.set(0.12, 0.045, 1);
          dummy.updateMatrix();
          windowRef.current.setMatrixAt(windowIndex, dummy.matrix);
          windowRef.current.setColorAt(windowIndex, new THREE.Color(floor % 3 === 0 ? city.light : city.glow));
          windowIndex++;
        }
      }
    }
    mesh.count = cells.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    if (windowRef.current) {
      windowRef.current.count = windowIndex;
      windowRef.current.instanceMatrix.needsUpdate = true;
      if (windowRef.current.instanceColor) windowRef.current.instanceColor.needsUpdate = true;
    }

    const street = streetRef.current;
    if (street) {
      let si = 0;
      for (let r = 0; r < model.size; r++) {
        for (let c = 0; c < model.size; c++) {
          if (model.dark[r][c]) continue;
          const x = c + 0.5 - model.size / 2;
          const z = r + 0.5 - model.size / 2;
          dummy.position.set(x, 0.012, z);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(0.92, 0.018, 0.92);
          dummy.updateMatrix();
          street.setMatrixAt(si, dummy.matrix);
          street.setColorAt(si, roadColor);
          si++;
        }
      }
      street.count = si;
      street.instanceMatrix.needsUpdate = true;
      if (street.instanceColor) street.instanceColor.needsUpdate = true;
    }

    // Roofs: only on non-protected buildings, low-profile, inside the cell.
    const roof = roofRef.current;
    if (roof) {
      let ri = 0;
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i];
        if (cell.protected || !roofDetail) continue;
        const h = cityBuildingHeight(cell, heights[i], worldSize);
        dummy.position.set(cell.x, h + 0.03, cell.z);
        dummy.scale.set(BUILDING_WIDTH * 0.66, 0.055, BUILDING_WIDTH * 0.66);
        dummy.updateMatrix();
        roof.setMatrixAt(ri, dummy.matrix);
        roof.setColorAt(ri, new THREE.Color(city.roof));
        ri++;
      }
      roof.count = ri;
      roof.instanceMatrix.needsUpdate = true;
      if (roof.instanceColor) roof.instanceColor.needsUpdate = true;
    }
  }, [cells, heights, model, roofDetail, reducedMotion, growNonce, worldSize, towerColors, city, roadColor]);

  /* growth wave + subtle idle: buildings rise from 0 to target height with a
     per-building delay; a point light sweeps slowly across the grid. Only the
     buildings still rising get their matrix rewritten. */
  const roofHidden = useRef(false);
  useFrame((_, delta) => {
    cityClockRef.current += delta;
    const mesh = meshRef.current;
    if (!mesh) return;

    if (growRef.current < 1 && !reducedMotion) {
      growRef.current = Math.min(1, growRef.current + delta / 2.4);
      const g = growRef.current;
      let dirty = false;
      for (let i = 0; i < cells.length; i++) {
        const d = riseDelay[i];
        if (g < d) continue; // not started
        const local = THREE.MathUtils.clamp((g - d) / 0.28, 0, 1);
        const e = 1 - Math.pow(1 - local, 3);
        const targetHeight = cityBuildingHeight(cells[i], heights[i], worldSize);
        const h = Math.max(0.0001, targetHeight * e);
        _cityDummy.position.set(cells[i].x, h / 2, cells[i].z);
        _cityDummy.scale.set(BUILDING_WIDTH, h, BUILDING_WIDTH);
        _cityDummy.updateMatrix();
        mesh.setMatrixAt(i, _cityDummy.matrix);
        dirty = true;
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true;

      // keep roofs hidden until buildings are mostly up
      const roof = roofRef.current;
      if (roof) {
        const shouldShow = g > 0.85;
        if (shouldShow === roofHidden.current) {
          roof.visible = shouldShow;
          roofHidden.current = shouldShow;
        }
      }
    }

    // subtle idle light sweep (explore only)
    const sweep = sweepRef.current;
    if (sweep && view === "explore" && !reducedMotion) {
      const a = cityClockRef.current * 0.25;
      sweep.position.set(
        Math.cos(a) * worldSize * 0.5,
        worldSize * 0.35,
        Math.sin(a) * worldSize * 0.5
      );
    }
  });

  useEffect(() => {
    const roof = roofRef.current;
    if (roof && !reducedMotion) {
      roof.visible = false;
      roofHidden.current = false;
    } else if (roof) {
      roof.visible = true;
    }
  }, [reducedMotion, growNonce, roofDetail]);

  useEffect(() => {
    if (view === "scan") {
      gl.setClearColor(bgColor, 1);
      scene.background = bgColor;
    } else {
      gl.setClearColor(0x000000, 0);
      scene.background = null;
    }
  }, [gl, scene, bgColor, view]);

  // Position the live camera for Explore vs Scan.
  useEffect(() => {
    const cam = camera as THREE.OrthographicCamera;
    const aspect = size.width / Math.max(1, size.height);
    if (view === "scan") {
      cam.position.set(0, worldSize, 0);
      cam.up.set(0, 0, -1);
      cam.lookAt(0, 0, 0);
      cam.left = -halfExtent * aspect;
      cam.right = halfExtent * aspect;
      cam.top = halfExtent;
      cam.bottom = -halfExtent;
      cam.zoom = 1;
    } else {
      cam.position.set(worldSize * 0.72, worldSize * 0.42, worldSize * 0.84);
      cam.up.set(0, 1, 0);
      cam.lookAt(0, 0, 0);
      cam.zoom = size.width < 760 ? 6.6 : 7.7;
    }
    cam.near = 0.1;
    cam.far = worldSize * 6;
    cam.updateProjectionMatrix();
  }, [camera, view, worldSize, halfExtent, size.width, size.height]);

  // On an export request: render one deterministic top-down frame with a
  // dedicated square orthographic camera, capture, then notify.
  useEffect(() => {
    if (exportSignal === 0) return;

    // Force the growth wave to completion so the export silhouette reflects the
    // real building heights, not a mid-animation frame.
    const mesh = meshRef.current;
    if (mesh) {
      growRef.current = 1;
      for (let i = 0; i < cells.length; i++) {
        const h = cityBuildingHeight(cells[i], heights[i], worldSize, true);
        _cityDummy.position.set(cells[i].x, h / 2, cells[i].z);
        _cityDummy.scale.set(BUILDING_WIDTH, h, BUILDING_WIDTH);
        _cityDummy.updateMatrix();
        mesh.setMatrixAt(i, _cityDummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (roofRef.current) roofRef.current.visible = roofDetail;

    const EXPORT_PX = 900;
    const prevSize = new THREE.Vector2();
    gl.getSize(prevSize);
    const prevPixelRatio = gl.getPixelRatio();
    const prevAutoClear = gl.autoClear;
    const prevMaterialColor =
      mesh?.material instanceof THREE.MeshBasicMaterial
        ? mesh.material.color.clone()
        : null;

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
    exportCamRef.current = cam;

    gl.setPixelRatio(1);
    gl.setSize(EXPORT_PX, EXPORT_PX, false);
    gl.setClearColor(bgColor, 1);
    if (mesh?.material instanceof THREE.MeshBasicMaterial) {
      mesh.material.color.copy(fgColor);
    }
    gl.autoClear = true;
    gl.render(scene, cam);

    onExported();

    // Restore the interactive view.
    gl.setPixelRatio(prevPixelRatio);
    gl.setSize(prevSize.x, prevSize.y, false);
    gl.autoClear = prevAutoClear;
    if (prevMaterialColor && mesh?.material instanceof THREE.MeshBasicMaterial) {
      mesh.material.color.copy(prevMaterialColor);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportSignal]);

  return (
    <>
      <ambientLight intensity={view === "scan" ? 0.9 : 2.1} />
      <hemisphereLight args={[0xffffff, 0xd9ded1, view === "scan" ? 0.55 : 1.35]} />
      <directionalLight position={[10, 28, 12]} intensity={view === "scan" ? 0.35 : 1.15} castShadow={false} />
      {/* slow idle light sweep — subtle, explore only (moved in useFrame) */}
      <pointLight
        ref={sweepRef}
        position={[worldSize * 0.5, worldSize * 0.35, 0]}
        intensity={view === "explore" && !reducedMotion ? 0.5 : 0}
        distance={worldSize * 2}
        decay={2}
        color={"#4fd1c5"}
      />

      {/* Ground slab — themed, matte. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[worldSize, worldSize]} />
        <meshStandardMaterial
          color={view === "scan" ? bgColor : new THREE.Color(city.slab ?? slabColor)}
          roughness={0.95}
          metalness={0}
        />
      </mesh>

      {view === "explore" && (
        <instancedMesh
          ref={streetRef}
          args={[undefined, undefined, Math.max(1, model.size * model.size)]}
          frustumCulled={false}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshLambertMaterial vertexColors />
        </instancedMesh>
      )}

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, Math.max(1, cells.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={view === "scan" ? colors.foreground : city.tower[1]} />
      </instancedMesh>

      <instancedMesh
        ref={roofRef}
        args={[undefined, undefined, Math.max(1, cells.length)]}
        frustumCulled={false}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial vertexColors />
      </instancedMesh>

      {view === "explore" && (
        <instancedMesh
          ref={windowRef}
          args={[undefined, undefined, Math.max(1, cells.length * WINDOW_ROWS)]}
          frustumCulled={false}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial vertexColors transparent opacity={0.68} side={THREE.DoubleSide} toneMapped={false} />
        </instancedMesh>
      )}

      {view === "explore" && !reducedMotion && (
        <OrbitControls
          enablePan={false}
          minPolarAngle={0.15}
          maxPolarAngle={Math.PI / 2.2}
          enableDamping
        />
      )}
    </>
  );
}
