"use client";

/**
 * useReveal — the single reveal driver shared by every diorama experience.
 *
 * `target` is 0 (Experience) or 1 (Scan). The returned ref eases toward it over
 * REVEAL_SECONDS with easeInOutCubic; reverse is identical. Under reduced motion
 * it snaps. Read `ref.current` inside useFrame — it never triggers a re-render.
 *
 * A companion `buildRef` drives the first-load build-in (platform tiles rise,
 * then the object grows). It runs 0 → 1 once per mount / buildNonce; the scenes
 * multiply object presence by min(build, 1 - reveal).
 */

import { useEffect, useRef } from "react";
import { audioEngine } from "@/lib/audio/engine";

export const REVEAL_SECONDS = 1.6;
export const BUILD_SECONDS = 1.5; // 0.6 s tiles + 0.9 s object

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function useRevealDriver(
  targetView: "experience" | "scan",
  reducedMotion: boolean
) {
  const revealRef = useRef(targetView === "scan" ? 1 : 0);
  const targetRef = useRef(targetView === "scan" ? 1 : 0);

  useEffect(() => {
    targetRef.current = targetView === "scan" ? 1 : 0;
    if (reducedMotion) revealRef.current = targetRef.current;
  }, [targetView, reducedMotion]);

  /** call once per frame with delta; returns the eased 0..1 value */
  const step = (delta: number): number => {
    const tgt = targetRef.current;
    if (reducedMotion) {
      revealRef.current = tgt;
      audioEngine.setReveal(tgt);
      return tgt;
    }
    const rate = delta / REVEAL_SECONDS;
    const cur = revealRef.current;
    if (Math.abs(tgt - cur) <= rate) revealRef.current = tgt;
    else revealRef.current = cur + Math.sign(tgt - cur) * rate;
    const value = easeInOutCubic(revealRef.current);
    audioEngine.setReveal(value);
    return value;
  };

  return { revealRef, step };
}

export function useBuildDriver(buildNonce: number, reducedMotion: boolean) {
  const buildRef = useRef(reducedMotion ? 1 : 0);

  useEffect(() => {
    buildRef.current = reducedMotion ? 1 : 0;
  }, [buildNonce, reducedMotion]);

  const step = (delta: number): number => {
    if (reducedMotion) {
      buildRef.current = 1;
      return 1;
    }
    if (buildRef.current < 1) {
      buildRef.current = Math.min(1, buildRef.current + delta / BUILD_SECONDS);
    }
    return buildRef.current;
  };

  return { buildRef, step };
}
