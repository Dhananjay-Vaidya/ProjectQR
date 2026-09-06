/**
 * LinkForge QR pipeline.
 *
 *   raw input
 *     -> normalizeUrl()
 *     -> validateUrl()      (Zod)
 *     -> buildQRModel()     (qrcode.create — the only encoder call in the app)
 *     -> QRModel            (single source of truth)
 *
 * No renderer or component calls qrcode.create directly.
 */

import QRCode from "qrcode";
import { z } from "zod";
import {
  EC_FALLBACK_ORDER,
  QREncodeError,
  QUIET_ZONE_MODULES,
  type ErrorCorrectionLevel,
  type QRBuildResult,
  type QRModel,
} from "@/types/qr";

/* -------------------------------------------------------------------------- */
/* URL normalization + validation                                            */
/* -------------------------------------------------------------------------- */

/**
 * Add a scheme when the user omitted one. Explicit http:// / https:// is kept
 * as typed. We never downgrade https to http.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    // Normalize only the scheme casing; leave the rest of the URL untouched.
    return trimmed.replace(/^https?/i, (m) => m.toLowerCase());
  }
  // Reject obviously non-http schemes rather than silently prefixing them.
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const urlSchema = z
  .string()
  .min(1, "Enter a URL.")
  .transform((value) => normalizeUrl(value))
  .refine((value) => value.length > 0, "Enter a URL.")
  .refine(
    (value) => {
      try {
        const u = new URL(value);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "That URL is not valid." }
  )
  .refine(
    (value) => {
      try {
        const u = new URL(value);
        // Require a dotted host or localhost — "https://foo" is not useful in a QR.
        return u.hostname === "localhost" || u.hostname.includes(".");
      } catch {
        return false;
      }
    },
    { message: "That URL is missing a valid domain." }
  );

export interface UrlValidation {
  ok: boolean;
  /** Normalized URL when ok; empty string otherwise. */
  url: string;
  /** User-facing message when not ok. */
  error: string | null;
}

export function validateUrl(raw: string): UrlValidation {
  const parsed = urlSchema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, url: parsed.data, error: null };
  }
  const first = parsed.error.issues[0]?.message ?? "That URL is not valid.";
  return { ok: false, url: "", error: first };
}

/* -------------------------------------------------------------------------- */
/* Encoding -> QRModel                                                        */
/* -------------------------------------------------------------------------- */

/** qrcode reports EC level as a bit: L=0, M=1, Q=2, H=3. */
const EC_BIT_TO_LEVEL: Record<number, ErrorCorrectionLevel | "L"> = {
  0: "L",
  1: "M",
  2: "Q",
  3: "H",
};

function modelSizeForVersion(version: number): number {
  return 21 + 4 * (version - 1);
}

/**
 * Alignment-pattern centre coordinates by version, straight from the QR spec
 * (ISO/IEC 18004 Annex E). Index by version; entry is the list of centres.
 * Version 1 has none.
 */
