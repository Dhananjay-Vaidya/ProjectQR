"use client";

/**
 * MosaicQR — an uploaded image tiled across the QR grid, but luminance-locked.
 *
 * Dark cells  -> tile darkened to <= ~25% luminance.
 * Light cells -> tile lightened to >= ~80% luminance.
 * Protected cells -> solid exact colour, never image.
 * Safe Mode (ON by default) -> also paints a solid inner block on every dark
 * data cell so the binary structure survives aggressive imagery.
 *
 * High risk mode: verification matters most here.
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { QUIET_ZONE_MODULES, type QRModel } from "@/types/qr";
import { framedSize } from "@/lib/qr";
import type { ExportedImage } from "@/lib/export";
import type { RendererHandle, RendererProps } from "@/components/qr/types";

export interface MosaicQRProps extends RendererProps {
  imageDataUrl: string | null;
  safeMode: boolean;
}

const DARK_LUM_MAX = 0.25;
const LIGHT_LUM_MIN = 0.8;

const MosaicQR = forwardRef<RendererHandle, MosaicQRProps>(function MosaicQR(
  { model, colors, sizePx, imageDataUrl, safeMode, onReady },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [imgEl, setImgEl] = useState<HTMLImageElement | null>(null);
  const framedModules = useMemo(() => framedSize(model), [model]);

  // Load / decode the uploaded image.
  useEffect(() => {
    if (!imageDataUrl) {
      setImgEl(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setImgEl(img);
    };
    img.onerror = () => {
      if (!cancelled) setImgEl(null);
    };
    img.src = imageDataUrl;
    return () => {
      cancelled = true;
    };
  }, [imageDataUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const modulePx = Math.max(2, Math.round((sizePx / model.size) * ratio));
    drawMosaic(canvas, model, colors, modulePx, imgEl, safeMode);
    canvas.style.width = `${((modulePx * framedModules) / ratio).toFixed(1)}px`;
    canvas.style.height = `${((modulePx * framedModules) / ratio).toFixed(1)}px`;
    onReady?.();
  }, [model, colors, sizePx, imgEl, safeMode, framedModules, onReady]);

  useImperativeHandle(
    ref,
    (): RendererHandle => ({
      canExport: () => true,
      exportImage: async (): Promise<ExportedImage> => {
        // Deterministic export at a generous module size.
        const modulePx = 12;
        const scratch = document.createElement("canvas");
        drawMosaic(scratch, model, colors, modulePx, imgEl, safeMode);
        const ctx = scratch.getContext("2d")!;
        const out = ctx.getImageData(0, 0, scratch.width, scratch.height);
        return {
          pngDataUrl: scratch.toDataURL("image/png"),
          raster: { data: out.data, width: scratch.width, height: scratch.height },
          sizePx: scratch.width,
        };
      },
    }),
    [model, colors, imgEl, safeMode]
  );

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Mosaic QR code for ${model.encodedUrl}`}
      style={{ display: "block", imageRendering: "pixelated" }}
    />
  );
});

export default MosaicQR;

/* -------------------------------------------------------------------------- */

function drawMosaic(
  canvas: HTMLCanvasElement,
  model: QRModel,
  colors: { foreground: string; background: string },
  modulePx: number,
  img: HTMLImageElement | null,
  safeMode: boolean
) {
  const framedModules = framedSize(model);
  const edge = modulePx * framedModules;
  canvas.width = edge;
  canvas.height = edge;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, edge, edge);

  const offset = QUIET_ZONE_MODULES * modulePx;
  const fg = hexToRgb(colors.foreground);
  const bg = hexToRgb(colors.background);

  // Pre-sample the image into a small offscreen buffer sized to the matrix,
  // so each cell maps to one source pixel. Nothing is drawn in the quiet zone.
  let sample: ImageData | null = null;
  if (img) {
    const s = document.createElement("canvas");
    s.width = model.size;
    s.height = model.size;
    const sctx = s.getContext("2d");
    if (sctx) {
      sctx.drawImage(img, 0, 0, model.size, model.size);
      sample = sctx.getImageData(0, 0, model.size, model.size);
    }
  }

  for (let r = 0; r < model.size; r++) {
    for (let c = 0; c < model.size; c++) {
      const x = offset + c * modulePx;
      const y = offset + r * modulePx;
      const isDark = model.dark[r][c];
      const isProtected = model.protected[r][c];

      if (isProtected) {
        // Protected modules: solid exact colour, no image ever.
        ctx.fillStyle = isDark ? colors.foreground : colors.background;
        ctx.fillRect(x, y, modulePx, modulePx);
        continue;
      }

      let cellColor: [number, number, number];
      if (sample) {
        const i = (r * model.size + c) * 4;
        const sr = sample.data[i];
        const sg = sample.data[i + 1];
        const sb = sample.data[i + 2];
        cellColor = luminanceLock([sr, sg, sb], isDark, fg, bg);
      } else {
        // No image: fall back to flat colours (still a valid QR).
        cellColor = isDark ? fg : bg;
      }

      ctx.fillStyle = `rgb(${cellColor[0]},${cellColor[1]},${cellColor[2]})`;
      ctx.fillRect(x, y, modulePx, modulePx);

      // Safe Mode: solid inner block on dark data cells to guarantee structure.
      if (safeMode && isDark) {
        const inset = Math.max(1, Math.round(modulePx * 0.16));
        ctx.fillStyle = colors.foreground;
        ctx.fillRect(x + inset, y + inset, modulePx - inset * 2, modulePx - inset * 2);
      }
    }
  }
}

/** Force a sampled colour into the reliable luminance band for its cell type. */
function luminanceLock(
  rgb: [number, number, number],
  isDark: boolean,
  fg: [number, number, number],
  bg: [number, number, number]
): [number, number, number] {
  const lum = relLuminance(rgb);
  if (isDark) {
    if (lum <= DARK_LUM_MAX) return rgb;
    // Blend toward foreground until dark enough.
    return blendToTarget(rgb, fg, DARK_LUM_MAX, true);
  }
  if (lum >= LIGHT_LUM_MIN) return rgb;
  return blendToTarget(rgb, bg, LIGHT_LUM_MIN, false);
}

function blendToTarget(
  rgb: [number, number, number],
  target: [number, number, number],
  limit: number,
  wantDarker: boolean
): [number, number, number] {
  let t = 0;
  let out: [number, number, number] = rgb;
  for (let step = 0; step < 12; step++) {
    t += 0.1;
    out = [
      Math.round(rgb[0] + (target[0] - rgb[0]) * t),
      Math.round(rgb[1] + (target[1] - rgb[1]) * t),
      Math.round(rgb[2] + (target[2] - rgb[2]) * t),
    ];
    const lum = relLuminance(out);
    if (wantDarker ? lum <= limit : lum >= limit) break;
  }
  return out;
}

function relLuminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const full =
    m.length === 3
      ? m
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : m;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
