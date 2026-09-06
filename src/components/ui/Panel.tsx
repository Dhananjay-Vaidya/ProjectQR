import type { ReactNode } from "react";

/** A restrained panel surface. Single 1px border, radius <= 2px, no glow. */
export function Panel({
  children,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "aside";
}) {
  return (
    <Tag
      className={className}
      style={{
        background: "var(--lf-panel)",
        border: "1px solid var(--lf-panel-border)",
        borderRadius: "var(--lf-radius)",
      }}
    >
      {children}
    </Tag>
  );
}

export function FieldGroup({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div style={{ display: "grid", gap: "var(--lf-space-2)" }}>
      <span
        style={{
          fontSize: "0.75rem",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--lf-fg-muted)",
        }}
      >
        {label}
      </span>
      {children}
      {hint ? (
        <span style={{ fontSize: "0.75rem", color: "var(--lf-fg-faint)" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
