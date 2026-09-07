"use client";

import { useEffect } from "react";
import type { ThemeName } from "@/lib/living/themes";
import { useAudioContext } from "@/components/audio/AudioProvider";

export function useAudio() {
  return useAudioContext();
}

/** Keeps the ambient bed matched to the active theme (when "Match theme" is on). */
export function useAudioWorld(theme?: ThemeName) {
  const audio = useAudioContext();
  useEffect(() => {
    audio.applyTheme(theme);
  }, [audio, theme]);
}
