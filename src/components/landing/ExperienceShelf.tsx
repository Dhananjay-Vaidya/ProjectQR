"use client";

/**
 * ExperienceShelf — one wide shelf, four small live dioramas (Living, City,
 * Particles, Mosaic), each on the sky with its caption plate. No borders, no
 * backgrounds, no hover-lift; hover only brightens the caption. Clicking one
 * opens /create in that mode.
 *
 * Each item mounts its renderer only once scrolled near (IntersectionObserver),
 * so we never run four heavy WebGL contexts at once.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { buildQRModel } from "@/lib/qr";
import { DEFAULT_QR_COLORS, type QRModel, type RendererMode } from "@/types/qr";
import { CaptionPlate } from "@/components/ui/DioramaChrome";
import { DEFAULT_THEME } from "@/lib/living/themes";
import { detectWebgl } from "@/lib/hooks";

const RendererStage = dynamic(
  () => import("@/components/qr/RendererStage"),
  { ssr: false, loading: () => <div style={{ width: "100%", aspectRatio: "1/1" }} aria-hidden /> }
);

const ITEMS: { mode: RendererMode; label: string; url: string }[] = [
  { mode: "living", label: "Living", url: "https://example.com" },
  { mode: "city", label: "City", url: "https://github.com" },
  { mode: "particle", label: "Particles", url: "https://openai.com" },
  { mode: "mosaic", label: "Mosaic", url: "https://google.com" },
];

export function ExperienceShelf() {
  return (
    <section className="lf-shelf" aria-label="Experiences">
      {ITEMS.map((it) => (
        <ShelfItem key={it.mode} {...it} />
      ))}
      <style>{`
        .lf-shelf {
          display: grid;
          gap: 28px 20px;
          grid-template-columns: minmax(0, 1fr);
          max-width: 1180px;
          margin: 0 auto;
          padding: 40px 24px;
          overflow-x: hidden;
        }
        .lf-shelf__item {
          display: grid;
          gap: 12px;
          background: none;
          border: none;
          padding: 0;
          text-align: left;
          cursor: pointer;
          color: var(--lf-ink);
          min-width: 0;
        }
        .lf-shelf__stage {
          width: 100%;
          aspect-ratio: 1 / 1;
          min-height: 180px;
          overflow: hidden;
        }
        .lf-shelf__item:hover .lf-plate__meta { color: var(--lf-ink); }
        @media (min-width: 560px) {
          .lf-shelf { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        }
        @media (min-width: 960px) {
          .lf-shelf { grid-template-columns: repeat(4, minmax(0, 1fr)); }
        }
      `}</style>
    </section>
  );
}

function ShelfItem({
  mode,
  label,
  url,
}: {
  mode: RendererMode;
  label: string;
  url: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLButtonElement | null>(null);
  const [near, setNear] = useState(false);
  const [webgl] = useState<boolean>(() =>
    typeof window === "undefined" ? true : detectWebgl()
  );

  const model = useMemo<QRModel | null>(() => {
    try {
      return buildQRModel(url, "H").model;
    } catch {
      return null;
    }
  }, [url]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setNear(true);
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className="lf-shelf__item lf-focus"
      onClick={() => router.push(`/create?mode=${mode}`)}
      aria-label={`Open ${label} in the editor`}
    >
      <div className="lf-shelf__stage">
        {model && near && webgl ? (
          <RendererStage
            mode={mode}
            model={model}
            colors={DEFAULT_QR_COLORS}
            sizePx={220}
            theme={DEFAULT_THEME}
            experienceView="experience"
            buildNonce={0}
            hero
            standardRounded={false}
            logoDataUrl={null}
            logoAreaFraction={0.16}
            cityRoofDetail
            particleState="assembled"
            particleCount={4000}
            mosaicImageDataUrl={null}
            mosaicSafeMode
          />
        ) : (
          <div style={{ width: "100%", aspectRatio: "1/1" }} aria-hidden />
        )}
      </div>
      <CaptionPlate
        url={url}
        meta={model ? `${label}, ${model.size}×${model.size}` : label}
        hoverBright
      />
    </button>
  );
}
