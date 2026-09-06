"use client";

/**
 * DioramaCanvas — the transparent R3F <Canvas> for every diorama.
 *
 *   - gl { alpha: true }, clear alpha 0, NO scene.background → the page's own
 *     sky gradient IS the stage. No canvas rectangle is ever visible.
 *   - OrthographicCamera default (the iso rig takes it over).
 *   - Controlled DPR from the quality profile (≤ 1.5 on the hero).
 *   - Mounts the shared DioramaLights. No fog, no grid, no post.
 *   - A bottom-centre HTML overlay hint ("Tap to reveal QR" / "Tap to return"),
 *     small, fades after 3 s — real DOM, not WebGL text.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { DioramaLights } from "@/components/three/DioramaLights";
import type { QualityProfile } from "@/lib/renderQuality";

interface DioramaCanvasProps {
  children: ReactNode;
  quality: QualityProfile;
  ariaLabel: string;
  /** aspect box is reserved by the parent; this just fills it */
  onReady?: () => void;
  onWebglError?: (message: string) => void;
  /** tap toggles Experience ⇄ Scan */
  onToggle?: () => void;
  /** current view — drives the hint text */
  view: "experience" | "scan";
  hero?: boolean;
  interactiveHint?: boolean;
}

export function DioramaCanvas({
  children,
  quality,
  ariaLabel,
  onReady,
  onWebglError,
  onToggle,
  view,
  hero = false,
  interactiveHint = true,
}: DioramaCanvasProps) {
  const [hintVisible, setHintVisible] = useState(interactiveHint);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!interactiveHint) return;
    setHintVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setHintVisible(false), 3000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [view, interactiveHint]);

  const dpr: [number, number] = hero
    ? [1, Math.min(1.5, quality.dpr[1])]
    : quality.dpr;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        orthographic
        dpr={dpr}
        gl={{
          alpha: true,
          antialias: quality.tier !== "low",
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        }}
        camera={{ position: [30, 25, 30], zoom: 1, near: 0.1, far: 400 }}
        style={{ touchAction: "pan-y", cursor: onToggle ? "pointer" : "default" }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor(new THREE.Color("#000000"), 0);
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.35;
          scene.background = null;
          onReady?.();
        }}
        onError={() =>
          onWebglError?.(
            "3D rendering is unavailable on this device. Standard QR mode has been enabled."
          )
        }
        onPointerMissed={onToggle}
        aria-label={ariaLabel}
      >
        <DioramaLights />
        {children}
      </Canvas>

      {interactiveHint && onToggle ? (
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: "50%",
            bottom: 10,
            transform: "translateX(-50%)",
            fontFamily: "var(--font-display), sans-serif",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--lf-muted)",
            background: "color-mix(in srgb, var(--lf-panel-bg) 82%, transparent)",
            border: "1px solid var(--lf-hairline)",
            borderRadius: 999,
            padding: "4px 12px",
            opacity: hintVisible ? 1 : 0,
            transition: "opacity 400ms ease",
            pointerEvents: "none",
          }}
        >
          {view === "experience" ? "Tap to reveal QR" : "Tap to return"}
        </div>
      ) : null}
    </div>
  );
}
