/** URL-seeded continuous tree geometry and leaf-to-data-module assignments. */
import { buildGenerativeSeed, domainRng } from "@/lib/generativeSeed";
import { QUIET_ZONE_MODULES, type QRModel } from "@/types/qr";
import { isFinder } from "./scanColors";

export type Vec3 = [number, number, number];

// Retained for the independent City/legacy decoration generator.
export interface DecorVoxel {
  x: number;
  y: number;
  z: number;
  scale: number;
  colorIndex: number;
  kind: "grass" | "fallen" | "stone";
}

export interface Branch {
  from: Vec3;
  to: Vec3;
  baseRadius: number;
  tipRadius: number;
  primary: boolean;
  /** Reaches past the canopy — carries only a sparse leaf tuft. */
  overreach?: boolean;
}

export interface Leaf {
  position: Vec3;
  rotation: Vec3;
  cluster: number;
  tint: number;
  row: number;
  col: number;
  tile: boolean;
  distance: number;
  yaw: number;
}

export interface GroundCard {
  position: Vec3;
  yaw: number;
  tint: number;
  finder?: boolean;
  /** Neon Bloom: this blade tuft carries a pink tip. */
  pink?: boolean;
  /** Blade-height multiplier (base ring tapers 0.7 → 0.4 outward). */
  h?: number;
  /** 8% of ring blades carry a theme-accent tip. */
  accent?: boolean;
}

export interface FoliageCluster {
  center: Vec3;
  /** Flattened ellipsoid radii [x, y, z] (y ≈ 0.6·x). */
  radius: Vec3;
  phase: number;
}

export interface LivingTree {
  /** Trunk control points: base, one bend, leaning top. */
  trunkSpline: [Vec3, Vec3, Vec3];
  trunkBaseRadius: number;
  trunkTipRadius: number;
  radialSegments: number;
  branches: Branch[];
  leaves: Leaf[];
  clusters: FoliageCluster[];
  grass: GroundCard[];
  fallen: GroundCard[];
  fallTargets: Vec3[];
  /** Every light, non-protected module centre — leaf-fall landing snap. */
  lightModules: Vec3[];
  slotsPerModule: number;
  dataModuleCount: number;
  height: number;
  canopyRadius: number;
  /** Platform side in world units (matrix + quiet zone). */
  platformSide: number;
}

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((v, i) => v + (b[i] - v) * t) as Vec3;
const world = (model: QRModel, r: number, c: number, y = 0.15): Vec3 => [
  c + 0.5 - model.size / 2,
  y,
  r + 0.5 - model.size / 2,
];

/** Quadratic Bézier through the trunk control points (p1 is an off-line control). */
export function trunkPointAt(tree: Pick<LivingTree, "trunkSpline">, t: number): Vec3 {
  const [p0, p1, p2] = tree.trunkSpline;
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
    u * u * p0[2] + 2 * u * t * p1[2] + t * t * p2[2],
  ];
}

