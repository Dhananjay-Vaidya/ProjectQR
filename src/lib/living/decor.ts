/**
 * Ground decoration for the diorama — grass, fallen accent voxels, stones,
 * mini-trees, light poles. Placed ONLY in the outer band + quiet zone, NEVER on
 * protected modules, NEVER inside the central 60% of the QR. Deterministic.
 *
 * Pure data, no three. Consumed as InstancedMeshes by the renderers.
 */

import type { QRModel } from "@/types/qr";
import { QUIET_ZONE_MODULES } from "@/types/qr";
import { buildGenerativeSeed, domainRng } from "@/lib/generativeSeed";
import type { DecorVoxel } from "@/lib/living/treeGen";

export interface CityDecor {
  /** mini trees on light modules in the band: {x,z} of 0.15 trunk + 0.5 cube. */
  miniTrees: [number, number][];
  /** perimeter light poles: {x,z} of a 0.08×1.2 post + warm emissive cube. */
  lightPoles: [number, number][];
}

interface Grid {
  size: number;
  half: number; // framed half
}

function grid(model: QRModel): Grid {
  const framed = model.size + QUIET_ZONE_MODULES * 2;
  return { size: model.size, half: framed / 2 };
}

/** World XZ of a module centre (matrix centred on origin, quiet zone included). */
function cellWorld(g: Grid, r: number, c: number): [number, number] {
  return [
    c + QUIET_ZONE_MODULES + 0.5 - g.half,
    r + QUIET_ZONE_MODULES + 0.5 - g.half,
  ];
}

/** True when (r,c) is in the "allowed band": outer 3 modules of the matrix. */
function inBand(g: Grid, r: number, c: number): boolean {
  const B = 3;
  return (
    r < B || r >= g.size - B || c < B || c >= g.size - B
  );
}

/** True when (r,c) is inside the central 60% of the QR (decor-free). */
function inCenter(g: Grid, r: number, c: number): boolean {
  const lo = g.size * 0.2;
  const hi = g.size * 0.8;
  return r >= lo && r < hi && c >= lo && c < hi;
}

/* -------------------------------------------------------------------------- */

/**
 * Living-tree ground decor: grass on light modules in the band, fallen accent
 * voxels, stones. `lowQuality` roughly halves the counts.
 */
export function generateGroundDecor(
  model: QRModel,
  lowQuality = false
): DecorVoxel[] {
  const g = grid(model);
  const seed = buildGenerativeSeed(model.encodedUrl);
  const rng = domainRng(seed, "motionSeed");
  const out: DecorVoxel[] = [];

  // light modules available for grass
  const lightCells: [number, number][] = [];
  for (let r = 0; r < g.size; r++) {
    for (let c = 0; c < g.size; c++) {
      if (model.dark[r][c]) continue;
      if (model.protected[r][c]) continue;
      if (!inBand(g, r, c)) continue;
      if (inCenter(g, r, c)) continue;
      lightCells.push([r, c]);
    }
  }

  const grassTarget = lowQuality ? 70 : 190;
  const shuffledLight = seededShuffle(lightCells, rng);
  for (let i = 0; i < shuffledLight.length && out.length < grassTarget; i++) {
    const [r, c] = shuffledLight[i];
    const [wx, wz] = cellWorld(g, r, c);
    const blades = 1 + Math.floor(rng() * 3);
    for (let b = 0; b < blades && out.length < grassTarget; b++) {
      out.push({
        x: wx + (rng() - 0.5) * 0.6,
        y: 0.3,
        z: wz + (rng() - 0.5) * 0.6,
        scale: 0.25,
        colorIndex: rng() < 0.5 ? 0 : 1, // grass[0] / grass[1]
        kind: "grass",
      });
    }
  }

  // fallen accent voxels (8–15) at 0.35, near the trunk / inner band
  const fallenCount = 8 + Math.floor(rng() * 8);
  for (let i = 0; i < fallenCount; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 1.5 + rng() * (g.half - 3);
    out.push({
      x: Math.cos(ang) * rad,
      y: 0.18,
      z: Math.sin(ang) * rad,
      scale: 0.35,
      colorIndex: 0,
      kind: "fallen",
    });
  }

  // stones (4–8) at 0.5
  const stoneCount = 4 + Math.floor(rng() * 5);
  for (let i = 0; i < stoneCount; i++) {
    const ang = rng() * Math.PI * 2;
    const rad = 2 + rng() * (g.half - 2.5);
    out.push({
      x: Math.cos(ang) * rad,
      y: 0.25,
      z: Math.sin(ang) * rad,
      scale: 0.5,
      colorIndex: 0,
      kind: "stone",
    });
  }

  return out;
}

/** City ground decor: mini trees on band light modules + perimeter light poles. */
export function generateCityDecor(model: QRModel): CityDecor {
  const g = grid(model);
  const seed = buildGenerativeSeed(model.encodedUrl);
  const rng = domainRng(seed, "motionSeed");

  const miniTrees: [number, number][] = [];
  for (let r = 0; r < g.size; r++) {
    for (let c = 0; c < g.size; c++) {
      if (model.dark[r][c] || model.protected[r][c]) continue;
      if (!inBand(g, r, c) || inCenter(g, r, c)) continue;
      if (rng() < 0.05) miniTrees.push(cellWorld(g, r, c));
    }
  }

  // 8–12 light poles evenly around the perimeter of the slab
  const poleCount = 8 + Math.floor(rng() * 5);
  const lightPoles: [number, number][] = [];
  const edge = g.half - 1.5;
  for (let i = 0; i < poleCount; i++) {
    const t = i / poleCount;
    const ang = t * Math.PI * 2 + rng() * 0.2;
    lightPoles.push([Math.cos(ang) * edge, Math.sin(ang) * edge]);
  }

  return { miniTrees, lightPoles };
}

function seededShuffle<T>(arr: T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
