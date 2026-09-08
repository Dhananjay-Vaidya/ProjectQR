/**
 * URL-seeded "living model" of the city. Pure data — no three, no per-frame
 * state. The renderer turns this into InstancedMeshes and animates traffic /
 * birds / plane in useFrame.
 *
 * Module space: row r, col c in [0, size). World: x = c + 0.5 - size/2,
 * z = r + 0.5 - size/2. The 4-module quiet zone is bare slab.
 */

import { buildGenerativeSeed, domainRng } from "@/lib/generativeSeed";
import type { QRModel } from "@/types/qr";
import { QUIET_ZONE_MODULES } from "@/types/qr";

export const FLOOR_UNITS = 0.35; // matches the window-shader floor pitch
export const BUILDING_WIDTH = 0.86;

export type BuildingClass = "low" | "mid" | "tall" | "landmark" | "protected";
export type RoofKind = "none" | "setback" | "hvac" | "spire";

export interface CityBuilding {
  x: number;
  z: number;
  /** World span on X / Z (merged buildings are wider on their row axis). */
  spanX: number;
  spanZ: number;
  floors: number;
  height: number;
  klass: BuildingClass;
  toneIndex: number;
  seed: number;
  roof: RoofKind;
  antenna: boolean;
  watertank: boolean;
}

export interface PlazaProp {
  x: number;
  z: number;
  kind: "tree" | "bench";
  rot: number;
}

export interface StreetTile {
  x: number;
  z: number;
  dash: boolean;
}

export interface StreetRun {
  axis: "h" | "v";
  /** World endpoints (centre line). */
  ax: number;
  az: number;
  bx: number;
  bz: number;
  length: number;
}

export interface CityModel {
  size: number;
  worldSize: number;
  buildings: CityBuilding[];
  streetTiles: StreetTile[];
  plazaTiles: { x: number; z: number }[];
  runs: StreetRun[];
  props: PlazaProp[];
  lamps: { x: number; z: number }[];
  maxHeight: number;
  cars: { run: number; t: number; dir: 1 | -1; lane: number; color: number; speed: number }[];
  birds: { count: number; radius: number; altitude: number; lapSeconds: number; phases: number[]; flockTimer: number; flockEdge: number };
  plane: { angle: number; altitude: number; speed: number; firstDelay: number; nextDelay: number };
}

const TAU = Math.PI * 2;

