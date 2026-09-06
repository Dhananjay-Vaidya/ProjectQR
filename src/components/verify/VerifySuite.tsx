"use client";

/**
 * VerifySuite — client-side verification harness.
 *
 * 1. Structural self-checks over representative versions (1, 2, 7, 10).
 * 2. Live jsQR decode of Standard and Mosaic (Safe Mode) exports, comparing the
 *    decoded payload EXACTLY to the encoded URL.
 * 3. City / Particle: exported from the editor (WebGL). Reported honestly as
 *    "verify in the editor / on a device" rather than faked here.
 */

import { useCallback, useEffect, useState } from "react";
import {
  buildQRModel,
  runProtectedMatrixSelfChecks,
  type SelfCheckReport,
} from "@/lib/qr";
import {
  runLivingTreeSelfChecks as runGenerativeTreeSelfChecks,
  type TreeSelfCheck,
} from "@/lib/living/checks";
import { verifiedLivingScan } from "@/lib/living/verifiedScan";
import { THEME_ORDER, THEME_LABEL } from "@/lib/living/themes";
import { LivingMorphCheck } from "./LivingMorphCheck";
import {
  runGenerativeSeedSelfChecks,
  type SeedSelfCheck,
} from "@/lib/generativeSeed";
import { rasterizeStandard } from "@/lib/export";
import { verifyRaster } from "@/lib/verify";
import { DEFAULT_QR_COLORS, type VerificationResult } from "@/types/qr";
import MosaicQR from "@/components/qr/MosaicQR";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Panel } from "@/components/ui/Panel";
import type { RendererHandle } from "@/components/qr/types";
import { useRef } from "react";

const TEST_URL = "https://example.com/linkforge-test";

interface RunResult {
  label: string;
  result: VerificationResult | null;
  note?: string;
}

