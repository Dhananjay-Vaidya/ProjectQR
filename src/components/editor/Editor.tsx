"use client";

/**
 * Editor — the display-case workspace.
 *
 * Desktop: preview 68% / panel 32%. Mobile: stacked, preview full width 400px.
 * The diorama sits on the page's sky gradient with its caption plate; two rows
 * of pills (mode + theme) and a segmented Experience|Scan sit under it. All the
 * rest lives in the one warm-white panel (Link / Look / Export).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { useEditorStore, type ExportResolution } from "@/stores/editorStore";
import { detectWebgl } from "@/lib/hooks";
import RendererStage from "@/components/qr/RendererStage";
import type { RendererHandle } from "@/components/qr/types";
import {
  ThemeAccent,
  CaptionPlate,
} from "@/components/ui/DioramaChrome";
import { AudioToggle } from "@/components/ui/AudioToggle";
import { useAudioStore } from "@/stores/audioStore";
import { THEME_LABEL, THEME_ORDER, type ThemeName } from "@/lib/living/themes";
import type { LeafPaletteName } from "@/lib/living/scanColors";
import { StudioAtmosphere, StudioIcon, StudioPills, type StudioIconName } from "./StudioChrome";
import "./studio.css";
import {
  buildStandardSvg,
  downloadDataUrl,
  downloadSvg,
  exportStem,
} from "@/lib/export";
import { verifyRaster } from "@/lib/verify";
import type { RendererMode } from "@/types/qr";

const MODES: { id: RendererMode; label: string }[] = [
  { id: "living", label: "Living" },
  { id: "city", label: "City" },
  { id: "particle", label: "Particles" },
  { id: "mosaic", label: "Mosaic" },
];

const LEAF_PALETTE_OPTIONS: { value: LeafPaletteName; label: string; color: string }[] = [
  { value: "theme", label: "Theme", color: "#8fb776" },
  { value: "multicolour", label: "Multi", color: "linear-gradient(135deg,#a8d86f 0 33%,#4ea86e 33% 66%,#d39b54 66%)" },
  { value: "fresh", label: "Fresh", color: "#65b95a" },
  { value: "autumn", label: "Autumn", color: "#bc7a3d" },
  { value: "custom", label: "Custom", color: "linear-gradient(135deg,#a8d86f 0 33%,#4ea86e 33% 66%,#d39b54 66%)" },
];

export function Editor() {
  const s = useEditorStore();
  const reduced = useReducedMotion();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const setThemeAudio = useAudioStore((state) => state.setTheme);
  const rendererRef = useRef<RendererHandle | null>(null);
  const [busy, setBusy] = useState<null | "png" | "svg">(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    useAudioStore.getState().setActivity("editor");
    setThemeAudio(s.theme);
  }, [s.theme, setThemeAudio]);

  useEffect(() => {
    if (!detectWebgl()) {
      s.reportWebglFailure(
        "3D rendering is unavailable here. Standard QR is shown instead."
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDiorama = s.renderer === "living" || s.renderer === "city" || s.renderer === "particle";
  const changeView = (view: "experience" | "scan") => {
    s.setExperienceView(view);
    if (s.renderer === "particle") s.setParticle({ state: view === "scan" ? "assembled" : "scattered" });
  };
  const toggleView = () => changeView(s.experienceView === "experience" ? "scan" : "experience");
  const changeMode = (mode: RendererMode) => {
    s.setRenderer(mode);
    if (mode === "particle") s.setParticle({ state: s.experienceView === "scan" ? "assembled" : "scattered" });
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(s.normalizedUrl); setCopied(true); }
    catch { setNotice("Copy isn't available here. Select the link to copy it manually."); }
  };

  const plateMeta = useMemo(() => {
    if (!s.model) return "";
    const modeLabel =
      MODES.find((m) => m.id === s.renderer)?.label ??
      (s.renderer === "standard" ? "Standard" : "Mosaic");
    return `${modeLabel}, ${THEME_LABEL[s.theme]} theme, ${s.model.size}×${s.model.size}`;
  }, [s.model, s.renderer, s.theme]);

  const exportPng = useCallback(async () => {
    if (!s.model) return;
    const handle = rendererRef.current;
    if (!handle) {
      setNotice("The preview isn't ready yet. Try again in a moment.");
      return;
    }
    if (s.renderer === "particle" && s.particle.state !== "assembled") {
      s.setParticle({ state: "assembled" });
      setNotice("Assembling the particles — press Download again shortly.");
      return;
    }
    setBusy("png");
    setNotice(null);
    s.setVerification(null);
    try {
      const image = await handle.exportImage();
      const result = verifyRaster(image.raster, s.model);
      s.setVerification(result);
      if (result.ok) {
        downloadDataUrl(image.pngDataUrl, `${exportStem(s.model)}.png`);
      } else {
        setNotice("The image didn't scan, so it wasn't downloaded. Adjust the settings and try again.");
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "The export failed.");
    } finally {
      setBusy(null);
    }
  }, [s]);

  const exportSvgFile = useCallback(() => {
    if (!s.model) return;
    setBusy("svg");
    try {
      const svg = buildStandardSvg(s.model, {
        matrixPx: 512,
        colors: s.colors,
        rounded: s.standardRounded,
      });
      downloadSvg(svg, `${exportStem(s.model)}.svg`);
      setNotice("SVG downloaded. It mirrors the Standard matrix — check the PNG for scan confidence.");
    } finally {
      setBusy(null);
    }
  }, [s.model, s.colors, s.standardRounded]);

  const scanSentence = s.lastVerification
    ? s.lastVerification.ok
      ? "Scans correctly."
      : "Doesn't scan yet — increase contrast or enable safe mode."
    : "Every download is decoded and checked against your link first.";

  const themeDots: Record<ThemeName, string> = { neon: "#b1a8c8", verdant: "#99b77c", ember: "#c49965" };
  const enter = reduced ? undefined : { opacity: 0, y: 12 };
  const interaction = reduced ? undefined : { y: -1, scale: 1.01 };

  return (
    <main className="lf-studio" data-mode={s.renderer} data-view={s.experienceView}>
      <ThemeAccent theme={s.theme} />
      <StudioAtmosphere living={s.renderer === "living"} scan={s.experienceView === "scan"} />

      <header className="studio-header">
        <Link href="/" className="studio-brand lf-focus" aria-label="LinkForge home">
          <svg className="studio-brand__mark" viewBox="0 0 36 46" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="21" height="27" rx="3" stroke="currentColor" strokeWidth="2.5"/>
            <rect x="12" y="15" width="21" height="27" rx="3" stroke="currentColor" strokeWidth="2.5" opacity=".55"/>
            <path d="M10 11h7v7m9 9h-7v7" stroke="currentColor" strokeWidth="2.5"/>
          </svg>
          <span><span className="studio-brand__name">LinkForge</span><span className="studio-brand__line">Turn links into living experiences</span></span>
        </Link>
        <div className="studio-header__aside">
          <span className="studio-header__motto">A link<br/>A world<br/>A story</span>
          <Link className="studio-header__link lf-focus" href="/verify">Verify a code <StudioIcon name="arrow"/></Link>
        </div>
      </header>

      <div className="studio-workspace">
        <section className="studio-experience" aria-labelledby="studio-title">
          <motion.div className="studio-intro" initial={enter} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65, delay: .05 }}>
            <p className="studio-eyebrow">Create</p>
            <h1 className="studio-title" id="studio-title">Bring your<br/>link to <em>life.</em></h1>
            <p className="studio-intro__copy">Turn any URL into a unique 3D experience that’s beautiful, shareable, and scannable.</p>
            <FeatureStrip />
          </motion.div>

          <div className="studio-stage" data-scan={s.experienceView === "scan"}>
            <div className="studio-stage__halo" aria-hidden="true"/>
            <div className="studio-stage__shadow" aria-hidden="true"/>
            <div className="studio-stage__orbit" aria-hidden="true"/>
            {s.renderer === "living" && <><i className="studio-stage__fragment studio-stage__fragment--one" aria-hidden="true"/><i className="studio-stage__fragment studio-stage__fragment--two" aria-hidden="true"/><i className="studio-stage__fragment studio-stage__fragment--three" aria-hidden="true"/></>}
            <div className="studio-stage__canvas" data-flat={!isDiorama}>
              {s.model ? <RendererStage
                ref={rendererRef}
                mode={s.renderer} model={s.model} colors={s.colors} sizePx={480}
                theme={s.theme} experienceView={s.experienceView} buildNonce={s.buildNonce}
                leafPalette={s.living.leafPalette}
                customLeafColors={s.living.customLeafColors}
                studioPreview
                onToggleView={isDiorama ? toggleView : undefined}
                onWebglError={(m) => s.reportWebglFailure(m)}
                standardRounded={s.standardRounded} logoDataUrl={s.logo.dataUrl} logoAreaFraction={s.logo.areaFraction}
                cityRoofDetail={s.city.roofDetail} particleState={s.particle.state} particleCount={s.particle.particleCount}
                mosaicImageDataUrl={s.mosaic.imageDataUrl} mosaicSafeMode={s.mosaic.safeMode}
              /> : <p className="studio-empty">{s.buildError ?? "Enter a link to build a world."}</p>}
            </div>
            {isDiorama && s.model && <div className="studio-stage__action">
              <motion.button className="studio-reveal lf-focus" type="button" onClick={toggleView}
                whileHover={interaction} whileTap={reduced ? undefined : { scale: .98 }}>
                <StudioIcon name={s.experienceView === "scan" ? "leaf" : "qr"}/>
                {s.experienceView === "scan" ? "Tap to return" : "Tap to reveal QR"}
              </motion.button>
            </div>}
            <span className="studio-stage__caption" aria-hidden="true">{s.renderer === "living" ? "Nature meets technology" : "A little world. A real connection."}</span>
          </div>

          <div className="studio-controls">
            {s.model && <CaptionPlate url={s.normalizedUrl} meta={plateMeta}/>}
            <StudioPills label="World" value={s.renderer} options={MODES.map(m => ({ value: m.id, label: m.label }))} onChange={changeMode}/>
            <div className="studio-controls__themes">
              <StudioPills label="Theme" value={s.theme} options={THEME_ORDER.map(t => ({ value: t, label: THEME_LABEL[t], color: themeDots[t] }))} onChange={s.setTheme}/>
              <AudioToggle />
            </div>
            {isDiorama && <StudioPills label="View" value={s.experienceView} options={[{ value: "experience", label: "Experience" }, { value: "scan", label: "Scan" }]} onChange={changeView} segmented/>}
          </div>
        </section>

        <motion.aside className="studio-panel" aria-label="World settings" initial={enter} animate={{ opacity: 1, y: 0 }} transition={{ duration: .65, delay: .25 }}>
          <section className="studio-panel__section" aria-labelledby="studio-link-label">
            <h2 className="studio-panel__heading" id="studio-link-label">Your Link</h2>
            <div className="studio-linkfield">
              <input className="studio-input" type="url" inputMode="url" aria-label="Your link" aria-describedby="studio-link-help"
                aria-invalid={!!s.urlError} value={s.rawUrl} placeholder="https://your-link.com"
                onChange={(e) => s.setRawUrl(e.target.value)} onBlur={s.commitUrl}
                onKeyDown={(e) => e.key === "Enter" && s.commitUrl()}/>
              <button className="studio-copy lf-focus" type="button" onClick={copyLink} aria-label={copied ? "Link copied" : "Copy link"} title={copied ? "Copied" : "Copy link"} disabled={!s.normalizedUrl}>
                <StudioIcon name={copied ? "check" : "copy"}/>
              </button>
            </div>
            <p className={`studio-help${s.urlError ? " studio-error" : ""}`} id="studio-link-help" role={s.urlError ? "alert" : undefined}>
              {s.urlError ?? `Encoding ${s.normalizedUrl}`}
            </p>
            <span className="sr-only" role="status">{copied ? "Link copied to clipboard." : ""}</span>
          </section>

          <section className="studio-panel__section" aria-labelledby="studio-look-label">
            <div className="studio-panel__sectionhead">
              <h2 className="studio-panel__heading" id="studio-look-label">Look</h2>
              {s.renderer === "living" && <motion.button type="button" className="studio-tertiary lf-focus" onClick={s.replayBuild} whileHover={interaction} whileTap={reduced ? undefined : { scale: .98 }}>
                <StudioIcon name="refresh"/>Grow it again
              </motion.button>}
            </div>
            {s.renderer === "city" && <label className="studio-checkfield"><input type="checkbox" checked={s.city.roofDetail} onChange={(e) => s.setCity({ roofDetail: e.target.checked })}/>Rooftop detail on buildings</label>}
            {s.renderer === "living" && <div className="studio-leaf-look">
              <span className="studio-label">Tree leaves</span>
              <StudioPills label="Tree leaf colours" value={s.living.leafPalette} options={LEAF_PALETTE_OPTIONS} onChange={leafPalette => s.setLiving({ leafPalette })}/>
              {s.living.leafPalette === "custom" && <div className="studio-leaf-colors" aria-label="Custom tree leaf colours">
                {s.living.customLeafColors.map((color, index) => <label className="studio-color-chip" key={index}>
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
                </label>)}
              </div>}
            </div>}
            {s.renderer === "particle" && <div className="studio-particle-look">
              <StudioPills label="Particle formation" value={s.particle.state} options={[{ value: "scattered", label: "Scattered" }, { value: "assembled", label: "Assembled" }]} onChange={state => changeView(state === "assembled" ? "scan" : "experience")} segmented/>
              <label className="studio-label">Particles · {s.particle.particleCount.toLocaleString()}
                <input className="lf-range" type="range" min={2000} max={9000} step={500} value={s.particle.particleCount} onChange={e => s.setParticle({ particleCount: Number(e.target.value) })}/>
              </label>
            </div>}
            {s.renderer === "mosaic" && <label className="studio-checkfield"><input type="checkbox" checked={s.mosaic.safeMode} onChange={e => s.setMosaic({ safeMode: e.target.checked })}/>Safe mode (solid module cores)</label>}
            {s.renderer === "standard" && <label className="studio-checkfield"><input type="checkbox" checked={s.standardRounded} onChange={e => s.setStandardRounded(e.target.checked)}/>Rounded data modules</label>}
            <p className="studio-help">The theme refines colours only — the world’s shape comes from your link.</p>
            {s.webglNotice && <p className="studio-help" role="status">{s.webglNotice}</p>}
          </section>

          <section className="studio-panel__section" aria-labelledby="studio-export-label">
            <h2 className="studio-panel__heading" id="studio-export-label">Export</h2>
            <label className="studio-label">Resolution
              <select className="studio-input" value={s.exportResolution} onChange={e => s.setExportResolution(Number(e.target.value) as ExportResolution)}>
                <option value={1024}>1024 px</option><option value={2048}>2048 px</option><option value={4096}>4096 px</option>
              </select>
            </label>
            <motion.button type="button" className="studio-download lf-focus" onClick={exportPng} disabled={!s.model || busy !== null}
              whileHover={interaction} whileTap={reduced ? undefined : { scale: .98 }}>
              <StudioIcon name="download"/>{busy === "png" ? "Checking…" : "Download PNG"}
            </motion.button>
            {s.renderer === "standard" && <button type="button" className="studio-tertiary lf-focus" onClick={exportSvgFile} disabled={!s.model || busy !== null}>Download SVG</button>}
            <div className="studio-verification" data-failed={s.lastVerification && !s.lastVerification.ok}>
              <span className="studio-verification__icon"><StudioIcon name={s.lastVerification && !s.lastVerification.ok ? "qr" : "check"}/></span>
              <p className="studio-help" role="status">{scanSentence}</p>
            </div>
            {notice && <p className="studio-help" role="status">{notice}</p>}
          </section>
        </motion.aside>
      </div>
      <div className="studio-mobile-features"><FeatureStrip mobile/></div>
      <footer className="studio-footer">
        <span className="studio-footer__note">Made from your link.<span>·</span>Made to be shared.</span>
        <p className="studio-footer__quote">A simple link.<br/>A living world.</p>
      </footer>
    </main>
  );
}

function FeatureStrip({ mobile = false }: { mobile?: boolean }) {
  const features: { icon: StudioIconName; first: string; second: string }[] = [
    { icon: "world", first: "URL-generated", second: "3D worlds" },
    { icon: "qr", first: "Real", second: "QR code" },
    { icon: "palette", first: "Make it", second: "your own" },
    { icon: "download", first: "Ready to", second: "share & print" },
  ];
  return <ul className={`studio-features${mobile ? " studio-features--mobile" : ""}`}>
    {features.map(f => <li key={f.icon}><span className="studio-features__icon"><StudioIcon name={f.icon}/></span><span>{f.first}<br/>{f.second}</span></li>)}
  </ul>;
}
