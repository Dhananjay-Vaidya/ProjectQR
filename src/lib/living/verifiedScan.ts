"use client";
import { rasterizeStandard, type ExportedImage } from "@/lib/export";
import { verifyRaster } from "@/lib/verify";
import type { QRModel, VerificationResult } from "@/types/qr";
import type { ThemeName } from "./themes";
import { themedScanColors, type LivingScanColors } from "./scanColors";

export interface VerifiedLivingScan {
  image: ExportedImage;
  colors: LivingScanColors;
  verification: VerificationResult;
  fallback: "none" | "data-ink" | "all-ink";
}

const INK = "#23273A";
const cache = new Map<string, VerifiedLivingScan>();

/**
 * Rasterise the QR with the theme's (or custom-palette's) four-colour scan
 * scheme and require jsQR to decode it exactly. Falls back first to ink data
 * modules (keeping the themed finder if that still decodes), then to all-ink.
 * Throws only if even all-ink fails.
 */
export function verifiedLivingScan(
  model: QRModel,
  theme: ThemeName,
  matrixPx: number,
  pixelRatio = 1,
  tints?: [string, string, string],
): VerifiedLivingScan {
  const key = `${model.encodedUrl}|${model.ec}|${model.maskPattern}|${theme}|${matrixPx}|${pixelRatio}|${tints?.join(",") ?? ""}`;
  const cached = cache.get(key);
  if (cached) {
    cache.delete(key);
    cache.set(key, cached);
    return cached;
  }

  const themed = themedScanColors(theme, tints);
  const candidates: { colors: LivingScanColors; fallback: VerifiedLivingScan["fallback"] }[] = [
    { colors: themed, fallback: "none" },
    { colors: { ...themed, darkA: INK, darkB: INK }, fallback: "data-ink" },
    { colors: { darkA: INK, darkB: INK, finder: INK, light: themed.light }, fallback: "all-ink" },
  ];

  for (const candidate of candidates) {
    const image = rasterizeStandard(model, {
      matrixPx,
      pixelRatio,
      colors: { foreground: candidate.colors.darkA, background: candidate.colors.light },
      scanColors: candidate.colors,
    });
    const verification = verifyRaster(image.raster, model);
    if (!verification.ok) continue;
    const result = { image, verification, ...candidate };
    cache.set(key, result);
    if (cache.size > 16) cache.delete(cache.keys().next().value!);
    return result;
  }

  throw new Error("Living scan failed verification, including the ink fallback. Download is blocked.");
}