export function VerifySuite() {
  const [selfChecks, setSelfChecks] = useState<SelfCheckReport[]>([]);
  const [treeChecks, setTreeChecks] = useState<TreeSelfCheck[]>([]);
  const [seedChecks, setSeedChecks] = useState<SeedSelfCheck[]>([]);
  const [runs, setRuns] = useState<RunResult[]>([]);
  const [busy, setBusy] = useState(false);
  const mosaicRef = useRef<RendererHandle | null>(null);

  useEffect(() => {
    setSelfChecks(runProtectedMatrixSelfChecks());
    setTreeChecks(runGenerativeTreeSelfChecks());
    setSeedChecks(runGenerativeSeedSelfChecks());
  }, []);

  const run = useCallback(async () => {
    setBusy(true);
    const out: RunResult[] = [];
    for (const theme of THEME_ORDER) {
      try {
        const qr = buildQRModel(TEST_URL, "H").model;
        const scan = verifiedLivingScan(qr, theme, 480);
        out.push({ label: `Living ${THEME_LABEL[theme]} (${scan.fallback === "none" ? "themed colors" : scan.fallback})`, result: scan.verification });
      } catch (error) {
        out.push({ label: `Living ${THEME_LABEL[theme]}`, result: { ok: false, decoded: null, expected: TEST_URL, detail: String(error) } });
      }
    }

    // --- Standard ---
    try {
      const model = buildQRModel(TEST_URL, "H").model;
      const img = rasterizeStandard(model, {
        matrixPx: 480,
        colors: DEFAULT_QR_COLORS,
      });
      out.push({ label: "Standard", result: verifyRaster(img.raster, model) });
    } catch (err) {
      out.push({
        label: "Standard",
        result: null,
        note: err instanceof Error ? err.message : "encode failed",
      });
    }

    // --- Mosaic, Safe Mode, no image (flat fallback) ---
    try {
      const handle = mosaicRef.current;
      if (handle) {
        const img = await handle.exportImage();
        const model = buildQRModel(TEST_URL, "H").model;
        out.push({
          label: "Mosaic (Safe Mode, no image)",
          result: verifyRaster(img.raster, model),
        });
      } else {
        out.push({
          label: "Mosaic (Safe Mode, no image)",
          result: null,
          note: "Mosaic renderer not mounted.",
        });
      }
    } catch (err) {
      out.push({
        label: "Mosaic (Safe Mode, no image)",
        result: null,
        note: err instanceof Error ? err.message : "export failed",
      });
    }


    // --- City / Particle ---
    out.push({
      label: "City (top-down scan export)",
      result: null,
      note:
        "WebGL export — run from the editor with Scan view, then Download PNG. The editor verifies with jsQR before download.",
    });
    out.push({
      label: "Particle (assembled export)",
      result: null,
      note:
        "WebGL export — assemble particles in the editor, then Download PNG. The editor verifies with jsQR before download.",
    });

    setRuns(out);
    setBusy(false);
  }, []);

  const model = (() => {
    try {
      return buildQRModel(TEST_URL, "H").model;
    } catch {
      return null;
    }
  })();

  const allSelfChecksOk =
    selfChecks.length > 0 && selfChecks.every((r) => r.ok);
  const allTreeChecksOk =
    treeChecks.length > 0 && treeChecks.every((r) => r.ok);
  const allSeedChecksOk =
    seedChecks.length > 0 && seedChecks.every((r) => r.ok);

  return (
    <div style={{ display: "grid", gap: "var(--lf-space-8)" }}>
      <LivingMorphCheck />
      <section style={{ display: "grid", gap: "var(--lf-space-3)" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
          1. Protected-matrix self-checks
        </h2>
        <p style={{ margin: 0, color: "var(--lf-fg-muted)", fontSize: "0.88rem" }}>
          Structural assertions over versions 1, 2, 7 and 10: matrix
          dimensions, finder coverage, timing row/column, alignment presence,
          version-info blocks and the dark module.
        </p>
        <div>
          <StatusBadge tone={allSelfChecksOk ? "ok" : "fail"}>
            {allSelfChecksOk ? "All structural checks pass" : "Structural checks failing"}
          </StatusBadge>
        </div>
        <div style={{ display: "grid", gap: "var(--lf-space-2)" }}>
          {selfChecks.map((r) => (
            <Panel key={`${r.version}-${r.size}`}>
              <div
                style={{
                  padding: "var(--lf-space-3) var(--lf-space-4)",
                  display: "flex",
                  gap: "var(--lf-space-3)",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <StatusBadge tone={r.ok ? "ok" : "fail"}>
                  v{r.version} · {r.size}×{r.size}
                </StatusBadge>
                <span style={{ fontSize: "0.82rem", color: "var(--lf-fg-muted)" }}>
                  {r.ok ? "OK" : r.failures.join("; ")}
                </span>
              </div>
            </Panel>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gap: "var(--lf-space-3)" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
          2. Generative tree — determinism
        </h2>
        <p style={{ margin: 0, color: "var(--lf-fg-muted)", fontSize: "0.88rem" }}>
          The Living renderer derives a tree from the URL only. These checks
          confirm the same URL always produces the same tree, different URLs
          differ, geometry output is stable, the preview budget changes foliage
          but not structure, and every parameter stays in its safe range.
        </p>
        <div>
          <StatusBadge tone={allTreeChecksOk ? "ok" : "fail"}>
            {allTreeChecksOk
              ? "Deterministic generation verified"
              : "Determinism check failing"}
          </StatusBadge>
        </div>
        <div style={{ display: "grid", gap: "var(--lf-space-2)" }}>
          {treeChecks.map((c) => (
            <Panel key={c.name}>
              <div
                style={{
                  padding: "var(--lf-space-3) var(--lf-space-4)",
                  display: "grid",
                  gap: "0.35rem",
                }}
              >
                <div style={{ display: "flex", gap: "var(--lf-space-3)", alignItems: "center", flexWrap: "wrap" }}>
                  <StatusBadge tone={c.ok ? "ok" : "fail"}>
                    {c.ok ? "pass" : "fail"}
                  </StatusBadge>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{c.name}</span>
                </div>
                <span style={{ fontSize: "0.8rem", color: "var(--lf-fg-muted)" }}>
                  {c.detail}
                </span>
              </div>
            </Panel>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gap: "var(--lf-space-3)" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
          3. Generative seed — determinism
        </h2>
        <p style={{ margin: 0, color: "var(--lf-fg-muted)", fontSize: "0.88rem" }}>
          Every 3D experience (Living tree, City wave, Particle assembly) draws
          its structural randomness from a URL-derived seed bundle. These checks
          confirm the bundle is stable per URL, differs between URLs, has
          distinct per-domain seeds, and yields reproducible RNG streams.
        </p>
        <div>
          <StatusBadge tone={allSeedChecksOk ? "ok" : "fail"}>
            {allSeedChecksOk
              ? "Seed system deterministic"
              : "Seed determinism failing"}
          </StatusBadge>
        </div>
        <div style={{ display: "grid", gap: "var(--lf-space-2)" }}>
          {seedChecks.map((c) => (
            <Panel key={c.name}>
              <div
                style={{
                  padding: "var(--lf-space-3) var(--lf-space-4)",
                  display: "grid",
                  gap: "0.35rem",
                }}
              >
                <div style={{ display: "flex", gap: "var(--lf-space-3)", alignItems: "center", flexWrap: "wrap" }}>
                  <StatusBadge tone={c.ok ? "ok" : "fail"}>
                    {c.ok ? "pass" : "fail"}
                  </StatusBadge>
                  <span style={{ fontSize: "0.85rem", fontWeight: 600 }}>{c.name}</span>
                </div>
                <span style={{ fontSize: "0.8rem", color: "var(--lf-fg-muted)" }}>
                  {c.detail}
                </span>
              </div>
            </Panel>
          ))}
        </div>
      </section>

      <section style={{ display: "grid", gap: "var(--lf-space-3)" }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700 }}>
          4. Live jsQR decode
        </h2>
        <p style={{ margin: 0, color: "var(--lf-fg-muted)", fontSize: "0.88rem" }}>
          Encodes <code style={{ fontFamily: "var(--font-geist-mono), monospace" }}>{TEST_URL}</code>,
          exports it, decodes the pixels with jsQR and requires an exact match.
        </p>
        <div>
          <button
            type="button"
            onClick={run}
            disabled={busy}
            className="lf-focus-ring"
            style={{
              padding: "0.65rem 1.1rem",
              fontWeight: 600,
              fontSize: "0.88rem",
              background: "var(--lf-accent)",
              color: "var(--lf-accent-contrast)",
              border: "1px solid var(--lf-accent)",
              borderRadius: "var(--lf-radius)",
              cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? "Running…" : "Run verification"}
          </button>
        </div>

        <div style={{ display: "grid", gap: "var(--lf-space-2)" }}>
          {runs.map((r) => (
            <Panel key={r.label}>
              <div style={{ padding: "var(--lf-space-4)", display: "grid", gap: "0.5rem" }}>
                <div style={{ display: "flex", gap: "var(--lf-space-3)", alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: "0.9rem" }}>{r.label}</strong>
                  {r.result ? (
                    <StatusBadge tone={r.result.ok ? "ok" : "fail"}>
                      {r.result.ok ? "ok: true" : "ok: false"}
                    </StatusBadge>
                  ) : (
                    <StatusBadge tone="neutral">manual</StatusBadge>
                  )}
                </div>
                {r.result ? (
                  <pre
                    style={{
                      margin: 0,
                      fontSize: "0.78rem",
                      color: "var(--lf-fg-muted)",
                      fontFamily: "var(--font-geist-mono), monospace",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                    }}
                  >
{JSON.stringify(
  { ok: r.result.ok, decoded: r.result.decoded, expected: r.result.expected },
  null,
  2
)}
                  </pre>
                ) : (
                  <span style={{ fontSize: "0.82rem", color: "var(--lf-fg-faint)" }}>
                    {r.note}
                  </span>
                )}
              </div>
            </Panel>
          ))}
          {runs.length === 0 ? (
            <span style={{ fontSize: "0.85rem", color: "var(--lf-fg-faint)" }}>
              No run yet.
            </span>
          ) : null}
        </div>
      </section>

      {/* Off-screen Mosaic renderer used purely to produce an export raster. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: -99999, top: 0, opacity: 0, pointerEvents: "none" }}
      >
        {model ? (
          <MosaicQR
            ref={mosaicRef}
            model={model}
            colors={DEFAULT_QR_COLORS}
            sizePx={320}
            imageDataUrl={null}
            safeMode
          />
        ) : null}
      </div>

      <section
        style={{
          borderTop: "1px solid var(--lf-panel-border)",
          paddingTop: "var(--lf-space-6)",
          display: "grid",
          gap: "var(--lf-space-2)",
        }}
      >
        <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700 }}>
          Manual verification still required
        </h2>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1.1rem",
            color: "var(--lf-fg-muted)",
            fontSize: "0.85rem",
            display: "grid",
            gap: 3,
          }}
        >
          <li>City and Particle exports (WebGL) — verify from the editor per session and device.</li>
          <li>Scan on a real Android camera and a real iPhone camera.</li>
          <li>Low and high screen brightness; medium physical distance.</li>
          <li>A printed copy.</li>
          <li>Non-default foreground / background colours.</li>
          <li>Long URLs that push the version up.</li>
        </ul>
      </section>
    </div>
  );
}
