/**
 * Shared geometry helpers for the City / Particle renderers.
 * Derives dark-module lists and scan-view framing from a QRModel.
 */

import { QUIET_ZONE_MODULES, type QRModel } from "@/types/qr";
import { hashString, makeRng } from "@/lib/qr";

export interface ModuleCell {
  row: number;
  col: number;
  x: number;
  z: number;
  protected: boolean;
}

/** Cell size = 1 world unit. Dark cells only, centred on the origin. */
export function darkCells(model: QRModel): ModuleCell[] {
  const framed = model.size + QUIET_ZONE_MODULES * 2;
  const half = framed / 2;
  const cells: ModuleCell[] = [];
  for (let r = 0; r < model.size; r++) {
    for (let c = 0; c < model.size; c++) {
      if (!model.dark[r][c]) continue;
      cells.push({
        row: r,
        col: c,
        x: c + QUIET_ZONE_MODULES + 0.5 - half,
        z: r + QUIET_ZONE_MODULES + 0.5 - half,
        protected: model.protected[r][c],
      });
    }
  }
  return cells;
}

/** Full framed side length in world units (matrix + quiet zone). */
export function framedWorldSize(model: QRModel): number {
  return model.size + QUIET_ZONE_MODULES * 2;
}

/**
 * Deterministic per-module height for City. Protected modules are 1.0 with no
 * variation; data modules vary in [0.6, 1.5], seeded by URL + r + c.
 */
export function buildingHeights(model: QRModel): Float32Array {
  const cells = darkCells(model);
  const heights = new Float32Array(cells.length);
  const baseSeed = hashString(model.encodedUrl);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (cell.protected) {
      heights[i] = 1.0;
      continue;
    }
    const rng = makeRng(
      baseSeed ^ ((cell.row + 1) * 73856093) ^ ((cell.col + 1) * 19349663)
    );
    heights[i] = 0.6 + rng() * 0.9;
  }
  return heights;
}

/** Orthographic scan-view half-extent that fits the framed matrix. */
export function scanOrthoHalfExtent(model: QRModel): number {
  return framedWorldSize(model) / 2 + 0.5;
}
