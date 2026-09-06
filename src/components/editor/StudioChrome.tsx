"use client";

import { LayoutGroup, motion, useReducedMotion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

export type StudioIconName = "world" | "qr" | "palette" | "download" | "copy" | "check" | "refresh" | "arrow" | "leaf";

export function StudioIcon({ name, className = "" }: { name: StudioIconName; className?: string }) {
  const paths: Record<StudioIconName, ReactNode> = {
    world: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9M8 5.3l8 4.5"/></>,
    qr: <><rect x="3" y="3" width="6" height="6" rx=".5"/><rect x="15" y="3" width="6" height="6" rx=".5"/><rect x="3" y="15" width="6" height="6" rx=".5"/><path d="M15 15h3v3h3v3h-6v-3M12 3v3m0 4v3H3m9 4v4m9-9h-5v-2"/></>,
    palette: <><path d="M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1.4-3.4 1.8 1.8 0 0 1 1.3-3.1H18c2 0 3-1.4 3-3.5A9 9 0 0 0 12 3Z"/><circle cx="8" cy="8" r=".7"/><circle cx="13" cy="6.8" r=".7"/><circle cx="17" cy="9.5" r=".7"/><circle cx="6.5" cy="13" r=".7"/></>,
    download: <><path d="M12 3v12m-4-4 4 4 4-4M4 15v5h16v-5"/></>,
    copy: <><path d="M9 7V4h5l3 3v10h-3"/><rect x="5" y="7" width="9" height="13" rx="1.5"/><path d="M14 4v3h3"/></>,
    check: <path d="m5 12 4.5 4.5L19 7"/>,
    refresh: <><path d="M19 8A7 7 0 0 0 6 6L3 9m0-5v5h5m-3 7a7 7 0 0 0 13 2l3-3m0 5v-5h-5"/></>,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5"/>,
    leaf: <><path d="M20 3C9 2 3 7 5 14c2 7 13 5 15-11Z"/><path d="M4 21 15 9"/></>,
  };
  return <svg className={`studio-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function StudioPills<T extends string>({ label, value, options, onChange, segmented = false }: {
  label: string; value: T; options: { value: T; label: string; color?: string }[];
  onChange: (value: T) => void; segmented?: boolean;
}) {
  const reduced = useReducedMotion();
  return <LayoutGroup>
    <div className={`studio-pills${segmented ? " studio-pills--segmented" : ""}`} role="group" aria-label={label}>
      {options.map(option => <motion.button key={option.value} type="button" className="studio-pill lf-focus" aria-pressed={value === option.value}
        onClick={() => onChange(option.value)} whileHover={reduced ? undefined : { y: -1 }} whileTap={reduced ? undefined : { scale: .98 }}>
        {value === option.value && <motion.span className="studio-pill__active" layoutId="selected" transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 35 }}/>}
        <span className="studio-pill__label">{option.color && <i className="studio-pill__dot" style={{ background: option.color }}/>} {option.label}</span>
      </motion.button>)}
    </div>
  </LayoutGroup>;
}

function LeafShape({ className, style }: { className?: string; style?: CSSProperties }) {
  return <svg viewBox="0 0 52 80" className={className} style={style} aria-hidden="true"><path d="M45 3C10 6-7 35 10 57 28 76 49 52 45 3Z" fill="currentColor"/><path d="M5 77C15 46 31 30 41 11" fill="none" stroke="var(--studio-bg)" strokeWidth=".8" opacity=".5"/></svg>;
}

export function StudioAtmosphere({ living, scan }: { living: boolean; scan: boolean }) {
  const reduced = useReducedMotion();
  return <div className="studio-atmosphere" aria-hidden="true" data-visible={living && !scan}>
    <div className="studio-corner studio-corner--top"><LeafShape/><LeafShape/><LeafShape/></div>
    <div className="studio-corner studio-corner--bottom"><LeafShape/><LeafShape/><LeafShape/></div>
    <div className="studio-lightshaft"/>
    {[0, 1, 2, 3].map(i => <motion.div key={i} className={`studio-floating-leaf studio-floating-leaf--${i}`}
      animate={reduced || !living || scan ? undefined : { y: [0, -12, 0], rotate: [0, 7, 0] }}
      transition={{ duration: 9 + i * 2.3, repeat: Infinity, ease: "easeInOut", delay: i * .8 }}><LeafShape/></motion.div>)}
  </div>;
}
