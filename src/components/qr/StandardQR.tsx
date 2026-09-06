"use client";

/**
 * StandardQR — flat, high-contrast, canvas-rendered QR.
 *
 * This is the reference renderer. Data modules may be lightly rounded;
 * protected function modules always stay square. Optional centred logo
 * (Standard only, EC must be H, <= 20% area, never covers protected regions).
 */

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { QUIET_ZONE_MODULES } from "@/types/qr";
import { framedSize } from "@/lib/qr";
import {
  rasterizeStandard,
  rasterToImageData,
  type ExportedImage,
} from "@/lib/export";
import type { RendererHandle, RendererProps } from "@/components/qr/types";

export interface StandardQRProps extends RendererProps {
  /** Round the corners of data modules (protected modules stay square). */
  rounded?: boolean;
  /** Logo data URL, or null. Ignored unless model.ec === "H". */
  logoDataUrl?: string | null;
  /** Fraction of QR area the logo covers. Hard-capped at 0.2. */
  logoAreaFraction?: number;
}

const StandardQR = forwardRef<RendererHandle, StandardQRProps>(function StandardQR(
  { model, colors, sizePx, rounded = false, logoDataUrl = null, logoAreaFraction = 0.16, onReady },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const framedModules = useMemo(() => framedSize(model), [model]);
  const logoAllowed = model.ec === "H" && Boolean(logoDataUrl);
  const cappedFraction = Math.min(0.2, Math.max(0.05, logoAreaFraction));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const modulePx = Math.max(1, Math.round((sizePx / model.size) * ratio));
    const edge = modulePx * framedModules;

    canvas.width = edge;
    canvas.height = edge;
    canvas.style.width = `${(edge / ratio).toFixed(1)}px`;
    canvas.style.height = `${(edge / ratio).toFixed(1)}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, edge, edge);

    const offset = QUIET_ZONE_MODULES * modulePx;
    const radius = rounded ? Math.min(modulePx * 0.32, 2) : 0;

    ctx.fillStyle = colors.foreground;
    for (let r = 0; r < model.size; r++) {
      for (let c = 0; c < model.size; c++) {
        if (!model.dark[r][c]) continue;
        const x = offset + c * modulePx;
        const y = offset + r * modulePx;
        if (radius > 0 && !model.protected[r][c]) {
          roundRect(ctx, x, y, modulePx, modulePx, radius);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, modulePx, modulePx);
        }
      }
    }

    // Optional logo — Standard + EC H only, cleared background patch, centred,
    // never larger than 20% of the matrix area and rounded to whole modules.
    if (logoAllowed && logoDataUrl) {
      const matrixEdgePx = modulePx * model.size;
      const maxLogoEdge = Math.sqrt(cappedFraction) * matrixEdgePx;
      const logoModules = Math.max(
        1,
        Math.floor(maxLogoEdge / modulePx)
      );
      const logoEdge = logoModules * modulePx;
      const startModule = Math.floor((model.size - logoModules) / 2);
      const px0 = offset + startModule * modulePx;

      const img = new Image();
      img.onload = () => {
        // Quiet clear zone behind the logo so it can't merge with modules.
        ctx.fillStyle = colors.background;
        ctx.fillRect(px0 - modulePx, px0 - modulePx, logoEdge + modulePx * 2, logoEdge + modulePx * 2);
        ctx.drawImage(img, px0, px0, logoEdge, logoEdge);
        onReady?.();
      };
      img.onerror = () => onReady?.();
      img.src = logoDataUrl;
    } else {
      onReady?.();
    }
  }, [
    model,
    colors.background,
    colors.foreground,
    sizePx,
    framedModules,
    rounded,
    logoAllowed,
    logoDataUrl,
    cappedFraction,
    onReady,
  ]);

  useImperativeHandle(
    ref,
    (): RendererHandle => ({
      canExport: () => true,
      exportImage: async (): Promise<ExportedImage> => {
        // Re-rasterise deterministically off the model (not the on-screen canvas)
        // so export is independent of DPR / CSS sizing. Logo is re-applied.
        const base = rasterizeStandard(model, {
          matrixPx: Math.max(sizePx, 360),
          colors,
        });
        if (!logoAllowed || !logoDataUrl) return base;
        return applyLogoToExport(base, model, colors.background, logoDataUrl, cappedFraction);
      },
    }),
    [model, colors, sizePx, logoAllowed, logoDataUrl, cappedFraction]
  );

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`Standard QR code for ${model.encodedUrl}`}
      style={{ display: "block", imageRendering: "pixelated" }}
    />
  );
});

export default StandardQR;

/* -------------------------------------------------------------------------- */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

async function applyLogoToExport(
  base: ExportedImage,
  model: import("@/types/qr").QRModel,
  background: string,
  logoDataUrl: string,
  cappedFraction: number
): Promise<ExportedImage> {
  const canvas = document.createElement("canvas");
  canvas.width = base.sizePx;
  canvas.height = base.sizePx;
  const ctx = canvas.getContext("2d");
  if (!ctx) return base;

  ctx.putImageData(rasterToImageData(base.raster), 0, 0);

  const framedModules = framedSize(model);
  const modulePx = base.sizePx / framedModules;
  const offset = QUIET_ZONE_MODULES * modulePx;
  const matrixEdgePx = modulePx * model.size;
  const maxLogoEdge = Math.sqrt(cappedFraction) * matrixEdgePx;
  const logoModules = Math.max(1, Math.floor(maxLogoEdge / modulePx));
  const logoEdge = logoModules * modulePx;
  const startModule = Math.floor((model.size - logoModules) / 2);
  const px0 = offset + startModule * modulePx;

  const img = await loadImage(logoDataUrl).catch(() => null);
  if (!img) return base;

  ctx.fillStyle = background;
  ctx.fillRect(
    px0 - modulePx,
    px0 - modulePx,
    logoEdge + modulePx * 2,
    logoEdge + modulePx * 2
  );
  ctx.drawImage(img, px0, px0, logoEdge, logoEdge);

  const out = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    pngDataUrl: canvas.toDataURL("image/png"),
    raster: { data: out.data, width: canvas.width, height: canvas.height },
    sizePx: base.sizePx,
  };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image could not be loaded."));
    img.src = src;
  });
}