const ALIGNMENT_CENTERS: readonly (readonly number[])[] = [
  [], // 0 unused
  [], // 1
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

/**
 * Build a boolean matrix of protected (function) modules directly from the
 * QR spec geometry for the given version. We do this ourselves rather than
 * trusting a library internal so the protection is explicit and testable.
 */
export function computeProtectedMatrix(
  version: number,
  size: number
): boolean[][] {
  const prot: boolean[][] = Array.from({ length: size }, () =>
    new Array<boolean>(size).fill(false)
  );

  const mark = (r: number, c: number) => {
    if (r >= 0 && r < size && c >= 0 && c < size) prot[r][c] = true;
  };

  // Finder patterns (7x7) + one-module separator => 8x8 reserved blocks at the
  // three corners.
  const finderOrigins: ReadonlyArray<readonly [number, number]> = [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ];
  for (const [fr, fc] of finderOrigins) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        mark(fr + r, fc + c);
      }
    }
  }

  // Timing patterns: row 6 and column 6 across the whole symbol.
  for (let i = 0; i < size; i++) {
    mark(6, i);
    mark(i, 6);
  }

  // Dark module: always at (4*version + 9, 8).
  mark(4 * version + 9, 8);

  // Format information: the L-shaped strips beside each finder.
  for (let i = 0; i <= 8; i++) {
    mark(8, i); // top-left horizontal
    mark(i, 8); // top-left vertical
  }
  for (let i = 0; i < 8; i++) {
    mark(8, size - 1 - i); // top-right horizontal strip
    mark(size - 1 - i, 8); // bottom-left vertical strip
  }

  // Version information (version >= 7): two 6x3 / 3x6 blocks near TL of the
  // top-right and bottom-left finders.
  if (version >= 7) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        mark(r, size - 11 + c); // top-right block (6 rows x 3 cols)
        mark(size - 11 + c, r); // bottom-left block (3 rows x 6 cols)
      }
    }
  }

  // Alignment patterns (5x5) at every centre-pair, skipping any that collide
  // with a finder region.
  const centers = ALIGNMENT_CENTERS[version] ?? [];
  const collidesWithFinder = (r: number, c: number) => {
    const near = (br: number, bc: number) =>
      r >= br && r < br + 7 && c >= bc && c < bc + 7;
    return (
      near(0, 0) || near(0, size - 7) || near(size - 7, 0)
    );
  };
  for (const cr of centers) {
    for (const cc of centers) {
      if (collidesWithFinder(cr, cc)) continue;
      for (let r = cr - 2; r <= cr + 2; r++) {
        for (let c = cc - 2; c <= cc + 2; c++) {
          mark(r, c);
        }
      }
    }
  }

  return prot;
}

/** Try one EC level. Returns a QRModel or null when the payload does not fit. */
function tryEncode(
  url: string,
  ec: ErrorCorrectionLevel
): QRModel | null {
  let qr: QRCode.QRCode;
  try {
    qr = QRCode.create(url, { errorCorrectionLevel: ec });
  } catch {
    return null;
  }

  const size = qr.modules.size;
  const version = qr.version;

  if (size !== modelSizeForVersion(version)) {
    // Encoder geometry disagrees with the spec formula — refuse rather than
    // build renderers on an inconsistent matrix.
    return null;
  }

  const dark: boolean[][] = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => qr.modules.get(r, c) === 1)
  );

  const protectedMatrix = computeProtectedMatrix(version, size);

  const resolvedEcBit =
    typeof qr.errorCorrectionLevel === "object" &&
    qr.errorCorrectionLevel !== null
      ? qr.errorCorrectionLevel.bit
      : undefined;
  const resolvedEc =
    resolvedEcBit !== undefined
      ? EC_BIT_TO_LEVEL[resolvedEcBit] ?? ec
      : ec;

  return {
    size,
    dark,
    protected: protectedMatrix,
    version,
    ec: (resolvedEc === "L" ? "M" : resolvedEc) as ErrorCorrectionLevel,
    encodedUrl: url,
    maskPattern: qr.maskPattern,
  };
}

/**
 * Encode a normalized URL into a QRModel, walking H -> Q -> M until it fits.
 * Never falls below M. Throws QREncodeError if nothing works.
 */
export function buildQRModel(
  normalizedUrl: string,
  requestedEc: ErrorCorrectionLevel = "H"
): QRBuildResult {
  if (!normalizedUrl) {
    throw new QREncodeError("No URL to encode.");
  }

  const startIndex = EC_FALLBACK_ORDER.indexOf(requestedEc);
  const chain =
    startIndex >= 0
      ? EC_FALLBACK_ORDER.slice(startIndex)
      : EC_FALLBACK_ORDER;

  for (const level of chain) {
    const model = tryEncode(normalizedUrl, level);
    if (model) {
      return {
        model,
        requestedEc,
        didFallback: level !== requestedEc,
      };
    }
  }

  throw new QREncodeError(
    "This URL is too long to encode as a QR code even at the lowest supported error-correction level."
  );
}

/* -------------------------------------------------------------------------- */
/* Matrix helpers shared by renderers                                         */
/* -------------------------------------------------------------------------- */

/** Total side length in modules including the quiet zone on both sides. */
export function framedSize(model: QRModel): number {
  return model.size + QUIET_ZONE_MODULES * 2;
}

/** True when (row, col) sits inside the data area (not the quiet zone). */
export function inMatrix(model: QRModel, row: number, col: number): boolean {
  return row >= 0 && row < model.size && col >= 0 && col < model.size;
}

