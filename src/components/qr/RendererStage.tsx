"use client";

/**
 * RendererStage — mounts exactly one renderer for the current mode and exposes
 * its imperative export handle. The 3D renderers are lazy-loaded (ssr: false)
 * so the WebGL bundle never ships to the landing page or the server.
 *
 * No wrapper chrome: the diorama canvases are transparent and sit directly on
 * the page's sky gradient. The parent reserves the aspect box (no layout shift).
 * Only one renderer mounts at a time.
 */

import dynamic from "next/dynamic";
import { forwardRef } from "react";
import type { QRColors, QRModel, RendererMode } from "@/types/qr";
import type { RendererHandle } from "@/components/qr/types";
import type { ThemeName } from "@/lib/living/themes";
import type { LeafPaletteName } from "@/lib/living/scanColors";
import StandardQR from "@/components/qr/StandardQR";
import MosaicQR from "@/components/qr/MosaicQR";
import { StageLoader } from "@/components/motion/StageLoader";

const CityQR = dynamic(() => import("@/components/qr/CityQR"), {
  ssr: false,
  loading: () => <StageLoader label="Building the city…" />,
});
const ParticleQR = dynamic(() => import("@/components/qr/ParticleQR"), {
  ssr: false,
  loading: () => <StageLoader label="Gathering particles…" />,
});
const LivingTreeQR = dynamic(() => import("@/components/qr/LivingTreeQR"), {
  ssr: false,
  loading: () => <StageLoader label="Growing the tree…" />,
});

export interface RendererStageProps {
  mode: RendererMode;
  model: QRModel;
  colors: QRColors;
  sizePx: number;
  studioPreview?: boolean;
  onReady?: () => void;
  onWebglError?: (message: string) => void;
  /* shared diorama */
  theme: ThemeName;
  experienceView: "experience" | "scan";
  buildNonce: number;
  onToggleView?: () => void;
  hero?: boolean;
  /* mode-specific */
  standardRounded: boolean;
  logoDataUrl: string | null;
  logoAreaFraction: number;
  cityRoofDetail: boolean;
  particleState: "assembled" | "scattered";
  particleCount: number;
  mosaicImageDataUrl: string | null;
  mosaicSafeMode: boolean;
  leafPalette?: LeafPaletteName;
  customLeafColors?: [string, string, string];
}

const RendererStage = forwardRef<RendererHandle, RendererStageProps>(
  function RendererStage(props, ref) {
    const {
      mode,
      model,
      colors,
      sizePx,
      studioPreview,
      onReady,
      onWebglError,
      theme,
      experienceView,
      buildNonce,
      onToggleView,
      hero,
      standardRounded,
      logoDataUrl,
      logoAreaFraction,
      cityRoofDetail,
      particleState,
      particleCount,
      mosaicImageDataUrl,
      mosaicSafeMode,
      leafPalette,
      customLeafColors,
    } = props;

    switch (mode) {
      case "standard":
        return (
          <StandardQR
            ref={ref}
            model={model}
            colors={colors}
            sizePx={sizePx}
            rounded={standardRounded}
            logoDataUrl={logoDataUrl}
            logoAreaFraction={logoAreaFraction}
            onReady={onReady}
          />
        );
      case "mosaic":
        return (
          <MosaicQR
            ref={ref}
            model={model}
            colors={colors}
            sizePx={sizePx}
            imageDataUrl={mosaicImageDataUrl}
            safeMode={mosaicSafeMode}
            onReady={onReady}
          />
        );
      case "city":
        return (
          <CityQR
            ref={ref}
            model={model}
            colors={colors}
            sizePx={sizePx}
            view={experienceView === "scan" ? "scan" : "explore"}
            roofDetail={cityRoofDetail}
            studioPreview={studioPreview}
            growNonce={buildNonce}
            theme={theme}
            onToggleView={onToggleView}
            onReady={onReady}
            onWebglError={onWebglError}
          />
        );
      case "particle":
        return (
          <ParticleQR
            ref={ref}
            model={model}
            colors={colors}
            sizePx={sizePx}
            state={particleState}
            studioPreview={studioPreview}
            particleCount={particleCount}
            theme={theme}
            experienceView={experienceView}
            onToggleView={onToggleView}
            onReady={onReady}
            onWebglError={onWebglError}
          />
        );
      case "living":
        return (
          <LivingTreeQR
            ref={ref}
            model={model}
            colors={colors}
            sizePx={sizePx}
            view={experienceView}
            studioPreview={studioPreview}
            theme={theme}
            leafPalette={leafPalette}
            customLeafColors={customLeafColors}
            buildNonce={buildNonce}
            hero={hero}
            onToggleView={onToggleView}
            onReady={onReady}
            onWebglError={onWebglError}
          />
        );
    }
  }
);

export default RendererStage;
