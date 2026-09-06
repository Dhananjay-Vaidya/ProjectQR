"use client";

/**
 * IsoCameraRig — OrthographicCamera locked to an isometric direction, fit from
 * a DioramaStage's bounds so the box fills 72% of viewport height on desktop /
 * 80% on mobile. Refits on resize and on `fitKey` change (mode/theme/url).
 *
 * OrbitControls: no zoom, no pan, elevation clamped 35°–65°, damping on,
 * autoRotate off. Rotation is DISABLED on touch devices (tap = reveal).
 *
 * During the reveal (0→1) the camera direction lerps from isometric
 * (1, 0.82, 1) to straight-down (0, 1, 0) and the azimuth eases to 0 so the
 * platform ends axis-aligned as a square, not a diamond.
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { DioramaStageHandle } from "@/components/three/DioramaStage";

export interface IsoCameraRigProps {
  stageRef: React.RefObject<DioramaStageHandle | null>;
  /** 0 = isometric Experience, 1 = top-down Scan. */
  reveal: number;
  /** Fraction of viewport height the bounds fill. */
  fitDesktop?: number;
  fitMobile?: number;
  /** Change to force a refit (mode / theme / url). */
  fitKey: string;
  objectHeight: number;
  reducedMotion?: boolean;
}

const ISO_DIR = new THREE.Vector3(1, 0.82, 1).normalize();
const TOP_DIR = new THREE.Vector3(0, 1, 0);
const CAM_DISTANCE = 40;

const _dir = new THREE.Vector3();
const _look = new THREE.Vector3();
const _size = new THREE.Vector3();
const _center = new THREE.Vector3();

function isTouch(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(pointer: coarse)").matches ?? false;
}

export function IsoCameraRig({
  stageRef,
  reveal,
  fitDesktop = 0.72,
  fitMobile = 0.8,
  fitKey,
  objectHeight,
  reducedMotion = false,
}: IsoCameraRigProps) {
  const { camera, size, gl } = useThree();
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const orthoRef = useRef(camera as THREE.OrthographicCamera);
  const touch = useMemo(() => isTouch(), []);

  /* recompute zoom to fit the bounds */
  const fit = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const cam = camera as THREE.OrthographicCamera;
    if (!(cam as THREE.OrthographicCamera).isOrthographicCamera) return;

    const box = stage.getSceneBounds();
    box.getSize(_size);
    box.getCenter(_center);

    const aspect = size.width / Math.max(1, size.height);
    const frac = size.width < 760 ? fitMobile : fitDesktop;

    // project the box onto the current view to get needed half-extents
    // (approximate with the box diagonal on each axis for an ortho iso view)
    const viewH = Math.max(_size.y, _size.z) * 1.0 + _size.x * 0.5;
    const viewW = (_size.x + _size.z) * 0.72;

    const halfH = viewH / 2 / frac;
    const halfW = viewW / 2 / frac;
    const half = Math.max(halfH, halfW / aspect);

    cam.left = -half * aspect;
    cam.right = half * aspect;
    cam.top = half;
    cam.bottom = -half;
    cam.near = 0.1;
    cam.far = 400;
    cam.updateProjectionMatrix();
  };

  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, size.width, size.height]);

  useFrame(() => {
    const cam = orthoRef.current;
    const stage = stageRef.current;
    if (!stage) return;
    const box = stage.getSceneBounds();
    box.getCenter(_center);

    // reveal: direction iso → top-down over t in [0.45, 0.85]
    const t = THREE.MathUtils.clamp((reveal - 0.45) / 0.4, 0, 1);
    const e = reducedMotion ? Math.round(t) : t * t * (3 - 2 * t);
    _dir.copy(ISO_DIR).lerp(TOP_DIR, e).normalize();

    // lookAt: object mid in experience → platform centre at scan
    _look.set(_center.x, THREE.MathUtils.lerp(objectHeight * 0.35, 0, e), _center.z);

    cam.position
      .copy(_dir)
      .multiplyScalar(CAM_DISTANCE)
      .add(new THREE.Vector3(_look.x, _look.y, _look.z));
    cam.up.set(0, 1, 0);
    cam.lookAt(_look);
    cam.updateProjectionMatrix();

    const controls = controlsRef.current;
    if (controls) {
      controls.target.copy(_look);
      // ease azimuth to 0 as we approach scan so the platform is axis-aligned
      if (e > 0) {
        const az = controls.getAzimuthalAngle();
        controls.setAzimuthalAngle(az * (1 - e));
      }
      controls.enabled = reveal < 0.05 && !touch ? true : reveal < 0.05;
      controls.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableZoom={false}
      enablePan={false}
      enableRotate={!touch}
      enableDamping
      dampingFactor={0.08}
      // 35°–65° elevation → polar 25°–55° from vertical
      minPolarAngle={THREE.MathUtils.degToRad(25)}
      maxPolarAngle={THREE.MathUtils.degToRad(55)}
      domElement={gl.domElement}
    />
  );
}
