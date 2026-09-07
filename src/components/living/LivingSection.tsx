"use client";

/**
 * LivingSection — the standalone Living tree experience.
 *
 * One centered 720px column on a warm #F6F1E7 ground:
 *   3D stage (fixed isometric, tap to toggle)
 *   → hint pill (⇄, red while the URL is invalid)
 *   → URL input + amber share button
 *   → theme segmented control + mute button
 *   → the existing custom leaf-palette swatch row (unchanged)
 *
 * The tree regenerates from the URL as you type, debounced 250ms, through the
 * same seeded generator, so the crossfade/morph lives inside LivingTreeQR.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useEditorStore } from "@/stores/editorStore";
import RendererStage from "@/components/qr/RendererStage";
import type { RendererHandle } from "@/components/qr/types";
import { useAudio, useAudioWorld } from "@/hooks/useAudio";
import { THEME_LABEL, THEME_ORDER, type ThemeName } from "@/lib/living/themes";
import { StudioPills } from "@/components/editor/StudioChrome";
import type { LeafPaletteName } from "@/lib/living/scanColors";
import "@/components/editor/studio.css";
import "./living.css";

const LEAF_PALETTE_OPTIONS: { value: LeafPaletteName; label: string; color: string }[] = [
  { value: "theme", label: "Theme", color: "#8fb776" },
  { value: "multicolour", label: "Multi", color: "linear-gradient(135deg,#a8d86f 0 33%,#4ea86e 33% 66%,#d39b54 66%)" },
  { value: "fresh", label: "Fresh", color: "#65b95a" },
  { value: "autumn", label: "Autumn", color: "#bc7a3d" },
  { value: "custom", label: "Custom", color: "linear-gradient(135deg,#a8d86f 0 33%,#4ea86e 33% 66%,#d39b54 66%)" },
];

function ThemeIcon({ name }: { name: ThemeName }) {
  if (name === "neon")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="2.4" />
        {[0, 1, 2, 3, 4].map((i) => (
          <ellipse key={i} cx="12" cy="6" rx="2.3" ry="4" transform={`rotate(${i * 72} 12 12)`} />
        ))}
      </svg>
    );
  if (name === "verdant")
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <line key={i} x1="12" y1="3" x2="12" y2="6" transform={`rotate(${i * 45} 12 12)`} />
        ))}
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M18 5C9 6 4 11 6 17c6 1 11-3 12-12Z" />
      <path d="M5 21c1-3 3-5 5-7" />
      <path d="M15 15v4M19 13v3M11 19v2" strokeLinecap="round" />
    </svg>
  );
}

export function LivingSection() {
  const s = useEditorStore();
  const rendererRef = useRef<RendererHandle | null>(null);
  const audio = useAudio();
  useAudioWorld("living", s.theme);

  const [shared, setShared] = useState(false);
  useEffect(() => {
    if (!shared) return;
    const t = window.setTimeout(() => setShared(false), 1600);
    return () => window.clearTimeout(t);
  }, [shared]);

  // Live regeneration: commit the URL 250ms after the last keystroke.
  const raw = s.rawUrl;
  useEffect(() => {
    const t = window.setTimeout(() => s.commitUrl(), 250);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);

  // Scan mode ducks the ambient bed by 9 dB and plays a soft chime at 0.6.
  const duckRef = useRef<number | null>(null);
  const scan = s.experienceView === "scan";
  useEffect(() => {
    if (scan) {
      if (duckRef.current === null) {
        duckRef.current = audio.volume;
        audio.setVolume(audio.volume * 0.3548); // -9 dB
      }
      if (audio.soundEnabled) {
        const chime = window.setTimeout(() => {
          try {
            const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            const ac = new Ctx();
            const osc = ac.createOscillator();
            const gain = ac.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(880, ac.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1320, ac.currentTime + 0.18);
            gain.gain.setValueAtTime(0.0001, ac.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.12, ac.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.4);
            osc.connect(gain).connect(ac.destination);
            osc.start();
            osc.stop(ac.currentTime + 0.42);
            osc.onended = () => ac.close();
          } catch {
            /* no WebAudio */
          }
        }, 450); // 0.6 × 0.75s reveal
        return () => window.clearTimeout(chime);
      }
      return;
    }
    if (duckRef.current !== null) {
      audio.setVolume(duckRef.current);
      duckRef.current = null;
    }
  }, [scan, audio.soundEnabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(
    () => () => {
      if (duckRef.current !== null) {
        audio.setVolume(duckRef.current);
        duckRef.current = null;
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const toggleView = () => s.setExperienceView(s.experienceView === "experience" ? "scan" : "experience");

  const share = async () => {
    const url = s.normalizedUrl || s.rawUrl;
    try {
      if (navigator.share) {
        await navigator.share({ url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      setShared(true);
    } catch {
      /* user dismissed the share sheet */
    }
  };

  const invalid = !!s.urlError;
  const hint = invalid
    ? "Please enter a valid URL"
    : s.experienceView === "scan"
      ? "Tap to see the tree"
      : "Tap the tree to see QR code";

  const soundOn = audio.soundEnabled && audio.ambientEnabled;

  return (
    <main className="living-section">
      <header className="living-head">
        <Link href="/" className="living-brand lf-focus" aria-label="LinkForge home">
          <span className="living-brand__mark" aria-hidden="true">
            LF
          </span>
          LinkForge
        </Link>
        <nav className="living-head__links">
          <Link href="/create?mode=city" className="lf-focus">
            City
          </Link>
          <Link href="/create?mode=particle" className="lf-focus">
            Particles
          </Link>
          <Link href="/verify" className="lf-focus">
            Verify
          </Link>
        </nav>
      </header>

      <div className="living-col">
        <div className="living-stage">
          {s.model ? (
            <RendererStage
              ref={rendererRef}
              mode="living"
              model={s.model}
              colors={s.colors}
              sizePx={640}
              theme={s.theme}
              experienceView={s.experienceView}
              buildNonce={s.buildNonce}
              leafPalette={s.living.leafPalette}
              customLeafColors={s.living.customLeafColors}
              studioPreview
              onToggleView={toggleView}
              onWebglError={(m) => s.reportWebglFailure(m)}
              standardRounded={s.standardRounded}
              logoDataUrl={s.logo.dataUrl}
              logoAreaFraction={s.logo.areaFraction}
              cityRoofDetail={s.city.roofDetail}
              particleState={s.particle.state}
              particleCount={s.particle.particleCount}
              mosaicImageDataUrl={s.mosaic.imageDataUrl}
              mosaicSafeMode={s.mosaic.safeMode}
            />
          ) : (
            <p className="living-empty">{s.buildError ?? "Enter a link to grow the tree."}</p>
          )}
        </div>

        <button
          type="button"
          className="living-hint lf-focus"
          data-invalid={invalid ? "true" : "false"}
          onClick={invalid ? undefined : toggleView}
        >
          {hint}
        </button>

        <div className="living-urlrow">
          <input
            className="living-url lf-focus"
            type="url"
            inputMode="url"
            aria-label="Your link"
            aria-invalid={invalid}
            placeholder="https://your-link.com"
            value={s.rawUrl}
            onChange={(e) => s.setRawUrl(e.target.value)}
          />
          <button
            type="button"
            className="living-share lf-focus"
            onClick={share}
            aria-label={shared ? "Link shared" : "Share link"}
            title={shared ? "Shared" : "Share"}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              {shared ? (
                <path d="m5 12 5 5L19 7" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <>
                  <path d="M12 16V4M7 9l5-5 5 5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" strokeLinecap="round" />
                </>
              )}
            </svg>
          </button>
        </div>

        <div className="living-themerow">
          <div className="living-seg" role="radiogroup" aria-label="Theme">
            {THEME_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                className="living-seg__item lf-focus"
                data-active={s.theme === t ? "true" : "false"}
                aria-pressed={s.theme === t}
                onClick={() => s.setTheme(t)}
              >
                <ThemeIcon name={t} />
                <span>{THEME_LABEL[t]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="living-mute lf-focus"
            aria-pressed={soundOn}
            aria-label={soundOn ? "Mute ambient sound" : "Unmute ambient sound"}
            title={soundOn ? "Sound on" : "Sound off"}
            onClick={() => audio.setSoundEnabled(!audio.soundEnabled)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M4 9.5h3.7L13 5v14l-5.3-4.5H4v-5Z" />
              {soundOn ? <path d="M16 9a4 4 0 0 1 0 6M18.5 7a7 7 0 0 1 0 10" strokeLinecap="round" /> : <path d="m17 9 4 4m0-4-4 4" strokeLinecap="round" />}
            </svg>
          </button>
        </div>

        {/* The existing custom leaf-palette feature — unchanged. */}
        <div className="studio-leaf-look living-palette">
          <span className="studio-label">Tree leaves</span>
          <StudioPills
            label="Tree leaf colours"
            value={s.living.leafPalette}
            options={LEAF_PALETTE_OPTIONS}
            onChange={(leafPalette) => s.setLiving({ leafPalette })}
          />
          {s.living.leafPalette === "custom" && (
            <div className="studio-leaf-colors" aria-label="Custom tree leaf colours">
              {s.living.customLeafColors.map((color, index) => (
                <label className="studio-color-chip" key={index}>
                  <span>{["Light", "Mid", "Warm"][index]}</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(event) => {
                      const next = [...s.living.customLeafColors] as [string, string, string];
                      next[index] = event.target.value;
                      s.setLiving({ customLeafColors: next, leafPalette: "custom" });
                    }}
                  />
                </label>
              ))}
            </div>
          )}
        </div>

        {s.webglNotice && (
          <p className="living-note" role="status">
            {s.webglNotice}
          </p>
        )}
      </div>
    </main>
  );
}
