/**
 * LinkForge — generative seed system.
 *
 *   normalized URL
 *     -> hashString()                 (deterministic uint32, FNV-1a)
 *     -> derived per-domain seeds     (branch / height / particle / colour / motion / shape)
 *     -> makeRng(seed)                (seeded mulberry32) for each domain
 *
 * The URL is the IDENTITY of every 3D object. The same normalized URL must
 * always produce the same numbers here; different URLs must differ. Structural
 * randomness NEVER uses unseeded Math.random(). (Decorative, non-persistent
 * background effects elsewhere may, but everything in this file is deterministic.)
 *
 * Nothing here imports three — pure data, runnable on the server and in checks.
 */

import { hashString, makeRng } from "@/lib/qr";

export interface GenerativeSeed {
  /** The URL this seed is bound to. */
  url: string;
  /** Master uint32 hash. */
  seed: number;
  /** Per-domain uint32 seeds — mix the master with a distinct golden constant. */
  branchSeed: number;
  heightSeed: number;
  particleSeed: number;
  colorSeed: number;
  motionSeed: number;
  shapeSeed: number;
}

/* Distinct 32-bit constants so tweaking one domain can't shift another. */
const K_BRANCH = 0x9e3779b9;
const K_HEIGHT = 0x85ebca6b;
const K_PARTICLE = 0xc2b2ae35;
const K_COLOR = 0x27d4eb2f;
const K_MOTION = 0x165667b1;
const K_SHAPE = 0xd3a2646c;

function mix(a: number, b: number): number {
  // xor + multiply avalanche (same spirit as hashString's step).
  let h = (a ^ b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** Derive the stable per-domain seed bundle for a normalized URL. */
export function buildGenerativeSeed(url: string): GenerativeSeed {
  const seed = hashString(url);
  return {
    url,
    seed,
    branchSeed: mix(seed, K_BRANCH),
    heightSeed: mix(seed, K_HEIGHT),
    particleSeed: mix(seed, K_PARTICLE),
    colorSeed: mix(seed, K_COLOR),
    motionSeed: mix(seed, K_MOTION),
    shapeSeed: mix(seed, K_SHAPE),
  };
}

/** Convenience: a seeded RNG for one domain of a URL's seed bundle. */
export function domainRng(
  seedBundle: GenerativeSeed,
  domain: keyof Omit<GenerativeSeed, "url">
): () => number {
  return makeRng(seedBundle[domain] >>> 0);
}

/* -------------------------------------------------------------------------- */
/* Development assertions (no test framework)                                 */
/* -------------------------------------------------------------------------- */

export interface SeedSelfCheck {
  name: string;
  ok: boolean;
  detail: string;
}

function seedEqual(a: GenerativeSeed, b: GenerativeSeed): boolean {
  return (
    a.seed === b.seed &&
    a.branchSeed === b.branchSeed &&
    a.heightSeed === b.heightSeed &&
    a.particleSeed === b.particleSeed &&
    a.colorSeed === b.colorSeed &&
    a.motionSeed === b.motionSeed &&
    a.shapeSeed === b.shapeSeed
  );
}

export function runGenerativeSeedSelfChecks(): SeedSelfCheck[] {
  const checks: SeedSelfCheck[] = [];

  {
    const a = buildGenerativeSeed("https://example.com");
    const b = buildGenerativeSeed("https://example.com");
    checks.push({
      name: "Deterministic: https://example.com twice",
      ok: seedEqual(a, b),
      detail: seedEqual(a, b)
        ? "Both seed bundles are identical."
        : "Two bundles for the same URL differ.",
    });
  }

  {
    const a = buildGenerativeSeed("https://example.com");
    const b = buildGenerativeSeed("https://openai.com");
    const differs =
      !seedEqual(a, b) &&
      a.branchSeed !== b.branchSeed &&
      a.particleSeed !== b.particleSeed;
    checks.push({
      name: "URL-sensitive: example.com vs openai.com",
      ok: differs,
      detail: differs
        ? "Every derived domain seed differs between the two URLs."
        : "Two different URLs collided on one or more domain seeds.",
    });
  }

  {
    // Domain seeds within one URL should not all collapse to the same value.
    const s = buildGenerativeSeed("https://linkforge.app/demo");
    const uniques = new Set([
      s.branchSeed,
      s.heightSeed,
      s.particleSeed,
      s.colorSeed,
      s.motionSeed,
      s.shapeSeed,
    ]);
    checks.push({
      name: "Domain seeds are distinct within one URL",
      ok: uniques.size === 6,
      detail:
        uniques.size === 6
          ? "All six domain seeds are distinct."
          : `Only ${uniques.size}/6 domain seeds are distinct.`,
    });
  }

  {
    // A seeded RNG stream must be reproducible.
    const s = buildGenerativeSeed("https://example.com/path");
    const r1 = domainRng(s, "particleSeed");
    const r2 = domainRng(s, "particleSeed");
    const a = [r1(), r1(), r1(), r1()];
    const b = [r2(), r2(), r2(), r2()];
    const same = a.every((v, i) => v === b[i]);
    checks.push({
      name: "Seeded RNG stream is reproducible",
      ok: same,
      detail: same
        ? "Two RNGs from the same domain seed produce the same sequence."
        : "RNG streams diverged.",
    });
  }

  return checks;
}
