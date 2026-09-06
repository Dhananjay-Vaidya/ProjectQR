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
const cache = new Map<string, VerifiedLivingScan>();
export function verifiedLivingScan(model: QRModel, theme: ThemeName, matrixPx: number, pixelRatio = 1): VerifiedLivingScan {
    const key = `${model.encodedUrl}|${model.ec}|${model.maskPattern}|${theme}|${matrixPx}|${pixelRatio}`;
    const cached = cache.get(key);
    if (cached) {
        cache.delete(key);
        cache.set(key, cached);
        return cached;
    }
    const themed = themedScanColors(theme);
    const candidates: {
        colors: LivingScanColors;
        fallback: VerifiedLivingScan["fallback"];
    }[] = [
        { colors: themed, fallback: "none" },
        { colors: { ...themed, dark: "#23273A" }, fallback: "data-ink" },
        { colors: { ...themed, dark: "#23273A", finder: "#23273A" }, fallback: "all-ink" },
    ];
    for (const candidate of candidates) {
        const image = rasterizeStandard(model, { matrixPx, pixelRatio, colors: { foreground: candidate.colors.dark, background: candidate.colors.light }, scanColors: candidate.colors });
        const verification = verifyRaster(image.raster, model);
        if (!verification.ok)
            continue;
        const result = { image, verification, ...candidate };
        cache.set(key, result);
        if (cache.size > 12)
            cache.delete(cache.keys().next().value!);
        return result;
    }
    throw new Error("Living scan failed verification, including ink fallback. Download is blocked.");
}
