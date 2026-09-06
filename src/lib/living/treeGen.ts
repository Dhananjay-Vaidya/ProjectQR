/** URL-seeded continuous branch geometry and leaf-to-data-module assignments. */
import { buildGenerativeSeed, domainRng } from "@/lib/generativeSeed";
import type { QRModel } from "@/types/qr";
import { isFinder } from "./scanColors";
export type Vec3 = [
    number,
    number,
    number
];
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
}
export interface LivingTree {
    trunk: Branch;
    radialSegments: number;
    branches: Branch[];
    leaves: Leaf[];
    clusters: {
        center: Vec3;
        radius: number;
        phase: number;
    }[];
    grass: GroundCard[];
    fallen: GroundCard[];
    fallTargets: Vec3[];
    slotsPerModule: number;
    dataModuleCount: number;
    height: number;
    canopyRadius: number;
}
const TAU = Math.PI * 2;
const mix = (a: Vec3, b: Vec3, t: number): Vec3 => a.map((v, i) => v + (b[i] - v) * t) as Vec3;
const world = (model: QRModel, r: number, c: number, y = .15): Vec3 => [c + .5 - model.size / 2, y, r + .5 - model.size / 2];
export function generateLivingTree(model: QRModel, mobile = false): LivingTree {
    const seed = buildGenerativeSeed(model.encodedUrl);
    const structure = domainRng(seed, "branchSeed"), foliage = domainRng(seed, "shapeSeed"), color = domainRng(seed, "colorSeed"), decor = domainRng(seed, "motionSeed");
    const height = 7 + structure() * 2, lean = structure() * 4 * Math.PI / 180, azimuth = structure() * TAU;
    const top: Vec3 = [Math.sin(lean) * height * Math.cos(azimuth), height, Math.sin(lean) * height * Math.sin(azimuth)];
    const trunk: Branch = { from: [0, .14, 0], to: top, baseRadius: .9, tipRadius: .35, primary: false };
    const branches: Branch[] = [];
    const clusters: LivingTree["clusters"] = [];
    const addCluster = (center: Vec3) => clusters.push({ center, radius: 2.2 + foliage(), phase: foliage() * TAU });
    for (let i = 0, count = 3 + Math.floor(structure() * 2); i < count; i++) {
        const az = azimuth + i / count * TAU + (structure() - .5) * 1.2, elevation = (25 + structure() * 25) * Math.PI / 180, length = 3.5 + structure() * 2.5;
        const from = mix(trunk.from, trunk.to, .55 + structure() * .35);
        const to: Vec3 = [from[0] + Math.cos(az) * Math.cos(elevation) * length, from[1] + Math.sin(elevation) * length, from[2] + Math.sin(az) * Math.cos(elevation) * length];
        branches.push({ from, to, baseRadius: .22, tipRadius: .08, primary: true });
        addCluster(to);
        addCluster(mix(from, to, .6 + foliage() * .35));
        for (let j = 0, n = 1 + Math.floor(structure() * 2); j < n; j++) {
            const start = mix(from, to, .6 + structure() * .35), angle = az + (j ? -1 : 1) * (.4 + structure() * .7), len = 1.8 + structure() * 1.8;
            const end: Vec3 = [start[0] + Math.cos(angle) * len * .8, start[1] + len * (.35 + structure() * .3), start[2] + Math.sin(angle) * len * .8];
            branches.push({ from: start, to: end, baseRadius: .1, tipRadius: .035, primary: false });
            addCluster(end);
            addCluster(mix(start, end, .75));
        }
    }
    addCluster(top);
    const modules: {
        row: number;
        col: number;
        x: number;
        z: number;
        free: number;
    }[] = [];
    const finders: Vec3[] = [], outer: Vec3[] = [], near: Vec3[] = [];
    for (let r = 0; r < model.size; r++)
        for (let c = 0; c < model.size; c++) {
            const p = world(model, r, c);
            if (model.dark[r][c] && !model.protected[r][c])
                modules.push({ row: r, col: c, x: p[0], z: p[2], free: 0 });
            if (model.dark[r][c] && isFinder(model.size, r, c))
                finders.push(p);
            if (!model.dark[r][c] && !model.protected[r][c]) {
                if (r < 2 || c < 2 || r >= model.size - 2 || c >= model.size - 2)
                    outer.push(p);
                if (Math.hypot(p[0], p[2]) > 1.1 && Math.hypot(p[0], p[2]) < 5.5)
                    near.push(p);
            }
        }
    const k = Math.max(3, Math.round((mobile ? 1400 : 3000) / Math.max(1, modules.length)));
    modules.forEach(m => { m.free = k; });
    const leaves: Leaf[] = [];
    for (let i = 0; i < modules.length * k; i++) {
        const cluster = i % clusters.length, { center, radius } = clusters[cluster];
        let x: number, y: number, z: number;
        do {
            x = foliage() * 2 - 1;
            y = foliage() * 2 - 1;
            z = foliage() * 2 - 1;
        } while (x * x + y * y + z * z > 1 || (Math.sin(x * 8 + cluster) * Math.cos(z * 7) > .7));
        const position: Vec3 = [center[0] + x * radius, center[1] + y * radius * .7, center[2] + z * radius];
        const inner = Math.hypot(x, z) < .5 || y < -.1;
        leaves.push({ position, rotation: [Math.atan2(y * .7, Math.hypot(x, z)) + (foliage() - .5) * .7, Math.atan2(x, z), foliage() * Math.PI], cluster, tint: inner && color() < .72 ? 2 : Math.floor(color() * 3), row: -1, col: -1, tile: false, distance: Math.hypot(position[0], position[2]), yaw: foliage() < .5 ? 0 : Math.PI / 2 });
    }
    // Greedy nearest XZ matching, farthest first, stable index tie-breaks.
    const order = leaves.map((_, i) => i).sort((a, b) => leaves[b].distance - leaves[a].distance || a - b);
    for (const index of order) {
        const leaf = leaves[index];
        let best = -1, distance = Infinity;
        for (let i = 0; i < modules.length; i++) {
            const m = modules[i];
            if (!m.free)
                continue;
            const d = (leaf.position[0] - m.x) ** 2 + (leaf.position[2] - m.z) ** 2;
            if (d < distance) {
                best = i;
                distance = d;
            }
        }
        if (best < 0)
            throw new Error("Living leaf assignment exhausted module slots.");
        const m = modules[best];
        leaf.row = m.row;
        leaf.col = m.col;
        leaf.tile = m.free === k;
        m.free--;
    }
    const maxDistance = Math.max(1, ...leaves.map(l => l.distance));
    leaves.forEach(l => { l.distance /= maxDistance; });
    const grass: GroundCard[] = [], grassCount = mobile ? 90 : 200;
    // Total-tuft budget: groups of four on finders, sparse outer-band placement.
    for (let i = 0; i < grassCount; i++) {
        const finder = i < Math.floor(grassCount * .9) || outer.length === 0, cells = finder ? finders : outer;
        const idx = finder ? (Math.floor(i / 4) * 37) % cells.length : Math.floor(decor() * cells.length), p = cells[idx];
        if (p)
            grass.push({ position: [p[0] + (decor() - .5) * .65, finder ? .15 : .09, p[2] + (decor() - .5) * .65], yaw: decor() * TAU, tint: decor() < .5 ? 0 : 1, finder });
    }
    const fallen: GroundCard[] = [];
    for (let i = 0, n = 25 + Math.floor(decor() * 16); i < n && near.length; i++) {
        const p = near[Math.floor(decor() * near.length)];
        fallen.push({ position: [p[0] + (decor() - .5) * .4, .1, p[2] + (decor() - .5) * .4], yaw: decor() * TAU, tint: Math.floor(decor() * 3) });
    }
    return { trunk, radialSegments: 6 + Math.floor(structure() * 3), branches, leaves, clusters, grass, fallen, fallTargets: near, slotsPerModule: k, dataModuleCount: modules.length, height: Math.max(height, ...leaves.map(l => l.position[1])) + .21, canopyRadius: maxDistance };
}
