"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { audioEngine } from "@/lib/audio/engine";
import type { AudioTheme } from "@/lib/audio/types";
interface AudioState { enabled: boolean; volume: number; toggle: () => void; setTheme: (theme: AudioTheme) => void; setReveal: (progress: number) => void; setActivity: (activity: "landing" | "editor") => void; }
export const useAudioStore = create<AudioState>()(persist((set, get) => ({ enabled: false, volume: 0.6, toggle: () => { const next = !get().enabled; set({ enabled: next }); if (next) audioEngine.enable(); else audioEngine.disable(); }, setTheme: (theme) => audioEngine.setTheme(theme), setReveal: (progress) => audioEngine.setReveal(progress), setActivity: (activity) => audioEngine.setActivity(activity) }), { name: "lf-audio", partialize: (s) => ({ enabled: s.enabled, volume: s.volume }), onRehydrateStorage: () => (state) => { if (state) audioEngine.setVolume(state.volume); } }));
if (typeof window !== "undefined") { document.addEventListener("visibilitychange", () => document.hidden ? audioEngine.suspend() : audioEngine.resume()); window.addEventListener("pointerdown", () => { if (useAudioStore.getState().enabled) audioEngine.enable(); }, { once: true }); }
