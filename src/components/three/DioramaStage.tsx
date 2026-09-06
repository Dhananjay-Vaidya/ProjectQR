"use client";

/**
 * DioramaStage — the generic display case every 3D experience sits in.
 *
 * Builds, centred at the origin with the top surface at y = 0:
 *   - Slab:    box (size + 8) × 0.6 × (size + 8)  (QR + 4-module quiet zone).
 *   - Terrain: one InstancedMesh of size×size tiles, scale 0.96 so seams read.
 *              light module 1×0.2×1 = theme.light, dark 1×0.5×1 = theme.dark.
 *              Protected modules use EXACT theme colours, no variation ever.
 *              Quiet-zone area is plain slab — no tiles.
 *   - <ContactShadows> under the platform (no shadow maps).
 *   - Children (the object) render with origin at platform centre, base at y=0.5.
 *
 * The `reveal` prop (0 = Experience, 1 = Scan) drives the shared collapse:
 *   the object retracts (child-managed), then this stage lerps tile/slab colours
 *   to the editor fg/bg, drops tile + slab heights to 0, and hands the frame to
 *   the caller's scan-safe QR path at reveal = 1 (children render nothing then).
 *
 * getSceneBounds() → Box3 of platform + object, for camera fit. Future object
 * types (Crystal, Portal, Planet, Garden) reuse this unchanged.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";
import type { QRModel } from "@/types/qr";
import { QUIET_ZONE_MODULES } from "@/types/qr";
import type { DioramaTheme } from "@/lib/living/themes";

export interface DioramaStageHandle {
  /** Box3 of platform + declared object bounds, in world space. */
  getSceneBounds: () => THREE.Box3;
}

export interface DioramaStageProps {
  qr: QRModel;
  theme: DioramaTheme;
  /** 0 = Experience, 1 = Scan. Drives the shared collapse. */
  reveal: number;
  /** Editor fg/bg the tiles lerp to during the reveal. */
  /** Extra world height the object occupies above y=0 (for camera fit + bounds). */
  objectHeight: number;
  /** Extra XZ radius the object occupies (e.g. particle scatter sphere). */
  objectRadius?: number;
  children?: ReactNode;
  /** Hero uses lighter ContactShadows. */
  hero?: boolean;
}

