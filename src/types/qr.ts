/**
 * LinkForge — core QR domain types.
 *
 * The QRModel is the single source of truth for every renderer. Renderers
 * receive a QRModel and never call the QR encoder themselves.
 */

/** Error-correction levels LinkForge exposes. Lower reliability than M is never offered. */
export type ErrorCorrectionLevel = "M" | "Q" | "H";

/** The ordered fallback chain. We only ever move downward from the requested level. */
export const EC_FALLBACK_ORDER: readonly ErrorCorrectionLevel[] = [
  "H",
  "Q",
  "M",
] as const;

export type RendererMode =
  | "standard"
  | "city"
  | "particle"
  | "mosaic"
  | "living";

export const RENDERER_MODES: readonly RendererMode[] = [
  "standard",
  "city",
  "particle",
  "mosaic",
  "living",
] as const;

export const RENDERER_LABELS: Record<RendererMode, string> = {
  standard: "Standard",
  city: "City",
  particle: "Particle",
  mosaic: "Mosaic",
  living: "Living",
};

/** Renderer modes that require a WebGL context. */
export const WEBGL_RENDERER_MODES: readonly RendererMode[] = [
  "city",
  "particle",
  "living",
] as const;

/**
 * The immutable result of encoding one normalized URL.
 *
 * `dark[row][col]`      — true when the module is a dark (data) bit.
 * `protected[row][col]` — true when the module is a function module that must
 *                         remain visually plain: finders, separators, timing,
 *                         alignment, format info, version info, dark module.
 */
export interface QRModel {
  /** Module count per side. size = 21 + 4 * (version - 1). */
  size: number;
  dark: boolean[][];
  protected: boolean[][];
  version: number;
  ec: ErrorCorrectionLevel;
  /** The exact string that was encoded — decode comparison uses this verbatim. */
  encodedUrl: string;
  /** The mask pattern the encoder settled on (diagnostic only). */
  maskPattern: number | undefined;
}

/** Raised when a URL cannot be encoded even at the lowest allowed EC level. */
export class QREncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QREncodeError";
  }
}

/** Result of buildQRModel — carries the model plus whether an EC fallback happened. */
export interface QRBuildResult {
  model: QRModel;
  /** The level the caller asked for. */
  requestedEc: ErrorCorrectionLevel;
  /** True when we had to drop below `requestedEc` to fit the data. */
  didFallback: boolean;
}

/** Colours applied to a rendered / exported QR. UI chrome colours are separate. */
export interface QRColors {
  /** Dark-module colour. Must stay visually dark. */
  foreground: string;
  /** Light-module / quiet-zone colour. Must stay visually light. */
  background: string;
}

export const DEFAULT_QR_COLORS: QRColors = {
  foreground: "#0b0f14",
  background: "#f6f8fb",
};

/** Quiet zone, in modules, preserved on every side of every export. */
export const QUIET_ZONE_MODULES = 4 as const;

/** Standard-mode logo constraints. */
export interface LogoConfig {
  /** Data URL of the uploaded logo, or null when none. */
  dataUrl: string | null;
  /** Fraction of total QR area the logo may cover (hard-capped at 0.2). */
  areaFraction: number;
}

/** Outcome of a jsQR verification pass over an exported image. */
export interface VerificationResult {
  ok: boolean;
  /** Decoded payload, or null when nothing decoded. */
  decoded: string | null;
  /** The URL we expected the decode to equal exactly. */
  expected: string;
  /** Human-readable explanation, always populated. */
  detail: string;
}

/** A rasterised QR image ready to hand to jsQR. */
export interface RasterImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}
