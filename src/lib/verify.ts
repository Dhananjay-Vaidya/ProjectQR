/**
 * LinkForge verification.
 *
 * Every export is passed through jsQR. Success means the decoded payload is
 * EXACTLY the normalized URL we intended to encode — not "some QR was found",
 * not "the decoder returned a non-empty string".
 */

"use client";

import jsQR from "jsqr";
import {
  type QRModel,
  type RasterImage,
  type VerificationResult,
} from "@/types/qr";
import { rasterToImageData } from "@/lib/export";

/** Downscale a raster if it is very large, to keep jsQR fast and reliable. */
function maybeDownscale(raster: RasterImage, maxEdge = 1024): RasterImage {
  if (raster.width <= maxEdge && raster.height <= maxEdge) return raster;

  const scale = maxEdge / Math.max(raster.width, raster.height);
  const w = Math.max(1, Math.round(raster.width * scale));
  const h = Math.max(1, Math.round(raster.height * scale));

  const src = document.createElement("canvas");
  src.width = raster.width;
  src.height = raster.height;
  const sctx = src.getContext("2d");
  if (!sctx) return raster;
  sctx.putImageData(rasterToImageData(raster), 0, 0);

  const dst = document.createElement("canvas");
  dst.width = w;
  dst.height = h;
  const dctx = dst.getContext("2d");
  if (!dctx) return raster;
  // Nearest-neighbour keeps module edges crisp.
  dctx.imageSmoothingEnabled = false;
  dctx.drawImage(src, 0, 0, w, h);
  const out = dctx.getImageData(0, 0, w, h);
  return { data: out.data, width: w, height: h };
}

/**
 * Decode a rasterised export and compare it, exactly, to the model's encoded URL.
 */
export function verifyRaster(
  raster: RasterImage,
  model: QRModel
): VerificationResult {
  const expected = model.encodedUrl;
  const scaled = maybeDownscale(raster);

  let decoded: string | null = null;
  try {
    const result = jsQR(scaled.data, scaled.width, scaled.height, {
      inversionAttempts: "attemptBoth",
    });
    decoded = result?.data ?? null;
  } catch (err) {
    return {
      ok: false,
      decoded: null,
      expected,
      detail: `Decoder threw: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }

  if (decoded === null) {
    return {
      ok: false,
      decoded: null,
      expected,
      detail:
        "Not scannable — jsQR could not locate a QR code in the exported image.",
    };
  }

  if (decoded !== expected) {
    return {
      ok: false,
      decoded,
      expected,
      detail:
        "Not scannable as intended — a QR decoded, but its payload does not match the encoded URL.",
    };
  }

  return {
    ok: true,
    decoded,
    expected,
    detail: "Decoded payload matches the encoded URL exactly.",
  };
}

/** Load a data URL into an ImageData raster (for verifying a PNG round-trip). */
export function rasterFromDataUrl(dataUrl: string): Promise<RasterImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable."));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ data: data.data, width: canvas.width, height: canvas.height });
    };
    img.onerror = () => reject(new Error("Image could not be loaded."));
    img.src = dataUrl;
  });
}

/** Recommendations shown to the user when verification fails. */
export const REMEDIATION_STEPS: readonly string[] = [
  "Restore high contrast between the dark and light colours.",
  "Enable Safe Mode (Mosaic).",
  "Reduce decorative styling / rounding.",
  "Remove the logo, or make it smaller.",
  "Switch to Standard mode for a guaranteed-clean matrix.",
];