export function generateLivingTree(model: QRModel, mobile = false): LivingTree {
  const seed = buildGenerativeSeed(model.encodedUrl);
  const structure = domainRng(seed, "branchSeed");
  const foliage = domainRng(seed, "shapeSeed");
  const color = domainRng(seed, "colorSeed");
  const decor = domainRng(seed, "motionSeed");

  const platformSide = model.size + QUIET_ZONE_MODULES * 2;

  /* ---- trunk: 3-point spline, slight lean + one bend ---- */
  const height = 8 + structure() * 2; // 8–10 modules
  const leanAz = structure() * TAU;
  const leanMag = 0.6 + structure() * 0.9;
  const bendAz = leanAz + (structure() - 0.5) * 1.5;
  const bendMag = 0.5 + structure() * 0.8;
  const bendH = height * (0.42 + structure() * 0.16);
  const base: Vec3 = [0, 0.1, 0];
  const bend: Vec3 = [Math.cos(bendAz) * bendMag, bendH, Math.sin(bendAz) * bendMag];
  const top: Vec3 = [Math.cos(leanAz) * leanMag, height, Math.sin(leanAz) * leanMag];
  const trunkSpline: [Vec3, Vec3, Vec3] = [base, bend, top];
  const radialSegments = 6 + Math.floor(structure() * 3); // 6–8

  /* ---- branches: 4–6 primaries from the upper 55%, never symmetric ---- */
  const branches: Branch[] = [];
  const clusters: FoliageCluster[] = [];
  const addCluster = (center: Vec3, scale = 1) => {
    const rx = (2.0 + foliage() * 0.8) * scale;
    clusters.push({ center, radius: [rx, rx * 0.62, rx], phase: foliage() * TAU });
  };

  const primaryCount = 4 + Math.floor(structure() * 3); // 4, 5 or 6
  const baseAz = structure() * TAU;
  let overreachLeft = 1 + (structure() < 0.5 ? 1 : 0); // 1–2 branches past the canopy
  for (let i = 0; i < primaryCount; i++) {
    const along = 0.45 + (i / primaryCount) * 0.5 + (structure() - 0.5) * 0.06;
    const from = trunkPointAt({ trunkSpline }, Math.min(0.98, Math.max(0.45, along)));
    const az = baseAz + (i / primaryCount) * TAU + (structure() - 0.5) * 1.15;
    const elevation = (20 + structure() * 35) * DEG; // 20–55°
    let length = 3.6 + structure() * 2.2; // stays inside 3.5–6
    const overreach = overreachLeft > 0 && structure() < 0.55;
    if (overreach) {
      overreachLeft--;
      length *= 1.5;
    }
    const dir: Vec3 = [
      Math.cos(az) * Math.cos(elevation),
      Math.sin(elevation),
      Math.sin(az) * Math.cos(elevation),
    ];
    const to: Vec3 = [from[0] + dir[0] * length, from[1] + dir[1] * length, from[2] + dir[2] * length];
    branches.push({ from, to, baseRadius: 0.24, tipRadius: 0.08, primary: true, overreach });

    if (overreach) {
      addCluster(to, 0.45);
    } else {
      addCluster(to);
      addCluster(mix(from, to, 0.62)); // outer 45% of the branch
    }

    const secondaries = 1 + Math.floor(structure() * 3); // 1–3
    for (let j = 0; j < secondaries; j++) {
      const start = mix(from, to, 0.55 + structure() * 0.35);
      const angle = az + (j % 2 ? -1 : 1) * (0.4 + structure() * 0.7);
      const len = 1.8 + structure() * 1.8;
      const end: Vec3 = [
        start[0] + Math.cos(angle) * len * 0.85,
        start[1] + len * (0.35 + structure() * 0.3),
        start[2] + Math.sin(angle) * len * 0.85,
      ];
      branches.push({ from: start, to: end, baseRadius: 0.1, tipRadius: 0.035, primary: false });
      if (!overreach) {
        addCluster(end, 0.85);
        addCluster(mix(start, end, 0.72), 0.7);
      }
    }
  }
  addCluster(top, 0.7);

  /* ---- module inventory ---- */
  const modules: { row: number; col: number; x: number; z: number; free: number }[] = [];
  const finderDark: Vec3[] = [];
  const outerLight: Vec3[] = [];
  const nearLight: Vec3[] = [];
  const ringLight: Vec3[] = [];
  const lightModules: Vec3[] = [];
  for (let r = 0; r < model.size; r++) {
    for (let c = 0; c < model.size; c++) {
      const p = world(model, r, c);
      if (model.dark[r][c] && !model.protected[r][c]) modules.push({ row: r, col: c, x: p[0], z: p[2], free: 0 });
      if (model.dark[r][c] && isFinder(model.size, r, c)) finderDark.push(p);
      if (!model.dark[r][c] && !model.protected[r][c]) {
        lightModules.push(p);
        const radial = Math.hypot(p[0], p[2]);
        if (r < 2 || c < 2 || r >= model.size - 2 || c >= model.size - 2) outerLight.push(p);
        if (radial > 1.1 && radial < 5.5) nearLight.push(p);
        if (radial >= 1.5 && radial <= 3.5) ringLight.push(p);
      }
    }
  }

  const target = mobile ? 1500 : 3200;
  const k = Math.max(3, Math.round(target / Math.max(1, modules.length)));
  modules.forEach((m) => (m.free = k));

  /* ---- leaves: flattened ellipsoid clusters, seeded gaps ---- */
  const leaves: Leaf[] = [];
  for (let i = 0; i < modules.length * k; i++) {
    const clusterIndex = i % clusters.length;
    const { center, radius } = clusters[clusterIndex];
    let x: number, y: number, z: number;
    do {
      x = foliage() * 2 - 1;
      y = foliage() * 2 - 1;
      z = foliage() * 2 - 1;
    } while (x * x + y * y + z * z > 1 || Math.sin(x * 8 + clusterIndex) * Math.cos(z * 7) > 0.7);
    const position: Vec3 = [
      center[0] + x * radius[0],
      center[1] + y * radius[1],
      center[2] + z * radius[2],
    ];
    const inner = Math.hypot(x, z) < 0.5 || y < -0.1;
    leaves.push({
      position,
      rotation: [
        Math.atan2(y * 0.7, Math.hypot(x, z)) + (foliage() - 0.5) * 0.7,
        Math.atan2(x, z),
        foliage() * Math.PI,
      ],
      cluster: clusterIndex,
      tint: inner && color() < 0.72 ? 2 : Math.floor(color() * 3),
      row: -1,
      col: -1,
      tile: false,
      distance: Math.hypot(position[0], position[2]),
      yaw: foliage() < 0.5 ? 0 : Math.PI / 2,
    });
  }

  /* ---- pull the canopy toward ≈ 0.95 × platform width ---- */
  // Pull only the foliage toward the target silhouette — branch and trunk
  // geometry stay byte-identical between the desktop and mobile leaf budgets.
  const rawRadius = Math.max(1, ...leaves.map((l) => l.distance));
  const targetRadius = (0.95 * platformSide) / 2;
  const squeeze = Math.max(0.7, Math.min(1.18, targetRadius / rawRadius));
  if (Math.abs(squeeze - 1) > 0.02) {
    for (const l of leaves) {
      l.position[0] *= squeeze;
      l.position[2] *= squeeze;
      l.distance = Math.hypot(l.position[0], l.position[2]);
    }
    for (const cl of clusters) {
      cl.center[0] *= squeeze;
      cl.center[2] *= squeeze;
    }
  }

  /* ---- greedy nearest-XZ assignment, farthest leaves first ---- */
  const order = leaves.map((_, i) => i).sort((a, b) => leaves[b].distance - leaves[a].distance || a - b);
  for (const index of order) {
    const leaf = leaves[index];
    let best = -1;
    let dist = Infinity;
    for (let i = 0; i < modules.length; i++) {
      const m = modules[i];
      if (!m.free) continue;
      const d = (leaf.position[0] - m.x) ** 2 + (leaf.position[2] - m.z) ** 2;
      if (d < dist) {
        best = i;
        dist = d;
      }
    }
    if (best < 0) throw new Error("Living leaf assignment exhausted module slots.");
    const m = modules[best];
    leaf.row = m.row;
    leaf.col = m.col;
    leaf.tile = m.free === k;
    m.free--;
  }

  const maxDistance = Math.max(1, ...leaves.map((l) => l.distance));
  const canopyRadius = maxDistance;
  leaves.forEach((l) => (l.distance /= maxDistance));

  /* ---- grass: finder tufts + sparse outer band + a dense ring around the trunk ---- */
  const grass: GroundCard[] = [];
  const grassCap = mobile ? 400 : 900;
  const perFinder = mobile ? 3 : 4;
  for (const p of finderDark) {
    for (let b = 0; b < perFinder && grass.length < grassCap; b++) {
      grass.push({
        position: [p[0] + (decor() - 0.5) * 0.7, 0.15, p[2] + (decor() - 0.5) * 0.7],
        yaw: decor() * TAU,
        tint: decor() < 0.5 ? 0 : 1,
        finder: true,
        pink: decor() < 0.15,
      });
    }
  }
  const outerStride = Math.max(1, Math.floor(outerLight.length / (mobile ? 30 : 70)));
  for (let i = 0; i < outerLight.length && grass.length < grassCap; i += outerStride) {
    const p = outerLight[i];
    grass.push({
      position: [p[0] + (decor() - 0.5) * 0.5, 0.09, p[2] + (decor() - 0.5) * 0.5],
      yaw: decor() * TAU,
      tint: decor() < 0.5 ? 0 : 1,
    });
  }
  // Base ring: ~6 tufts per light module in the 1.5–3.5-module annulus, taller
  // near the trunk (0.7) tapering to 0.4 at the ring edge.
  const perRing = mobile ? 4 : 6;
  for (const p of ringLight) {
    const radial = Math.hypot(p[0], p[2]);
    const hUnits = 0.7 - ((radial - 1.5) / 2) * 0.3; // 0.7 → 0.4
    for (let b = 0; b < perRing && grass.length < grassCap; b++) {
      grass.push({
        position: [p[0] + (decor() - 0.5) * 0.8, 0.12, p[2] + (decor() - 0.5) * 0.8],
        yaw: decor() * TAU,
        tint: decor() < 0.5 ? 0 : 1,
        h: hUnits / 0.5, // geometry is 0.5 tall
        accent: decor() < 0.08,
      });
    }
  }

  /* ---- fallen leaves near the trunk (renderer caps to the theme's base count) ---- */
  const fallen: GroundCard[] = [];
  for (let i = 0; i < 60 && nearLight.length; i++) {
    const p = nearLight[Math.floor(decor() * nearLight.length)];
    fallen.push({
      position: [p[0] + (decor() - 0.5) * 0.4, 0.06, p[2] + (decor() - 0.5) * 0.4],
      yaw: decor() * TAU,
      tint: Math.floor(decor() * 3),
    });
  }

  return {
    trunkSpline,
    trunkBaseRadius: 0.9,
    trunkTipRadius: 0.3,
    radialSegments,
    branches,
    leaves,
    clusters,
    grass,
    fallen,
    fallTargets: nearLight,
    lightModules,
    slotsPerModule: k,
    dataModuleCount: modules.length,
    height: Math.max(height, ...leaves.map((l) => l.position[1])) + 0.21,
    canopyRadius,
    platformSide,
  };
}
