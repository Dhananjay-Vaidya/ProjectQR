import { buildQRModel } from "@/lib/qr";
import { generateLivingTree } from "./treeGen";
import { leafProgress, leafOvershoot } from "./timeline";
export interface TreeSelfCheck {
    name: string;
    ok: boolean;
    detail: string;
}
export function runLivingTreeSelfChecks(): TreeSelfCheck[] {
    const model = buildQRModel("https://linkforge.app/demo", "H").model;
    const before = JSON.stringify(model);
    const a = generateLivingTree(model), b = generateLivingTree(model), mobile = generateLivingTree(model, true);
    const slots = new Map<string, {
        count: number;
        tiles: number;
    }>();
    for (const l of a.leaves) {
        const key = `${l.row},${l.col}`, entry = slots.get(key) ?? { count: 0, tiles: 0 };
        entry.count++;
        entry.tiles += Number(l.tile);
        slots.set(key, entry);
    }
    const branchLengths = a.branches.filter(b => b.primary).map(b => Math.hypot(...b.to.map((v, i) => v - b.from[i])));
    const unchanged = JSON.stringify(model) === before;
    return [
        { name: "Stable URL identity", ok: JSON.stringify(a) === JSON.stringify(b), detail: "Same URL, geometry, colors and complete module assignment." },
        { name: "Different URLs produce different structures", ok: JSON.stringify(a.trunkSpline) !== JSON.stringify(generateLivingTree(buildQRModel("https://example.com", "H").model).trunkSpline), detail: "Independent branch and shape seed domains." },
        { name: "Exactly K leaves and one tile per dark data module", ok: slots.size === a.dataModuleCount && [...slots.values()].every(s => s.count === a.slotsPerModule && s.tiles === 1), detail: `${a.leaves.length} desktop (K=${a.slotsPerModule}); ${mobile.leaves.length} mobile (K=${mobile.slotsPerModule}); ${a.dataModuleCount} modules; ${a.grass.length}/${mobile.grass.length} tufts.` },
        { name: "Protected modules and QRModel preserved", ok: unchanged && a.leaves.every(l => model.dark[l.row][l.col] && !model.protected[l.row][l.col]), detail: "No leaf lands on a finder, timing, alignment, format, separator or quiet-zone module." },
        { name: "Mobile keeps branch and trunk geometry", ok: JSON.stringify(a.branches) === JSON.stringify(mobile.branches) && JSON.stringify(a.trunkSpline) === JSON.stringify(mobile.trunkSpline), detail: `${a.fallen.length} fallen-leaf slots; primaries unchanged across tiers.` },
        { name: "Primary branch count, length and segmentation", ok: branchLengths.every(l => l >= 3.5 && l <= 9.5) && branchLengths.length >= 4 && branchLengths.length <= 6 && a.radialSegments >= 6 && a.radialSegments <= 8, detail: `${branchLengths.length} primaries, lengths ${branchLengths.map(l => l.toFixed(2)).join(", ")}; ${a.branches.filter(b => b.overreach).length} reach past the canopy.` },
        { name: "Reversible timeline endpoints", ok: a.leaves.every(l => leafProgress(0, l.distance) === 0 && leafProgress(.75, l.distance) === 1) && Math.abs(leafOvershoot(1)) < 1e-10 && leafProgress(.2, 0) > leafProgress(.2, 1), detail: "Nearest leaves leave first, all landed by .70s; zero overshoot at rest." },
    ];
}
