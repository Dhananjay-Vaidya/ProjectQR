/**
 * Living reveal timeline — Experience → Scan in 0.75s (mirrored for the return).
 *
 *   0.00–0.20  camera starts rising toward axis-aligned top-down (done at 0.60)
 *   ..0.30     trunk + branches scale-y → 0 into the platform
 *   ..0.35     finder grass folds (scale-y → 0); finder tiles → full grass colour
 *   0.10–0.60  every leaf flies to its data module (start 0.10 + 0.25·d, dur 0.35)
 *   0.60–0.75  camera locks; light tiles → #F7F3EA; slab sides fade; rain fades
 *   1.00       swap to the verified flat render (pixel-identical framing/colour)
 */
export const LIVING_REVEAL_SECONDS = 0.75;

/** Phase boundaries, in seconds of the 0.75s reveal. */
export const REVEAL_TRUNK_DOWN = 0.3;
export const REVEAL_FINDER_FOLD = 0.35;
export const REVEAL_CAMERA_DONE = 0.6;
export const REVEAL_LOCK_START = 0.6;

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const ease = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};

/**
 * Per-leaf fly progress 0→1. `normalizedDistance` is 0 at the trunk, 1 at the
 * canopy edge. The nearest leaves leave first (0.10s); the farthest start at
 * 0.35s and still land by 0.70s.
 */
export function leafProgress(seconds: number, normalizedDistance: number) {
  return clamp01((seconds - (0.1 + 0.25 * clamp01(normalizedDistance))) / 0.35);
}

/** A slight downward overshoot as a leaf settles onto its tile. */
export function leafOvershoot(p: number) {
  return p < 0.7
    ? -0.15 * Math.sin((Math.PI / 2) * (p / 0.7))
    : -0.15 * Math.cos((Math.PI / 2) * ((p - 0.7) / 0.3));
}
