"use client";

/**
 * Shared UI for the display case: pills, segmented control, the caption plate
 * device, and the ThemeAccent effect that sets --lf-accent from the active
 * theme's dark tile so the whole page quietly retunes (300ms transition is on
 * the properties that read it).
 */

import { useEffect, type ReactNode } from "react";
import { THEMES, THEME_LABEL, THEME_ORDER, type ThemeName } from "@/lib/living/themes";

/** Reads the active theme and writes its `dark` colour to --lf-accent. */
export function ThemeAccent({ theme }: { theme: ThemeName }) {
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--lf-accent", THEMES[theme].dark);
    root.style.transition = "background-color 300ms ease";
    return () => {
      root.style.removeProperty("--lf-accent");
    };
  }, [theme]);
  return null;
}

export function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="lf-pill lf-focus"
      data-active={active ? "true" : "false"}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function ThemePills({
  value,
  onChange,
}: {
  value: ThemeName;
  onChange: (t: ThemeName) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
    >
      {THEME_ORDER.map((t) => (
        <Pill key={t} active={value === t} onClick={() => onChange(t)}>
          {THEME_LABEL[t]}
        </Pill>
      ))}
    </div>
  );
}

export function Segmented({
  value,
  onChange,
}: {
  value: "experience" | "scan";
  onChange: (v: "experience" | "scan") => void;
}) {
  return (
    <div className="lf-seg" role="radiogroup" aria-label="View">
      <button
        type="button"
        className="lf-focus"
        data-active={value === "experience" ? "true" : "false"}
        aria-pressed={value === "experience"}
        onClick={() => onChange("experience")}
      >
        Experience
      </button>
      <button
        type="button"
        className="lf-focus"
        data-active={value === "scan" ? "true" : "false"}
        aria-pressed={value === "scan"}
        onClick={() => onChange("scan")}
      >
        Scan
      </button>
    </div>
  );
}

/** The recurring caption-plate device: hairline rule, mono URL, plain meta line. */
export function CaptionPlate({
  url,
  meta,
  hoverBright = false,
}: {
  url: string;
  meta: string;
  hoverBright?: boolean;
}) {
  return (
    <div className={`lf-plate${hoverBright ? " lf-plate--hover" : ""}`}>
      <span className="lf-plate__url">{shortHost(url)}</span>
      <span className="lf-plate__meta">{meta}</span>
    </div>
  );
}

function shortHost(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
