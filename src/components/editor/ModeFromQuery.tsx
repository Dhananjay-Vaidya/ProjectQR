"use client";

/** Applies ?mode=living|city|particle|mosaic|standard and ?url=... once on mount. */

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useEditorStore } from "@/stores/editorStore";
import { RENDERER_MODES, type RendererMode } from "@/types/qr";

export function ModeFromQuery() {
  const params = useSearchParams();
  const setRenderer = useEditorStore((s) => s.setRenderer);
  const setRawUrl = useEditorStore((s) => s.setRawUrl);
  const commitUrl = useEditorStore((s) => s.commitUrl);

  useEffect(() => {
    const m = params.get("mode");
    if (m && (RENDERER_MODES as readonly string[]).includes(m)) {
      setRenderer(m as RendererMode);
    }
    const url = params.get("url");
    if (url) {
      setRawUrl(url);
      queueMicrotask(commitUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
