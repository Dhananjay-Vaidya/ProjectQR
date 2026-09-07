import type { ThemeName } from "./themes";
import { THEMES } from "./themes";
import { hashString, makeRng } from "@/lib/qr";
import type { QRModel } from "@/types/qr";

export type LeafPaletteName = "theme" | "multicolour" | "fresh" | "autumn" | "custom";

/**
 * Four-colour scan scheme handed to the verified flat renderer.
 *
 * `darkA` / `darkB` alternate across dark data modules by seeded noise (~50/50);
 * `finder` paints the three finder patterns; `light` fills every light module
 * and the quiet zone. Geometry, quiet zone and protected modules are untouched.
 */
export interface LivingScanColors {
  darkA: string;
  darkB: string;
  finder: string;
  light: string;
}

/** Canopy look tints (light / mid / dark) per theme — bright, presentation only. */
export const LEAF_TINTS: Record<ThemeName, [string, string, string]> = {
  neon: ["#FFD1E8", "#F7A8CF", "#E07FB4"],
  verdant: ["#B9F07A", "#7ED957", "#4EA83A"],
  ember: ["#FFD37A", "#F5A623", "#D9761F"],
};

/** Preset custom-palette rows kept from the existing UI (light / mid / dark). */
export const LEAF_PALETTES: Record<Exclude<LeafPaletteName, "theme" | "custom">, [string, string, string]> = {
  multicolour: ["#A8D86F", "#4EA86E", "#D39B54"],
  fresh: ["#B7DD70", "#65B95A", "#2F7D52"],
  autumn: ["#D7B45D", "#BC7A3D", "#7B5A35"],
};

export function isFinder(size: number, row: number, col: number) {
  return (row < 7 && (col < 7 || col >= size - 7)) || (row >= size - 7 && col < 7);
}

/* ------------------------------------------------------------------ colour maths */

const channels = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
};

const toHex = (rgb: number[]): string =>
  "#" +
  rgb
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0"))
    .join("");

/** Relative luminance (sRGB, WCAG). */
export function luminance(hex: string): number {
  const c = channels(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
}

/** Move a colour toward white by `amount` (0–1). */
export function lighten(hex: string, amount: number): string {
  return toHex(channels(hex).map((v) => v + (255 - v) * amount));
}

/** Move a colour toward black by `amount` (0–1). */
export function darken(hex: string, amount: number): string {
  return toHex(channels(hex).map((v) => v * (1 - amount)));
}

/** Darken until relative luminance ≤ `max` (default 0.30). */
export function darkenToLuminance(hex: string, max = 0.3): string {
  let out = hex;
  let guard = 0;
  while (luminance(out) > max && guard++ < 120) out = darken(out, 0.05);
  return out;
}

/**
 * The spec caps scan-module luminance at 0.30, but 0.30 against #F7F3EA is only
 * ~2.6:1 — jsQR needs more. We darken to ≤ 0.16 (≈ 4:1), which still keeps the
 * theme's hue while decoding reliably.
 */
const SCAN_MAX_LUMINANCE = 0.16;

/** Three canopy tints from one base swatch: lighten 22%, base, darken 18%. */
export function deriveTints(base: string): [string, string, string] {
  return [lighten(base, 0.22), base, darken(base, 0.18)];
}

/** The three look tints in effect, given the theme and the custom-palette state. */
export function resolveLeafTints(
  theme: ThemeName,
  palette: LeafPaletteName,
  custom: [string, string, string],
): [string, string, string] {
  if (palette === "theme") return LEAF_TINTS[theme];
  if (palette === "custom") return custom;
  return LEAF_PALETTES[palette];
}

/**
 * The verified four-colour scan scheme for a theme (optionally overridden by
 * the custom-palette tints). Data modules use the mid and dark leaf tints,
 * each darkened until relative luminance ≤ 0.30; finders use the theme's darker
 * grass colour darkened the same way; light modules are #F7F3EA.
 */
export function themedScanColors(
  theme: ThemeName,
  tints?: [string, string, string],
): LivingScanColors {
  const t = tints ?? LEAF_TINTS[theme];
  return {
    darkA: darkenToLuminance(t[1], SCAN_MAX_LUMINANCE),
    darkB: darkenToLuminance(t[2], SCAN_MAX_LUMINANCE),
    finder: darkenToLuminance(THEMES[theme].grass[1], SCAN_MAX_LUMINANCE),
    light: "#F7F3EA",
  };
}

/**
 * Deterministic ~50/50 A/B choice for a dark data module. Shared by the flat
 * raster export and the 3D flat-render handoff so the two are pixel-identical.
 */
export function scanModuleIsB(model: QRModel, row: number, col: number): boolean {
  const base = hashString(model.encodedUrl) >>> 0;
  const rng = makeRng((base ^ ((row + 1) * 73856093) ^ ((col + 1) * 19349663)) >>> 0);
  return rng() < 0.5;
}
