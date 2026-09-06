"use client";

import { useEffect } from "react";
import type { RendererMode } from "@/types/qr";
import type { ThemeName } from "@/lib/living/themes";
import { useAudioContext } from "@/components/audio/AudioProvider";

export function useAudio() {
  return useAudioContext();
}

export function useAudioWorld(mode?: RendererMode, theme?: ThemeName) {
  const audio = useAudioContext();

  useEffect(() => {
    audio.setWorld(mode, theme);
  }, [audio, mode, theme]);
}
