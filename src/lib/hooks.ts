"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";

/** True when the user has asked for reduced motion. SSR-safe (defaults false). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * Reveal-on-scroll. Returns a ref callback to attach to the element and the
 * current in-view boolean. Uses IntersectionObserver, fires once, and is a
 * no-op (always visible) under reduced motion / no IO support.
 */
export function useInView(
  rootMargin = "0px 0px -12% 0px"
): { ref: (node: HTMLElement | null) => void; inView: boolean } {
  const reduced = usePrefersReducedMotion();
  const [inView, setInView] = useState(false);
  const nodeRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      nodeRef.current = node;
      if (!node) return;

      if (
        reduced ||
        typeof IntersectionObserver === "undefined"
      ) {
        setInView(true);
        return;
      }

      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setInView(true);
              observerRef.current?.disconnect();
              observerRef.current = null;
            }
          }
        },
        { rootMargin, threshold: 0.05 }
      );
      observerRef.current.observe(node);
    },
    [reduced, rootMargin]
  );

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  return { ref, inView };
}

/**
 * Pointer position within an element, as CSS-var-ready percentages. Returns a
 * ref callback and handlers; feeds `--lf-mx` / `--lf-my` for a cursor glow.
 * Disabled (centred) under reduced motion and on coarse pointers.
 */
export function useCursorGlow<T extends HTMLElement>(): {
  ref: (node: T | null) => void;
  onPointerMove: (e: ReactPointerEvent<T>) => void;
  onPointerLeave: () => void;
} {
  const reduced = usePrefersReducedMotion();
  const nodeRef = useRef<T | null>(null);

  const ref = useCallback((node: T | null) => {
    nodeRef.current = node;
  }, []);

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<T>) => {
      const node = nodeRef.current;
      if (!node || reduced || e.pointerType !== "mouse") return;
      const rect = node.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 100;
      const my = ((e.clientY - rect.top) / rect.height) * 100;
      node.style.setProperty("--lf-mx", `${mx.toFixed(1)}%`);
      node.style.setProperty("--lf-my", `${my.toFixed(1)}%`);
    },
    [reduced]
  );

  const onPointerLeave = useCallback(() => {
    const node = nodeRef.current;
    if (!node) return;
    node.style.setProperty("--lf-mx", "50%");
    node.style.setProperty("--lf-my", "40%");
  }, []);

  return { ref, onPointerMove, onPointerLeave };
}

/**
 * Tracks whether the document is currently visible AND (optionally) an element
 * is intersecting the viewport. R3F scenes read this to pause `useFrame` work
 * when the tab is hidden or the canvas is scrolled far off-screen.
 *
 * Returns { ref, active }: attach `ref` to the canvas wrapper; `active` is true
 * when it's worth animating.
 */
export function useSceneActive<T extends HTMLElement>(): {
  ref: (node: T | null) => void;
  active: boolean;
} {
  const [visible, setVisible] = useState(true);
  const [onScreen, setOnScreen] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const update = () => setVisible(document.visibilityState !== "hidden");
    update();
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  const ref = useCallback((node: T | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node || typeof IntersectionObserver === "undefined") {
      setOnScreen(true);
      return;
    }
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setOnScreen(e.isIntersecting);
      },
      { rootMargin: "200px" }
    );
    observerRef.current.observe(node);
  }, []);

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return { ref, active: visible && onScreen };
}

/** One-shot WebGL capability probe. */
export function detectWebgl(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}
