import type { ReactNode } from "react";

type Tone = "ok" | "fail" | "warn" | "neutral";

const toneColor: Record<Tone, string> = {
  ok: "var(--lf-ok)",
  fail: "var(--lf-danger)",
  warn: "var(--lf-warning)",
  neutral: "var(--lf-fg-muted)",
};

/**
 * Status pill. Never relies on colour alone — always carries a text label and
 * a shape glyph (● pass, ▲ warn, ✕ fail).
 */
export function StatusBadge({
  tone,
  children,
}: {
  tone: Tone;
  children: ReactNode;
}) {
  const glyph =
    tone === "ok" ? "●" : tone === "fail" ? "✕" : tone === "warn" ? "▲" : "○";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        fontSize: "0.75rem",
        fontWeight: 600,
        letterSpacing: "0.04em",
        color: toneColor[tone],
        border: `1px solid ${toneColor[tone]}`,
        borderRadius: "var(--lf-radius)",
        padding: "0.25rem 0.55rem",
        textTransform: "uppercase",
      }}
    >
      <span aria-hidden="true">{glyph}</span>
      {children}
    </span>
  );
}