const _box = new THREE.Box3();
const _tileDummy = new THREE.Object3D();

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const DioramaStage = forwardRef<DioramaStageHandle, DioramaStageProps>(
  function DioramaStage(
    {
      qr,
      theme,
      reveal,

      objectHeight,
      objectRadius = 0,
      children,
      hero = false,
    },
    ref
  ) {
    const size = qr.size;
    const slabSide = size + QUIET_ZONE_MODULES * 2;
    const halfMatrix = size / 2;

    const darkRef = useRef<THREE.InstancedMesh | null>(null);
    const lightRef = useRef<THREE.InstancedMesh | null>(null);
    const slabRef = useRef<THREE.Mesh | null>(null);
    const rootRef = useRef<THREE.Group | null>(null);

    // dark cells lookup (for tile height + camera fit)
    const cellMeta = useMemo(() => {
      const arr: { x: number; z: number; dark: boolean; prot: boolean }[] = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          arr.push({
            x: c + 0.5 - halfMatrix,
            z: r + 0.5 - halfMatrix,
            dark: qr.dark[r][c],
            prot: qr.protected[r][c],
          });
        }
      }
      return arr;
    }, [qr, size, halfMatrix]);


    // separate index lists so each tile mesh uses ONE plain themed material
    // colour (per-instance instanceColor did not wire the shader in three@0.185).
    const darkIdx = useMemo(
      () => cellMeta.map((m, i) => (m.dark ? i : -1)).filter((i) => i >= 0),
      [cellMeta]
    );
    const lightIdx = useMemo(
      () => cellMeta.map((m, i) => (!m.dark ? i : -1)).filter((i) => i >= 0),
      [cellMeta]
    );

    /* populate matrices once per qr; heights animate during the reveal */
    useEffect(() => {
      const write = (
        mesh: THREE.InstancedMesh | null,
        idx: number[],
        h: number
      ) => {
        if (!mesh) return;
        for (let k = 0; k < idx.length; k++) {
          const m = cellMeta[idx[k]];
          _tileDummy.position.set(m.x, h / 2, m.z);
          _tileDummy.scale.set(0.96, Math.max(0.001, h), 0.96);
          _tileDummy.rotation.set(0, 0, 0);
          _tileDummy.updateMatrix();
          mesh.setMatrixAt(k, _tileDummy.matrix);
        }
        mesh.count = idx.length;
        mesh.instanceMatrix.needsUpdate = true;
      };
      write(darkRef.current, darkIdx, 0.5);
      write(lightRef.current, lightIdx, 0.2);
    }, [cellMeta, darkIdx, lightIdx]);

    /* reveal: from r > 0.55 the dark tiles ease down to a flat plate so the
       matrix reads as a clean top-down QR. theme.dark on theme.light is already
       a high-contrast, scannable pair; the export path recolours separately. */
    const lastFlattenRef = useRef(-1);
    useFrame(() => {
      const dm = darkRef.current;
      const lm = lightRef.current;
      const r = reveal;

      const flattenT = THREE.MathUtils.clamp((r - 0.55) / 0.35, 0, 1);
      if (flattenT !== lastFlattenRef.current) {
        const e = easeInOutCubic(flattenT);
        const relayer = (
          mesh: THREE.InstancedMesh | null,
          idx: number[],
          baseH: number,
          flatH: number
        ) => {
          if (!mesh) return;
          const h = THREE.MathUtils.lerp(baseH, flatH, e);
          for (let k = 0; k < idx.length; k++) {
            const m = cellMeta[idx[k]];
            _tileDummy.position.set(m.x, h / 2, m.z);
            _tileDummy.scale.set(0.96, Math.max(0.001, h), 0.96);
            _tileDummy.updateMatrix();
            mesh.setMatrixAt(k, _tileDummy.matrix);
          }
          mesh.instanceMatrix.needsUpdate = true;
        };
        relayer(dm, darkIdx, 0.5, 0.14);
        relayer(lm, lightIdx, 0.2, 0.12);
        lastFlattenRef.current = flattenT;
      }

      const slab = slabRef.current;
      if (slab) {
        const raiseT = flattenT;
        slab.position.y = -0.3 - raiseT * 0.05;
      }

      const root = rootRef.current;
      if (root) root.visible = r < 0.999;
    });

    useImperativeHandle(
      ref,
      (): DioramaStageHandle => ({
        getSceneBounds: () => {
          _box.makeEmpty();
          // platform
          _box.expandByPoint(
            new THREE.Vector3(-slabSide / 2, -0.6, -slabSide / 2)
          );
          _box.expandByPoint(new THREE.Vector3(slabSide / 2, 0, slabSide / 2));
          // object
          const rad = Math.max(objectRadius, halfMatrix * 0.4);
          _box.expandByPoint(new THREE.Vector3(-rad, 0, -rad));
          _box.expandByPoint(
            new THREE.Vector3(rad, Math.max(objectHeight, 1), rad)
          );
          return _box.clone();
        },
      }),
      [slabSide, halfMatrix, objectHeight, objectRadius]
    );

    return (
      <group ref={rootRef}>
        {/* Slab: QR size + quiet zone on every side. Top surface at y = 0. */}
        <mesh ref={slabRef} position={[0, -0.3, 0]}>
          <boxGeometry args={[slabSide, 0.6, slabSide]} />
          <meshStandardMaterial
            color={theme.slab}
            roughness={0.9}
            metalness={0}
            flatShading
          />
        </mesh>

        {/* Terrain — two plain-coloured instanced meshes (dark / light tiles).
            Protected modules use the exact theme colour; the ±6% jitter on data
            tiles was dropped with the per-instance colour path. */}
        <instancedMesh
          key={`dark-${theme.dark}`}
          ref={darkRef}
          args={[undefined, undefined, Math.max(1, darkIdx.length)]}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={theme.dark} roughness={0.85} metalness={0} />
        </instancedMesh>
        <instancedMesh
          key={`light-${theme.light}`}
          ref={lightRef}
          args={[undefined, undefined, Math.max(1, lightIdx.length)]}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial color={theme.light} roughness={0.85} metalness={0} />
        </instancedMesh>

        {/* The object. Base sits at y = 0.5 (on top of the tiles). */}
        <group position={[0, 0.5, 0]}>{children}</group>

        <ContactShadows
          position={[0, -0.01, 0]}
          scale={slabSide * 1.15}
          blur={hero ? 1 : 2.5}
          opacity={hero ? 0.28 : 0.35}
          resolution={512}
          far={12}
          frames={reveal > 0 && reveal < 1 ? Infinity : 1}
        />
      </group>
    );
  }
);
