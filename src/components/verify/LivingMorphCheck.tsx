"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { buildQRModel } from "@/lib/qr";
import { DEFAULT_QR_COLORS } from "@/types/qr";
import { type ThemeName, THEME_ORDER, THEME_LABEL } from "@/lib/living/themes";
const LivingTreeQR = dynamic(() => import("@/components/qr/LivingTreeQR"), { ssr: false });
/** A reproducible freeze-frame viewer for the morph and flat-render handoff. */
export function LivingMorphCheck() {
    const [open, setOpen] = useState(false), [progress, setProgress] = useState(0), [theme, setTheme] = useState<ThemeName>("verdant");
    const [flat, setFlat] = useState(true);
    const model = useMemo(() => buildQRModel("https://linkforge.app/demo", "H").model, []);
    return <section>
    <button className="lf-focus" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>Inspect Living morph</button>
    {open ? <>
      <div style={{ height: 520, maxWidth: 640 }}>
        <LivingTreeQR model={model} colors={DEFAULT_QR_COLORS} sizePx={360} view="experience" theme={theme} buildNonce={0} inspectProgress={progress} inspectFlat={flat}/>
      </div>
      <label>Reveal progress <input aria-label="Living reveal progress" type="range" min={0} max={1} step={.001} value={progress} onChange={e => setProgress(Number(e.target.value))}/></label>
      <output>{(progress * .75).toFixed(3)} seconds</output>
      <label><input type="checkbox" checked={flat} onChange={e => setFlat(e.target.checked)}/>Verified flat handoff</label>
      <select aria-label="Living inspection theme" value={theme} onChange={e => setTheme(e.target.value as ThemeName)}>
        {THEME_ORDER.map(t => <option key={t} value={t}>{THEME_LABEL[t]}</option>)}
      </select>
    </> : null}
  </section>;
}
