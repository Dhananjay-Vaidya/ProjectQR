"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEditorStore, type ExportResolution } from "@/stores/editorStore";
import RendererStage from "@/components/qr/RendererStage";
import type { RendererHandle } from "@/components/qr/types";
import { CaptionPlate, Segmented, ThemeAccent, ThemePills } from "@/components/ui/DioramaChrome";
import { StudioIcon } from "./StudioChrome";
import { THEME_LABEL, type ThemeName } from "@/lib/living/themes";
import type { RendererMode } from "@/types/qr";
import { buildStandardSvg, downloadDataUrl, downloadSvg, exportStem } from "@/lib/export";
import { verifyRaster } from "@/lib/verify";
import "./studio.css";

const MODES: { id: RendererMode; label: string }[] = [{ id: "living", label: "Living" }, { id: "city", label: "City" }, { id: "particle", label: "Particles" }, { id: "mosaic", label: "Mosaic" }];
const LEAVES = ["theme", "multicolour", "fresh", "autumn", "custom"] as const;
const DEFAULT_PALETTE = { leafPrimary: "#5F8A52", leafSecondary: "#8FA66A", leafAccent: "#D6B767", trunk: "#5C3A27" };
const CURATED_PALETTES = [DEFAULT_PALETTE, { leafPrimary: "#496B4A", leafSecondary: "#84A98C", leafAccent: "#D9B44A", trunk: "#513729" }, { leafPrimary: "#8B4B61", leafSecondary: "#D78A9B", leafAccent: "#F2C66D", trunk: "#613D34" }, { leafPrimary: "#3C6E71", leafSecondary: "#78A6A8", leafAccent: "#A4C3B2", trunk: "#4B382D" }, { leafPrimary: "#6F5E9A", leafSecondary: "#A28CC4", leafAccent: "#D6B767", trunk: "#523B34" }];
const isHex = (value: string) => /^#[0-9A-Fa-f]{6}$/.test(value);

