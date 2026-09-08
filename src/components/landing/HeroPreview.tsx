"use client";

/**
 * HeroPreview - the display case's front window.
 *
 * Two columns 5/7 on desktop: copy left, a live Verdant Living diorama right,
 * sitting directly on the sky (no card, no screenshot). One orchestrated first-
 * load moment: platform tiles rise, then the tree grows (the DioramaStage build
 * driver). Nothing else animates on load or scroll. Reduced motion -> final state.
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { buildQRModel, validateUrl } from "@/lib/qr";
import { DEFAULT_QR_COLORS, type QRModel } from "@/types/qr";
import { detectWebgl } from "@/lib/hooks";
import { CaptionPlate, ThemeAccent } from "@/components/ui/DioramaChrome";
import { DEFAULT_THEME } from "@/lib/living/themes";

const LivingTreeQR = dynamic(() => import("@/components/qr/LivingTreeQR"), {
  ssr: false,
  loading: () => <div style={{ width: "100%", aspectRatio: "1/1" }} aria-hidden />,
});

const SEED = "https://example.com";

export function HeroPreview() {
  const [view, setView] = useState<"experience" | "scan">("experience");
  const [raw, setRaw] = useState("");
  const [webgl] = useState<boolean>(() =>
    typeof window === "undefined" ? true : detectWebgl()
  );

  const seedModel = useMemo<QRModel | null>(() => {
    try {
      return buildQRModel(SEED, "H").model;
    } catch {
      return null;
    }
  }, []);

  const { model, error } = useMemo(() => {
    const typed = raw.trim();
    if (!typed) return { model: null as QRModel | null, error: null };
    const v = validateUrl(typed);
    if (!v.ok) return { model: null as QRModel | null, error: v.error };
    try {
      return { model: buildQRModel(v.url, "H").model, error: null };
    } catch (err) {
      return { model: null, error: err instanceof Error ? err.message : null };
    }
  }, [raw]);

  const previewModel = model ?? seedModel;
  const createHref = raw.trim()
    ? `/create?url=${encodeURIComponent(raw.trim())}`
    : "/create";

  return (
    <section className="lf-hero">
      <ThemeAccent theme={DEFAULT_THEME} />

      <div className="lf-hero__copy">
        <h1 className="lf-display lf-hero__h1">
          Paste a link. Get a tiny world that scans.
        </h1>
        <p className="lf-hero__sub">
          Your URL becomes a miniature tree, city, or sculpture on a QR platform.
          Tap it to reveal the code; print it, share it, scan it.
        </p>
        <div className="lf-hero__form">
          <input
            className="lf-input lf-hero__input"
            type="url"
            inputMode="url"
            aria-label="Your link"
            value={raw}
            placeholder="https://your-link.com"
            onChange={(e) => setRaw(e.target.value)}
          />
          <Link href={createHref} className="lf-btn lf-focus lf-hero__go">
            Make a world
          </Link>
        </div>
        {error ? (
          <p className="lf-ui-sm" style={{ color: "#9a3b2e", margin: 0 }}>
            {error}
          </p>
        ) : null}
      </div>

      <div className="lf-hero__object">
        <div className="lf-hero__stage">
          {previewModel && webgl ? (
            <LivingTreeQR
              model={previewModel}
              colors={DEFAULT_QR_COLORS}
              sizePx={420}
              view={view}
              onToggleView={() => setView(v => v === "scan" ? "experience" : "scan")}
              theme={DEFAULT_THEME}
              buildNonce={0}
              hero
            />
          ) : (
            <div style={{ width: "100%", aspectRatio: "1/1" }} aria-hidden />
          )}
        </div>
        {previewModel ? (
          <CaptionPlate
            url={raw.trim() || SEED}
            meta={`Living, Verdant theme, ${previewModel.size}x${previewModel.size}`}
          />
        ) : null}
      </div>

      <style>{`
        .lf-hero {
          display: grid;
          gap: 32px;
          grid-template-columns: minmax(0, 1fr);
          max-width: 1180px;
          margin: 0 auto;
          padding: 56px 24px 24px;
          align-items: center;
        }
        .lf-hero__h1 { font-size: clamp(2rem, 6vw, 4rem); margin: 0 0 18px; max-width: 14ch; }
        .lf-hero__sub { font-size: 17px; line-height: 1.55; color: var(--lf-muted); margin: 0 0 22px; max-width: 46ch; }
        .lf-hero__form { display: flex; gap: 10px; flex-wrap: wrap; max-width: 460px; }
        .lf-hero__input { flex: 1 1 200px; min-width: 0; }
        .lf-hero__go { display: inline-flex; align-items: center; padding: 12px 20px; text-decoration: none; white-space: nowrap; }
        .lf-hero__object { display: grid; gap: 14px; justify-items: start; min-width: 0; }
        .lf-hero__stage { width: 100%; aspect-ratio: 1 / 1; min-height: 320px; }
        @media (min-width: 900px) {
          .lf-hero { grid-template-columns: 5fr 7fr; padding-top: 72px; }
          .lf-hero__stage { min-height: 520px; }
        }
      `}</style>
    </section>
  );
}


