/**
 * LinkForge export helpers.
 *
 * All renderers converge here to produce a downloadable image. The quiet zone
 * (>= 4 modules) is enforced in one place. Nothing decorative is ever drawn
 * inside the quiet zone.
 */

"use client";

import {
  QUIET_ZONE_MODULES,
  type QRColors,
  type QRModel,
  type RasterImage,
} from "@/types/qr";
import { framedSize } from "@/lib/qr";
import { isFinder, scanModuleIsB, type LivingScanColors } from "@/lib/living/scanColors";

/** Options shared by every raster export. */
export interface RasterExportOptions {
  /** Target on-screen size of the *matrix* (excluding quiet zone), in CSS px. */
  matrixPx: number;
  colors: QRColors;
  /**
   * Living only: the verified four-colour scan scheme ({ darkA, darkB, finder,
   * light }). Geometry and quiet-zone rules are unchanged — only fill colours
   * differ. Data-dark modules alternate darkA/darkB by seeded noise.
   */
  scanColors?: LivingScanColors;
  /** Device pixel ratio to bake in. Clamped to [1, 3]. */
  pixelRatio?: number;
}

export interface ExportedImage {
  /** PNG data URL. */
  pngDataUrl: string;
  /** The raster pixels, for immediate verification without a round-trip. */
  raster: RasterImage;
  /** Full canvas edge length in device px (matrix + quiet zone). */
  sizePx: number;
}

/**
 * Build an ImageData from a RasterImage, copying into a fresh ArrayBuffer-backed
 * Uint8ClampedArray so the DOM lib's ImageData overloads accept it regardless of
 * the source array's buffer type.
 */
export function rasterToImageData(raster: RasterImage): ImageData {
  const copy = new Uint8ClampedArray(raster.data.length);
  copy.set(raster.data);
  return new ImageData(copy, raster.width, raster.height);
}

function clampRatio(r: number | undefined): number {
  const v = r ?? (typeof window !== "undefined" ? window.devicePixelRatio : 1);
  return Math.max(1, Math.min(3, Number.isFinite(v) ? v : 1));
}

/**
 * Draw a QRModel as a flat high-contrast matrix onto a fresh canvas, including
 * the quiet zone, and return a PNG plus its pixels.
 *
 * This is the Standard renderer's export path and the deterministic reference
 * every other renderer's export is verified against.
 */
export function rasterizeStandard(
  model: QRModel,
  opts: RasterExportOptions
): ExportedImage {
  const ratio = clampRatio(opts.pixelRatio);
  const framedModules = framedSize(model); // matrix + 2 * quiet zone
  const modulePx = Math.max(
    1,
    Math.round((opts.matrixPx / model.size) * ratio)
  );
  const sizePx = modulePx * framedModules;

  const canvas = document.createElement("canvas");
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable for export.");
  }

  // Background (also fills the quiet zone).
  ctx.fillStyle = opts.scanColors?.light ?? opts.colors.background;
  ctx.fillRect(0, 0, sizePx, sizePx);

  // Dark modules, offset by the quiet zone.
  ctx.fillStyle = opts.colors.foreground;
  const offset = QUIET_ZONE_MODULES * modulePx;
  const sc = opts.scanColors;
  for (let r = 0; r < model.size; r++) {
    for (let c = 0; c < model.size; c++) {
      if (model.dark[r][c]) {
        ctx.fillStyle = sc
          ? isFinder(model.size, r, c)
            ? sc.finder
            : model.protected[r][c]
              ? sc.darkA
              : scanModuleIsB(model, r, c)
                ? sc.darkB
                : sc.darkA
          : opts.colors.foreground;
        ctx.fillRect(offset + c * modulePx, offset + r * modulePx, modulePx, modulePx);
      }
    }
  }

  const imageData = ctx.getImageData(0, 0, sizePx, sizePx);
  return {
    pngDataUrl: canvas.toDataURL("image/png"),
    raster: {
      data: imageData.data,
      width: sizePx,
      height: sizePx,
    },
    sizePx,
  };
}

/**
 * Capture an already-rendered canvas (e.g. a WebGL scan-view frame) into a PNG
 * plus pixels. The caller is responsible for having drawn a correct top-down
 * QR with quiet zone. We read pixels back for verification.
 */
export function captureCanvas(canvas: HTMLCanvasElement): ExportedImage {
  const width = canvas.width;
  const height = canvas.height;

  // Copy into a 2D canvas so we can always read pixels regardless of the
  // source context type (WebGL readback is unreliable after present).
  const scratch = document.createElement("canvas");
  scratch.width = width;
  scratch.height = height;
  const ctx = scratch.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D context unavailable for capture.");
  }
  ctx.drawImage(canvas, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);

  return {
    pngDataUrl: scratch.toDataURL("image/png"),
    raster: { data: imageData.data, width, height },
    sizePx: width,
  };
}

/**
 * Build a standalone SVG string for the Standard renderer. Structure mirrors
 * rasterizeStandard exactly: same module grid, same quiet zone.
 */
export function buildStandardSvg(
  model: QRModel,
  opts: { matrixPx: number; colors: QRColors; rounded?: boolean }
): string {
  const framedModules = framedSize(model);
  const modulePx = opts.matrixPx / model.size;
  const sizePx = modulePx * framedModules;
  const offset = QUIET_ZONE_MODULES * modulePx;
  const radius = opts.rounded ? Math.min(modulePx * 0.32, 2) : 0;

  const rects: string[] = [];
  for (let r = 0; r < model.size; r++) {
    for (let c = 0; c < model.size; c++) {
      if (!model.dark[r][c]) continue;
      const x = offset + c * modulePx;
      const y = offset + r * modulePx;
      // Protected modules always stay square, per the QR Design Engine skill.
      const rx = model.protected[r][c] ? 0 : radius;
      rects.push(
        `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${modulePx.toFixed(
          2
        )}" height="${modulePx.toFixed(2)}"${rx ? ` rx="${rx.toFixed(2)}"` : ""}/>`
      );
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sizePx.toFixed(
      2
    )}" height="${sizePx.toFixed(2)}" viewBox="0 0 ${sizePx.toFixed(
      2
    )} ${sizePx.toFixed(2)}" shape-rendering="crispEdges">`,
    `<rect width="100%" height="100%" fill="${opts.colors.background}"/>`,
    `<g fill="${opts.colors.foreground}">${rects.join("")}</g>`,
    `</svg>`,
  ].join("");
}

/** Trigger a browser download for a data URL / string blob. */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function downloadSvg(svg: string, filename: string): void {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, filename);
  // Revoke on the next tick so the click has been processed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** A filename stem derived from the encoded URL host. */
export function exportStem(model: QRModel): string {
  try {
    const host = new URL(model.encodedUrl).hostname.replace(/^www\./, "");
    return `linkforge-${host.replace(/[^a-z0-9.-]/gi, "-")}`;
  } catch {
    return "linkforge-qr";
  }
}