export function Editor() {
  const s = useEditorStore();
  const router = useRouter();
  const rendererRef = useRef<RendererHandle | null>(null);
  const [busy, setBusy] = useState<"png" | "svg" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const isDiorama = s.renderer === "living" || s.renderer === "city" || s.renderer === "particle";
  const modeName = s.renderer === "particle" ? "particles" : s.renderer;
  const query = (mode = modeName, theme = s.theme, url = s.rawUrl) => `/create?mode=${mode}&theme=${theme === "neon" ? "neon-bloom" : theme}&url=${encodeURIComponent(url)}`;
  const updateUrl = (value: string) => { s.setRawUrl(value); router.replace(query(modeName, s.theme, value)); };
  const changeMode = (mode: RendererMode) => { s.setRenderer(mode); router.push(query(mode === "particle" ? "particles" : mode)); };
  const changeTheme = (theme: ThemeName) => { s.setTheme(theme); router.push(query(modeName, theme)); };
  const changeView = (view: "experience" | "scan") => { s.setExperienceView(view); if (s.renderer === "particle") s.setParticle({ state: view === "scan" ? "assembled" : "scattered" }); };
  const hint = s.urlError ? "Please enter a valid URL" : s.experienceView === "scan" ? "Tap to return" : s.renderer === "living" ? "Tap the tree to see QR code" : s.renderer === "city" ? "Tap the city to see QR code" : s.renderer === "particle" ? "Tap the sculpture to see QR code" : "Tap to reveal QR code";
  const plateMeta = s.model ? `${MODES.find((m) => m.id === s.renderer)?.label}, ${THEME_LABEL[s.theme]} theme, ${s.model.size}x${s.model.size}` : "";
  const seed = useMemo(() => s.normalizedUrl.slice(-8), [s.normalizedUrl]);
  const customColors: [string, string, string] = [s.living.customTreePalette.leafPrimary, s.living.customTreePalette.leafSecondary, s.living.customTreePalette.leafAccent];
  const setPalette = (key: keyof typeof s.living.customTreePalette, value: string) => { if (isHex(value)) s.setLiving({ customTreePalette: { ...s.living.customTreePalette, [key]: value.toUpperCase() } }); };
  const copyConfig = async () => { try { await navigator.clipboard.writeText(`${location.origin}${query()}`); setNotice("Configuration link copied."); } catch { setNotice("Copy isn't available in this browser."); } };
  const exportPng = useCallback(async () => {
    if (!s.model || !rendererRef.current) return;
    if (s.renderer === "particle" && s.particle.state !== "assembled") { s.setParticle({ state: "assembled" }); setNotice("Assembling particles. Download again shortly."); return; }
    setBusy("png"); setNotice(null); s.setVerification(null);
    try { const image = await rendererRef.current.exportImage(); const result = verifyRaster(image.raster, s.model); s.setVerification(result); if (result.ok) downloadDataUrl(image.pngDataUrl, `${exportStem(s.model)}.png`); else setNotice("The image did not scan, so it was not downloaded."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Export failed."); } finally { setBusy(null); }
  }, [s]);
  const exportSvgFile = () => { if (!s.model) return; setBusy("svg"); downloadSvg(buildStandardSvg(s.model, { matrixPx: 512, colors: s.colors, rounded: s.standardRounded }), `${exportStem(s.model)}.svg`); setBusy(null); };
  return <main className="editor-page" data-mode={s.renderer}>
    <ThemeAccent theme={s.theme}/>
    <div className="editor-layout">
      <section className="editor-main" aria-label="QR world editor">
        <div className="editor-stage"><div className="editor-stage__canvas">{s.model ? <RendererStage ref={rendererRef} mode={s.renderer} model={s.model} colors={s.colors} sizePx={560} theme={s.theme} experienceView={s.experienceView} buildNonce={s.buildNonce} leafPalette={s.living.leafPalette} customLeafColors={customColors} customTrunk={s.living.customTreePalette.trunk} studioPreview onToggleView={isDiorama ? () => changeView(s.experienceView === "scan" ? "experience" : "scan") : undefined} onWebglError={s.reportWebglFailure} standardRounded={s.standardRounded} logoDataUrl={s.logo.dataUrl} logoAreaFraction={s.logo.areaFraction} cityRoofDetail={s.city.roofDetail} cityTime={s.city.time} particleState={s.particle.state} particleCount={s.particle.particleCount} mosaicImageDataUrl={s.mosaic.imageDataUrl} mosaicSafeMode={s.mosaic.safeMode}/> : <p>{s.buildError}</p>}</div></div>
        <button className={`editor-hint lf-focus${s.urlError ? " is-error" : ""}`} type="button" onClick={() => changeView(s.experienceView === "scan" ? "experience" : "scan")}>{hint}</button>
        <div className="editor-url"><input className="lf-input" type="url" aria-label="Your link" value={s.rawUrl} onChange={(e) => updateUrl(e.target.value)} onBlur={s.commitUrl} onKeyDown={(e) => e.key === "Enter" && s.commitUrl()}/><button type="button" className="lf-btn lf-focus" onClick={copyConfig}>Share</button></div>
        {s.urlError ? <p className="editor-error">{s.urlError}</p> : null}
        <div className="editor-control"><span>World</span><div>{MODES.map((m) => <button key={m.id} type="button" className="lf-pill lf-focus" data-active={s.renderer === m.id} onClick={() => changeMode(m.id)}>{m.label}</button>)}</div></div>
        <div className="editor-control"><span>Theme</span><ThemePills value={s.theme} onChange={changeTheme}/></div>
        {s.renderer === "city" ? <div className="editor-control"><span>Time</span><div className="lf-seg" role="radiogroup" aria-label="City time"><button type="button" className="lf-focus" data-active={s.city.time === "day"} aria-pressed={s.city.time === "day"} aria-label="Day city lighting" onClick={() => s.setCity({ time: "day" })}>Day</button><button type="button" className="lf-focus" data-active={s.city.time === "night"} aria-pressed={s.city.time === "night"} aria-label="Night city lighting" onClick={() => s.setCity({ time: "night" })}>Night</button></div></div> : null}
        <div className="editor-control"><span>View</span><Segmented value={s.experienceView} onChange={changeView}/></div>
        <div className="editor-extras">
          {s.renderer === "living" ? <><span>Tree leaves</span>{LEAVES.map((leaf) => <button key={leaf} type="button" className="lf-pill lf-focus" data-active={s.living.leafPalette === leaf} onClick={() => s.setLiving({ leafPalette: leaf })}>{leaf}</button>)}<button type="button" className="lf-pill lf-focus" title="Reset view" aria-label="Reset view" onClick={() => window.dispatchEvent(new CustomEvent("linkforge:reset-living-view"))}>↻</button></> : null}
          {s.renderer === "city" ? <><label><input type="checkbox" checked={s.city.roofDetail} onChange={(e) => s.setCity({ roofDetail: e.target.checked })}/> Rooftop detail</label><button type="button" className="lf-pill lf-focus" title="Reset view" aria-label="Reset view" onClick={() => window.dispatchEvent(new CustomEvent("linkforge:reset-city-view"))}>↻</button></> : null}
          {s.renderer === "particle" ? <><Segmented value={s.particle.state === "assembled" ? "scan" : "experience"} onChange={(v) => changeView(v === "scan" ? "scan" : "experience")}/><label>Particles {s.particle.particleCount}<input className="lf-range" type="range" min="2000" max="9000" step="500" value={s.particle.particleCount} onChange={(e) => s.setParticle({ particleCount: Number(e.target.value) })}/></label></> : null}
          {s.renderer === "mosaic" ? <><label className="lf-btn editor-upload">Upload image<input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = () => s.setMosaic({ imageDataUrl: String(reader.result), imageError: null }); reader.readAsDataURL(file); }}/></label><label><input type="checkbox" checked={s.mosaic.safeMode} onChange={(e) => s.setMosaic({ safeMode: e.target.checked })}/> Safe mode</label></> : null}
        </div>
        <AnimatePresence initial={false}>{s.renderer === "living" && s.living.leafPalette === "custom" ? <motion.section className="custom-foliage" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: .2 }}><h2>Custom foliage</h2><div className="custom-foliage__grid"><PaletteControl label="Primary foliage colour" value={s.living.customTreePalette.leafPrimary} onChange={(v) => setPalette("leafPrimary", v)}/><PaletteControl label="Secondary foliage colour" value={s.living.customTreePalette.leafSecondary} onChange={(v) => setPalette("leafSecondary", v)}/><PaletteControl label="Accent foliage colour" value={s.living.customTreePalette.leafAccent} onChange={(v) => setPalette("leafAccent", v)}/><PaletteControl label="Trunk colour" value={s.living.customTreePalette.trunk} onChange={(v) => setPalette("trunk", v)}/></div><div className="custom-foliage__actions"><button type="button" className="lf-linkbtn lf-focus" onClick={() => s.setLiving({ customTreePalette: CURATED_PALETTES[Math.floor(Math.random() * CURATED_PALETTES.length)] })}>Randomize palette</button><button type="button" className="lf-linkbtn lf-focus" onClick={() => s.setLiving({ customTreePalette: DEFAULT_PALETTE })}>Reset</button></div></motion.section> : null}</AnimatePresence>
      </section>
      <aside className="editor-panel lf-panel">
        {s.model ? <CaptionPlate url={s.normalizedUrl} meta={plateMeta}/> : null}
        <section><h2>About this world</h2><p>Modules {s.model?.size}x{s.model?.size}</p><p>Error correction {s.model?.ec}</p><p>Version {s.model?.version}</p><p>Seed {seed}</p><small>The shape comes from your link; the theme only changes colours.</small></section>
        <section><h2>Export</h2><label>Resolution<select className="lf-input" value={s.exportResolution} onChange={(e) => s.setExportResolution(Number(e.target.value) as ExportResolution)}><option value={1024}>1024 px</option><option value={2048}>2048 px</option><option value={4096}>4096 px</option></select></label><button className="lf-btn lf-focus editor-download" type="button" disabled={!s.model || busy !== null} onClick={exportPng}><StudioIcon name="download"/>{busy === "png" ? "Checking" : "Download PNG"}</button>{(s.renderer === "mosaic" || s.renderer === "standard") ? <button className="lf-linkbtn lf-focus" type="button" onClick={exportSvgFile}>Download SVG</button> : null}<p className={s.lastVerification && !s.lastVerification.ok ? "editor-error" : "editor-status"}>{s.lastVerification?.ok ? "Scans correctly" : "Doesn't scan yet - increase contrast or enable safe mode"}</p>{notice ? <p className="editor-status">{notice}</p> : null}</section>
        <section><h2>Share</h2><button className="lf-linkbtn lf-focus" type="button" onClick={copyConfig}>Copy configuration link</button></section>
      </aside>
    </div>
  </main>;
}

function PaletteControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return <label className="palette-control"><span>{label}</span><input aria-label={label} type="color" value={value} onChange={(e) => { setDraft(e.target.value.toUpperCase()); onChange(e.target.value); }}/><input aria-label={`${label} hex value`} value={draft} maxLength={7} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (isHex(draft)) onChange(draft); else setDraft(value); }}/></label>;
}