/** Convenience: is this module dark? */
export function isDark(model: QRModel, row: number, col: number): boolean {
  return inMatrix(model, row, col) && model.dark[row][col];
}

/** Convenience: is this module a protected function module? */
export function isProtected(
  model: QRModel,
  row: number,
  col: number
): boolean {
  return inMatrix(model, row, col) && model.protected[row][col];
}

/** Deterministic hash of a string -> uint32. Used to seed renderer randomness. */
export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Small deterministic PRNG (mulberry32). Seeded from hashString. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* -------------------------------------------------------------------------- */
/* Development self-checks (QR Design Engine skill: representative versions)   */
/* -------------------------------------------------------------------------- */

export interface SelfCheckReport {
  version: number;
  size: number;
  ok: boolean;
  failures: string[];
}

/**
 * Structural assertions over representative versions. Not a test framework —
 * just enough to catch a broken protected-matrix derivation. Exercised by the
 * /verify page.
 */
export function runProtectedMatrixSelfChecks(): SelfCheckReport[] {
  const reports: SelfCheckReport[] = [];
  // Long-enough payloads to force each target version bracket.
  const samples: Array<{ version: number; url: string }> = [
    { version: 1, url: "https://a.co" },
    { version: 2, url: "https://example.com/linkforge" },
    {
      version: 7,
      url:
        "https://example.com/linkforge/" +
        "path/".repeat(20) +
        "end",
    },
    {
      version: 10,
      url:
        "https://example.com/linkforge/" +
        "segment-".repeat(45) +
        "tail",
    },
  ];

  for (const sample of samples) {
    const failures: string[] = [];
    let model: QRModel | null = null;
    try {
      model = buildQRModel(sample.url, "H").model;
    } catch (err) {
      failures.push(
        `encode failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (model) {
      const { size, version } = model;

      if (size !== modelSizeForVersion(version)) {
        failures.push(
          `size ${size} != 21 + 4*(v-1) for v${version}`
        );
      }
      if (model.dark.length !== size || model.protected.length !== size) {
        failures.push("matrix row count mismatch");
      }
      for (let r = 0; r < size; r++) {
        if (model.dark[r]?.length !== size) {
          failures.push(`dark row ${r} wrong width`);
          break;
        }
        if (model.protected[r]?.length !== size) {
          failures.push(`protected row ${r} wrong width`);
          break;
        }
      }

      // Finder coverage: all three 7x7 corners fully protected.
      const finderOrigins: ReadonlyArray<readonly [number, number]> = [
        [0, 0],
        [0, size - 7],
        [size - 7, 0],
      ];
      for (const [fr, fc] of finderOrigins) {
        let covered = true;
        for (let r = 0; r < 7; r++)
          for (let c = 0; c < 7; c++)
            if (!model.protected[fr + r]?.[fc + c]) covered = false;
        if (!covered) failures.push(`finder at ${fr},${fc} not fully protected`);
      }

      // Timing row 6 / column 6 protected end to end.
      for (let i = 0; i < size; i++) {
        if (!model.protected[6][i]) {
          failures.push("timing row 6 gap");
          break;
        }
      }
      for (let i = 0; i < size; i++) {
        if (!model.protected[i][6]) {
          failures.push("timing column 6 gap");
          break;
        }
      }

      // Dark module protected.
      const dmR = 4 * version + 9;
      if (!model.protected[dmR]?.[8]) failures.push("dark module not protected");

      // Alignment presence for version >= 2.
      if (version >= 2) {
        const centers = ALIGNMENT_CENTERS[version] ?? [];
        if (centers.length < 2) failures.push("alignment centres missing");
        // The centre-most alignment pattern must be protected.
        const mid = centers[Math.floor(centers.length / 2)];
        if (mid !== undefined && !model.protected[mid]?.[mid]) {
          failures.push("central alignment pattern not protected");
        }
      }

      // Version info for version >= 7.
      if (version >= 7) {
        if (!model.protected[0]?.[size - 11]) {
          failures.push("version-info block (top-right) not protected");
        }
        if (!model.protected[size - 11]?.[0]) {
          failures.push("version-info block (bottom-left) not protected");
        }
      }
    }

    reports.push({
      version: model?.version ?? sample.version,
      size: model?.size ?? -1,
      ok: failures.length === 0,
      failures,
    });
  }

  return reports;
}
