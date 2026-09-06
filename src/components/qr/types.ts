import type { QRColors, QRModel } from "@/types/qr";
import type { ExportedImage } from "@/lib/export";

/** Props every renderer receives. All renderers are given the same QRModel. */
export interface RendererProps {
  model: QRModel;
  colors: QRColors;
  /** On-screen size of the matrix in CSS px (excludes quiet zone). */
  sizePx: number;
  /** The editor's open, responsive presentation; export dimensions stay separate. */
  studioPreview?: boolean;
  /** Called after the renderer mounts / re-renders so the editor can enable export. */
  onReady?: () => void;
}

/**
 * Imperative handle every renderer exposes. `exportImage` must return a strict,
 * top-down, quiet-zone-padded raster suitable for jsQR verification.
 */
export interface RendererHandle {
  exportImage: () => Promise<ExportedImage>;
  /**
   * True when the renderer is in a state that can be safely exported
   * (e.g. Particle assembled, City scan-capable). Standard/Mosaic are always true.
   */
  canExport: () => boolean;
}
