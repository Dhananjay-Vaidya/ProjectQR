/**
 * LinkForge editor store.
 *
 * Holds the raw URL, validation state, the derived QRModel, renderer selection,
 * colours, and mode-specific config. The QRModel is rebuilt here — in exactly
 * one place — whenever the URL or EC level changes.
 */

"use client";

import { create } from "zustand";
import {
  DEFAULT_QR_COLORS,
  QREncodeError,
  type ErrorCorrectionLevel,
  type LogoConfig,
  type QRColors,
  type QRModel,
  type RendererMode,
  type VerificationResult,
} from "@/types/qr";
import { buildQRModel, validateUrl } from "@/lib/qr";
import { DEFAULT_THEME, type ThemeName } from "@/lib/living/themes";
import type { LeafPaletteName } from "@/lib/living/scanColors";

/** Export resolution, replaces the old on-screen preview-size slider. */
export type ExportResolution = 1024 | 2048 | 4096;

/** The one shared reveal driver: Experience ⇄ Scan for every diorama. */
export type ExperienceView = "experience" | "scan";

export interface CityConfig {
  /** Explore (orbit) vs Scan (orthographic top-down). Export always uses scan. */
  view: "explore" | "scan";
  /** Roof decoration on non-protected buildings. */
  roofDetail: boolean;
  /** Nonce that replays the city-growth wave. Identity is unchanged. */
  growNonce: number;
}

export interface ParticleConfig {
  /** assembled = readable QR; scattered = preview cloud. Export forces assembled. */
  state: "assembled" | "scattered";
  particleCount: number;
}

export interface MosaicConfig {
  /** Safe Mode draws solid inner module geometry. ON by default. */
  safeMode: boolean;
  imageDataUrl: string | null;
  imageError: string | null;
}

export interface LivingConfig {
  /** Experience = orbitable procedural tree. Scan = orthographic top-down QR. */
  view: "experience" | "scan";
  /**
   * Nonce that forces the grow animation to replay. The tree's IDENTITY comes
   * from the URL; this only re-triggers the reveal.
   */
  growNonce: number;
  /** Foliage intensity multiplier, 0.4 – 1.3. Cosmetic only, not identity. */
  foliageIntensity: number;
  /** Cosmetic canopy palette. Scan/export contrast remains theme-verified. */
  leafPalette: LeafPaletteName;
  /** User-selected canopy colours used when leafPalette is "custom". */
  customLeafColors: [string, string, string];
}

export interface EditorState {
  /* ---- input ---- */
  rawUrl: string;
  normalizedUrl: string;
  urlError: string | null;

  /* ---- derived model ---- */
  model: QRModel | null;
  ecRequested: ErrorCorrectionLevel;
  ecEffective: ErrorCorrectionLevel | null;
  didEcFallback: boolean;
  buildError: string | null;

  /* ---- presentation ---- */
  renderer: RendererMode;
  colors: QRColors;
  /** On-screen matrix size in CSS px (NOT module count). */
  renderSizePx: number;
  /** Standard renderer: round data modules (protected modules stay square). */
  standardRounded: boolean;

  /* ---- diorama (shared across Living / City / Particle) ---- */
  /** Presentation theme — never affects geometry. */
  theme: ThemeName;
  /** The one reveal state: "experience" (0) or "scan" (1). */
  experienceView: ExperienceView;
  /** Bump to replay the build-in animation. Identity is unchanged. */
  buildNonce: number;
  /** Export PNG resolution. */
  exportResolution: ExportResolution;

  /* ---- mode-specific ---- */
  city: CityConfig;
  particle: ParticleConfig;
  mosaic: MosaicConfig;
  living: LivingConfig;
  logo: LogoConfig;

  /* ---- webgl ---- */
  webglAvailable: boolean;
  webglNotice: string | null;

  /* ---- verification ---- */
  lastVerification: VerificationResult | null;

  /* ---- actions ---- */
  setRawUrl: (value: string) => void;
  commitUrl: () => void;
  setEc: (ec: ErrorCorrectionLevel) => void;
  setRenderer: (renderer: RendererMode) => void;
  setColors: (colors: Partial<QRColors>) => void;
  resetColors: () => void;
  setRenderSizePx: (px: number) => void;
  setStandardRounded: (rounded: boolean) => void;
  setTheme: (theme: ThemeName) => void;
  setExperienceView: (view: ExperienceView) => void;
  toggleExperienceView: () => void;
  replayBuild: () => void;
  setExportResolution: (res: ExportResolution) => void;
  setCity: (patch: Partial<Omit<CityConfig, "growNonce">>) => void;
  regrowCity: () => void;
  setParticle: (patch: Partial<ParticleConfig>) => void;
  setMosaic: (patch: Partial<MosaicConfig>) => void;
  setLiving: (patch: Partial<Omit<LivingConfig, "growNonce">>) => void;
  regrowLiving: () => void;
  setLogo: (patch: Partial<LogoConfig>) => void;
  reportWebglFailure: (message: string) => void;
  setVerification: (result: VerificationResult | null) => void;
}

const DEFAULT_URL = "https://linkforge.app/demo";

