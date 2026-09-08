"use client";

/** Applies ?mode=living|city|particle|mosaic|standard and ?url=... once on mount. */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useEditorStore } from "@/stores/editorStore";
import { RENDERER_MODES, type RendererMode } from "@/types/qr";
import type { ThemeName } from "@/lib/living/themes";

export function ModeFromQuery() {
  const params = useSearchParams();
  const setRenderer = useEditorStore((s) => s.setRenderer);
  const setRawUrl = useEditorStore((s) => s.setRawUrl);
  const commitUrl = useEditorStore((s) => s.commitUrl);
  const setTheme = useEditorStore((s) => s.setTheme);
  const setCity = useEditorStore((s) => s.setCity);

  useEffect(() => {
    const m = params.get("mode") === "particles" ? "particle" : params.get("mode");
    if (m && (RENDERER_MODES as readonly string[]).includes(m)) {
      setRenderer(m as RendererMode);
    }
    const url = params.get("url");
    if (url) {
      setRawUrl(url);
      queueMicrotask(commitUrl);
    }
    const theme = params.get("theme");
    if (theme === "neon-bloom") setTheme("neon");
    else if (theme === "verdant" || theme === "ember") setTheme(theme as ThemeName);
    const time = params.get("time");
    if (time === "day" || time === "night") setCity({ time });
  }, [params, commitUrl, setRawUrl, setRenderer, setTheme, setCity]);

  return null;
}