export function generateCity(model: QRModel, mobile = false): CityModel {
  const size = model.size;
  const worldSize = size + QUIET_ZONE_MODULES * 2;
  const seed = buildGenerativeSeed(model.encodedUrl);
  const bRng = domainRng(seed, "branchSeed"); // buildings
  const sRng = domainRng(seed, "shapeSeed"); // streets + props
  const mRng = domainRng(seed, "motionSeed"); // routes
  const wx = (c: number) => c + 0.5 - size / 2;
  const wz = (r: number) => r + 0.5 - size / 2;

  const light = (r: number, c: number) => !model.dark[r][c] && !model.protected[r][c];
  const dataDark = (r: number, c: number) => model.dark[r][c] && !model.protected[r][c];

  /* ---- streets: straight runs (>= 3) of light modules ---- */
  const streetKey = new Set<number>();
  const runs: StreetRun[] = [];
  const key = (r: number, c: number) => r * size + c;
  const scanRuns = (axis: "h" | "v") => {
    const outer = size;
    for (let a = 0; a < outer; a++) {
      let start = -1;
      for (let b = 0; b <= size; b++) {
        const r = axis === "h" ? a : b;
        const c = axis === "h" ? b : a;
        const ok = b < size && light(r, c);
        if (ok && start < 0) start = b;
        if (!ok && start >= 0) {
          const len = b - start;
          if (len >= 3) {
            for (let k = start; k < b; k++) streetKey.add(axis === "h" ? key(a, k) : key(k, a));
            runs.push(
              axis === "h"
                ? { axis, ax: wx(start), az: wz(a), bx: wx(b - 1), bz: wz(a), length: len }
                : { axis, ax: wx(a), az: wz(start), bx: wx(a), bz: wz(b - 1), length: len },
            );
          }
          start = -1;
        }
      }
    }
  };
  scanRuns("h");
  scanRuns("v");

  /* ---- ground tiles ---- */
  const streetTiles: StreetTile[] = [];
  const plazaTiles: { x: number; z: number }[] = [];
  const props: PlazaProp[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!light(r, c)) continue;
      if (streetKey.has(key(r, c))) {
        streetTiles.push({ x: wx(c), z: wz(r), dash: (r + c) % 2 === 0 });
      } else {
        plazaTiles.push({ x: wx(c), z: wz(r) });
        if (sRng() < 0.25) props.push({ x: wx(c), z: wz(r), kind: "tree", rot: sRng() * TAU });
        else if (sRng() < 0.1 / 0.75) props.push({ x: wx(c), z: wz(r), kind: "bench", rot: sRng() * TAU });
      }
    }
  }

  /* ---- buildings: dark data modules, with 25% row merges ---- */
  const buildings: CityBuilding[] = [];
  const consumed = new Set<number>();
  const profile = (): { klass: BuildingClass; floors: number } => {
    const roll = bRng();
    if (roll < 0.55) return { klass: "low", floors: 1 + Math.floor(bRng() * 2) };
    if (roll < 0.85) return { klass: "mid", floors: 3 + Math.floor(bRng() * 4) };
    if (roll < 0.95) return { klass: "tall", floors: 7 + Math.floor(bRng() * 5) };
    return { klass: "landmark", floors: 12 + Math.floor(bRng() * 4) };
  };
  const roofFor = (klass: BuildingClass): RoofKind => {
    if (klass === "landmark") return "spire";
    if (klass === "mid" || klass === "tall") return bRng() < 0.5 ? "setback" : "hvac";
    return "none";
  };

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!dataDark(r, c) || consumed.has(key(r, c))) continue;
      // try a horizontal merge of 2–3
      let run = 1;
      while (run < 3 && c + run < size && dataDark(r, c + run) && !consumed.has(key(r, c + run))) run++;
      const merge = run >= 2 && bRng() < 0.25 ? run : 1;
      for (let k = 0; k < merge; k++) consumed.add(key(r, c + k));
      const { klass, floors } = profile();
      const cx = wx(c) + (merge - 1) * 0.5;
      buildings.push({
        x: cx,
        z: wz(r),
        spanX: merge - (1 - BUILDING_WIDTH),
        spanZ: BUILDING_WIDTH,
        floors,
        height: Math.max(FLOOR_UNITS, floors * FLOOR_UNITS),
        klass,
        toneIndex: Math.floor(bRng() * 3),
        seed: Math.floor(bRng() * 1e6),
        roof: roofFor(klass),
        antenna: (klass === "mid" || klass === "tall" || klass === "landmark") && bRng() < 0.2,
        watertank: (klass === "mid" || klass === "tall") && bRng() < 0.1,
      });
    }
  }

  /* ---- protected modules: uniform 1.0 blocks, no detail (finders stay clean) ---- */
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!model.dark[r][c] || !model.protected[r][c]) continue;
      buildings.push({
        x: wx(c),
        z: wz(r),
        spanX: 1,
        spanZ: 1,
        floors: 3,
        height: 1.0,
        klass: "protected",
        toneIndex: 0,
        seed: 0,
        roof: "none",
        antenna: false,
        watertank: false,
      });
    }
  }

  const maxHeight = buildings.reduce((m, b) => Math.max(m, b.height + (b.roof === "spire" ? 0.4 : 0)), 1);

  /* ---- street lamps: a perimeter ring ---- */
  const lampCount = (mobile ? 8 : 10) + Math.floor(sRng() * 7);
  const lamps: { x: number; z: number }[] = [];
  const lampR = size / 2 + 0.5;
  for (let i = 0; i < lampCount; i++) {
    const a = (i / lampCount) * TAU + sRng() * 0.3;
    lamps.push({ x: Math.cos(a) * lampR, z: Math.sin(a) * lampR });
  }

  /* ---- traffic ---- */
  const carCount = runs.length === 0 ? 0 : mobile ? 5 : 12;
  const cars: CityModel["cars"] = [];
  for (let i = 0; i < carCount; i++) {
    cars.push({
      run: Math.floor(mRng() * runs.length),
      t: mRng(),
      dir: mRng() < 0.5 ? 1 : -1,
      lane: mRng() < 0.5 ? -0.16 : 0.16,
      color: Math.floor(mRng() * 4),
      speed: 0.8,
    });
  }

  /* ---- birds + plane ---- */
  const birdCount = mobile ? 4 : 7;
  const birds = {
    count: birdCount,
    radius: size * 0.6,
    altitude: maxHeight * 1.4,
    lapSeconds: 40,
    phases: Array.from({ length: birdCount }, (_, i) => (i / birdCount) * TAU + mRng() * 0.4),
    flockTimer: 30 + mRng() * 40,
    flockEdge: Math.floor(mRng() * 4),
  };
  const plane = {
    angle: mRng() * TAU,
    altitude: maxHeight * 1.9,
    speed: 6,
    firstDelay: 20 + mRng() * 40,
    nextDelay: 75 + mRng() * 45,
  };

  return {
    size,
    worldSize,
    buildings,
    streetTiles,
    plazaTiles,
    runs,
    props,
    lamps,
    maxHeight,
    cars,
    birds,
    plane,
  };
}
