"use client";

/** Quiet placeholder while a lazy WebGL diorama loads. No spinner. */
export function StageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        width: "100%",
        aspectRatio: "1 / 1",
        display: "grid",
        placeItems: "center",
        color: "var(--lf-muted)",
        fontSize: 13,
        fontWeight: 500,
      }}
    >
      {label}
    </div>
  );
}
