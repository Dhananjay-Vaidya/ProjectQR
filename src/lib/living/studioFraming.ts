import type { LivingTree } from "./treeGen";

/**
 * Studio framing must remain stable while OrbitControls rotates the scene.
 * Re-centering from projected bounds on every angle makes a square platform feel
 * like it slides under the cursor, so the editor uses a fixed target and only
 * adjusts the orthographic height from the known QR/platform extents.
 */
export function studioHalfHeight(tree: LivingTree, side: number, aspect: number) {
  const canopyRadius = tree.leaves.reduce(
    (max, leaf) => Math.max(max, Math.hypot(leaf.position[0], leaf.position[2])),
    0,
  );
  const worldWidth = Math.max(side * 1.42, canopyRadius * 2.15);
  const worldHeight = Math.max(side * 1.18, tree.height + side * .46);
  const padding = aspect < 1 ? .82 : .76;

  return Math.max(worldHeight / padding / 2, worldWidth / padding / aspect / 2);
}