function rebuild(
  normalizedUrl: string,
  ecRequested: ErrorCorrectionLevel
): Pick<
  EditorState,
  "model" | "ecEffective" | "didEcFallback" | "buildError"
> {
  if (!normalizedUrl) {
    return {
      model: null,
      ecEffective: null,
      didEcFallback: false,
      buildError: null,
    };
  }
  try {
    const { model, didFallback } = buildQRModel(normalizedUrl, ecRequested);
    return {
      model,
      ecEffective: model.ec,
      didEcFallback: didFallback,
      buildError: null,
    };
  } catch (err) {
    const message =
      err instanceof QREncodeError
        ? err.message
        : "Could not build a QR code for this URL.";
    return {
      model: null,
      ecEffective: null,
      didEcFallback: false,
      buildError: message,
    };
  }
}

const initialValidation = validateUrl(DEFAULT_URL);
const initialBuild = rebuild(initialValidation.url, "H");

export const useEditorStore = create<EditorState>((set, get) => ({
  rawUrl: DEFAULT_URL,
  normalizedUrl: initialValidation.url,
  urlError: initialValidation.error,

  model: initialBuild.model,
  ecRequested: "H",
  ecEffective: initialBuild.ecEffective,
  didEcFallback: initialBuild.didEcFallback,
  buildError: initialBuild.buildError,

  renderer: "living",
  colors: { ...DEFAULT_QR_COLORS },
  renderSizePx: 420,
  standardRounded: false,

  theme: DEFAULT_THEME,
  experienceView: "experience",
  buildNonce: 0,
  exportResolution: 2048,

  city: { view: "explore", roofDetail: true, growNonce: 0 },
  particle: { state: "assembled", particleCount: 8000 },
  mosaic: { safeMode: true, imageDataUrl: null, imageError: null },
  living: {
    view: "experience",
    growNonce: 0,
    foliageIntensity: 1,
    leafPalette: "theme",
    customLeafColors: ["#a8d86f", "#4ea86e", "#d39b54"],
  },
  logo: { dataUrl: null, areaFraction: 0.16 },

  webglAvailable: true,
  webglNotice: null,

  lastVerification: null,

  setRawUrl: (value) => set({ rawUrl: value }),

  commitUrl: () => {
    const { rawUrl, ecRequested } = get();
    const validation = validateUrl(rawUrl);
    if (!validation.ok) {
      // Keep any previously valid model on screen; just surface the error.
      set({ urlError: validation.error });
      return;
    }
    set({
      urlError: null,
      normalizedUrl: validation.url,
      lastVerification: null,
      ...rebuild(validation.url, ecRequested),
    });
  },

  setEc: (ec) => {
    const { normalizedUrl } = get();
    set({
      ecRequested: ec,
      lastVerification: null,
      ...rebuild(normalizedUrl, ec),
    });
  },

  setRenderer: (renderer) => set({ renderer, lastVerification: null }),

  setColors: (patch) =>
    set((s) => ({
      colors: { ...s.colors, ...patch },
      lastVerification: null,
    })),

  resetColors: () =>
    set({ colors: { ...DEFAULT_QR_COLORS }, lastVerification: null }),

  setRenderSizePx: (px) =>
    set({ renderSizePx: Math.max(200, Math.min(720, Math.round(px))) }),

  setStandardRounded: (rounded) =>
    set({ standardRounded: rounded, lastVerification: null }),

  setTheme: (theme) => set({ theme }),

  setExperienceView: (view) =>
    set({ experienceView: view, lastVerification: null }),

  toggleExperienceView: () =>
    set((s) => ({
      experienceView:
        s.experienceView === "experience" ? "scan" : "experience",
      lastVerification: null,
    })),

  replayBuild: () => set((s) => ({ buildNonce: s.buildNonce + 1 })),

  setExportResolution: (res) => set({ exportResolution: res }),

  setCity: (patch) => set((s) => ({ city: { ...s.city, ...patch } })),

  regrowCity: () =>
    set((s) => ({ city: { ...s.city, growNonce: s.city.growNonce + 1 } })),

  setParticle: (patch) =>
    set((s) => ({ particle: { ...s.particle, ...patch } })),

  setMosaic: (patch) => set((s) => ({ mosaic: { ...s.mosaic, ...patch } })),

  setLiving: (patch) =>
    set((s) => ({
      living: {
        ...s.living,
        ...patch,
        foliageIntensity: Math.max(
          0.4,
          Math.min(1.3, patch.foliageIntensity ?? s.living.foliageIntensity)
        ),
      },
      // Switching only the VIEW must never regenerate the tree; growNonce is
      // untouched here, and generation is keyed on the URL, not the view.
    })),

  regrowLiving: () =>
    set((s) => ({ living: { ...s.living, growNonce: s.living.growNonce + 1 } })),

  setLogo: (patch) =>
    set((s) => ({
      logo: {
        ...s.logo,
        ...patch,
        areaFraction: Math.min(
          0.2,
          Math.max(0.05, patch.areaFraction ?? s.logo.areaFraction)
        ),
      },
      lastVerification: null,
    })),

  reportWebglFailure: (message) =>
    set({
      webglAvailable: false,
      webglNotice: message,
      renderer: "standard",
    }),

  setVerification: (result) => set({ lastVerification: result }),
}));
