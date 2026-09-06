/**
 * LinkForge — internal render-quality presets.
 *
 * Not a user setting. Picked once from device capability and used to bound
 * particle / foliage counts and DPR so mobile and low-power GPUs stay smooth
 * while capable desktops get more detail.
 */

export type QualityTier = "low" | "medium" | "high";

export interface QualityProfile {
  tier: QualityTier;
  /** [min, max] DPR for the R3F <Canvas dpr=…>. Never unbounded. */
  dpr: [number, number];
  /** Multiplier applied to a scene's baseline foliage count. */
  foliageScale: number;
  /** Multiplier applied to a scene's baseline particle count. */
  particleScale: number;
  /** Baseline floating DataParticles for a full editor scene. */
  dataParticles: number;
  /** Whether the scene may enable (cheap) contact shadows. */
  allowShadows: boolean;
}

const PROFILES: Record<QualityTier, QualityProfile> = {
  low: {
    tier: "low",
    dpr: [1, 1],
    foliageScale: 0.4,
    particleScale: 0.4,
    dataParticles: 120,
    allowShadows: false,
  },
  medium: {
    tier: "medium",
    dpr: [1, 1.5],
    foliageScale: 0.75,
    particleScale: 0.7,
    dataParticles: 280,
    allowShadows: false,
  },
  high: {
    tier: "high",
    dpr: [1, 2],
    foliageScale: 1,
    particleScale: 1,
    dataParticles: 500,
    allowShadows: true,
  },
};

/**
 * Detect a quality tier from the current device. SSR-safe: returns "medium"
 * on the server. Deliberately conservative.
 */
export function detectQuality(): QualityProfile {
  if (typeof window === "undefined") return PROFILES.medium;

  const coarse =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches;
  const narrow = window.innerWidth < 768;
  const dpr = window.devicePixelRatio || 1;
  const cores =
    (navigator as Navigator & { hardwareConcurrency?: number })
      .hardwareConcurrency ?? 4;
  const mem =
    (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;

  if (coarse || narrow || cores <= 4 || mem <= 3) return PROFILES.low;
  if (cores >= 8 && mem >= 8 && dpr >= 1.5) return PROFILES.high;
  return PROFILES.medium;
}

export function qualityProfile(tier: QualityTier): QualityProfile {
  return PROFILES[tier];
}

/** Clamp a baseline count by a scene budget and the quality scale. */
export function scaledCount(
  base: number,
  scale: number,
  min: number,
  max: number
): number {
  return Math.max(min, Math.min(max, Math.round(base * scale)));
}
