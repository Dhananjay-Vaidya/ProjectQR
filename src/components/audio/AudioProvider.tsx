"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RendererMode } from "@/types/qr";
import type { ThemeName } from "@/lib/living/themes";
import {
  AUDIO_TRACKS,
  DEFAULT_AUDIO_TRACK_ID,
  DEFAULT_AUDIO_VOLUME,
  getAudioTrack,
  getRecommendedTrackId,
  type AudioTrack,
} from "@/lib/audioThemes";

const STORAGE_KEY = "lf-soundtrack";
const CROSSFADE_MS = 1050;
const VISIBILITY_FADE_MS = 450;

interface PersistedAudioState {
  soundEnabled: boolean;
  selectedTrackId: string;
  volume: number;
  ambientEnabled: boolean;
  autoMatchEnabled: boolean;
}

interface AudioContextValue extends PersistedAudioState {
  currentTrack: AudioTrack;
  tracks: AudioTrack[];
  playing: boolean;
  panelOpen: boolean;
  unavailableIds: string[];
  message: string | null;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
  setSoundEnabled: (enabled: boolean) => void;
  toggleSound: () => void;
  play: () => void;
  pause: () => void;
  selectTrack: (trackId: string, manual?: boolean) => void;
  setVolume: (volume: number) => void;
  setAmbientEnabled: (enabled: boolean) => void;
  setAutoMatchEnabled: (enabled: boolean) => void;
  previousTrack: () => void;
  nextTrack: () => void;
  setWorld: (mode?: RendererMode, theme?: ThemeName) => void;
}

const AudioContext = createContext<AudioContextValue | null>(null);

function clampVolume(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : DEFAULT_AUDIO_VOLUME));
}

function loadInitialState(): PersistedAudioState {
  if (typeof window === "undefined") {
    return {
      soundEnabled: false,
      selectedTrackId: DEFAULT_AUDIO_TRACK_ID,
      volume: DEFAULT_AUDIO_VOLUME,
      ambientEnabled: true,
      autoMatchEnabled: false,
    };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) throw new Error("No saved audio state");
    const saved = JSON.parse(raw) as Partial<PersistedAudioState>;
    return {
      soundEnabled: saved.soundEnabled === true,
      selectedTrackId: typeof saved.selectedTrackId === "string" ? saved.selectedTrackId : DEFAULT_AUDIO_TRACK_ID,
      volume: clampVolume(typeof saved.volume === "number" ? saved.volume : DEFAULT_AUDIO_VOLUME),
      ambientEnabled: saved.ambientEnabled !== false,
      autoMatchEnabled: saved.autoMatchEnabled === true,
    };
  } catch {
    return {
      soundEnabled: false,
      selectedTrackId: DEFAULT_AUDIO_TRACK_ID,
      volume: DEFAULT_AUDIO_VOLUME,
      ambientEnabled: true,
      autoMatchEnabled: false,
    };
  }
}

function fadeAudio(audio: HTMLAudioElement, from: number, to: number, durationMs: number, done?: () => void) {
  const start = performance.now();
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    audio.volume = clampVolume(from + (to - from) * t);
    if (t < 1) {
      requestAnimationFrame(tick);
    } else {
      done?.();
    }
  };
  audio.volume = clampVolume(from);
  requestAnimationFrame(tick);
}

const DEFAULT_STATE: PersistedAudioState = {
  soundEnabled: false,
  selectedTrackId: DEFAULT_AUDIO_TRACK_ID,
  volume: DEFAULT_AUDIO_VOLUME,
  ambientEnabled: true,
  autoMatchEnabled: false,
};

export function AudioProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedAudioState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [unavailableIds, setUnavailableIds] = useState<string[]>(() => AUDIO_TRACKS.filter((track) => !track.available).map((track) => track.id));
  const channels = useRef<[HTMLAudioElement | null, HTMLAudioElement | null]>([null, null]);
  const activeIndex = useRef(0);
  const gestureReady = useRef(false);
  const startedOnce = useRef(false);
  const hiddenRef = useRef(false);
  const stateRef = useRef(state);

  useEffect(() => {
    const restored = loadInitialState();
    stateRef.current = restored;
    setState(restored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    stateRef.current = state;
    if (hydrated) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  useEffect(() => {
    channels.current = [new Audio(), new Audio()];
    for (const audio of channels.current) {
      if (!audio) continue;
      audio.loop = true;
      audio.preload = "metadata";
      audio.crossOrigin = "anonymous";
    }

    const onFirstGesture = () => {
      gestureReady.current = true;
      const current = stateRef.current;
      if (current.soundEnabled && current.ambientEnabled) void startTrack(current.selectedTrackId, false);
    };
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    window.addEventListener("keydown", onFirstGesture, { once: true });

    const onVisibility = () => {
      hiddenRef.current = document.visibilityState === "hidden";
      const active = channels.current[activeIndex.current];
      if (!active || !stateRef.current.soundEnabled || !stateRef.current.ambientEnabled || active.paused) return;
      const target = hiddenRef.current ? stateRef.current.volume * 0.2 : stateRef.current.volume;
      fadeAudio(active, active.volume, target, VISIBILITY_FADE_MS);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
      for (const audio of channels.current) {
        if (!audio) continue;
        audio.pause();
        audio.src = "";
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markUnavailable = useCallback((trackId: string) => {
    setUnavailableIds((ids) => ids.includes(trackId) ? ids : [...ids, trackId]);
    setMessage("Audio track unavailable");
  }, []);

  const startTrack = useCallback(async (trackId: string, crossfade: boolean) => {
    const track = getAudioTrack(trackId);
    if (!track.available || unavailableIds.includes(track.id)) {
      markUnavailable(track.id);
      return;
    }
    if (!gestureReady.current) {
      setPlaying(false);
      return;
    }

    const current = channels.current[activeIndex.current];
    const nextIndex = crossfade ? 1 - activeIndex.current : activeIndex.current;
    const next = channels.current[nextIndex];
    if (!next) return;

    try {
      next.preload = "metadata";
      if (!next.src.endsWith(track.src)) next.src = track.src;
      next.loop = true;
      next.volume = crossfade ? 0 : (hiddenRef.current ? stateRef.current.volume * 0.2 : stateRef.current.volume);
      await next.play();
      startedOnce.current = true;
      setPlaying(true);
      setMessage(null);

      const target = hiddenRef.current ? stateRef.current.volume * 0.2 : stateRef.current.volume;
      if (crossfade && current && current !== next && !current.paused) {
        fadeAudio(next, 0, target, CROSSFADE_MS);
        fadeAudio(current, current.volume, 0, CROSSFADE_MS, () => {
          current.pause();
          current.removeAttribute("src");
          current.load();
        });
      } else {
        fadeAudio(next, next.volume, target, 240);
      }
      activeIndex.current = nextIndex;
    } catch {
      markUnavailable(track.id);
      setPlaying(false);
    }
  }, [markUnavailable, unavailableIds]);

  const selectTrack = useCallback((trackId: string) => {
    setState((current) => ({ ...current, selectedTrackId: trackId }));
    const crossfade = startedOnce.current && playing;
    if (stateRef.current.soundEnabled && stateRef.current.ambientEnabled) void startTrack(trackId, crossfade);
  }, [playing, startTrack]);

  const setSoundEnabled = useCallback((enabled: boolean) => {
    setState((current) => ({ ...current, soundEnabled: enabled }));
    if (enabled) {
      gestureReady.current = true;
      void startTrack(stateRef.current.selectedTrackId, false);
    } else {
      const active = channels.current[activeIndex.current];
      if (active) fadeAudio(active, active.volume, 0, 500, () => active.pause());
      setPlaying(false);
    }
  }, [startTrack]);

  const play = useCallback(() => setSoundEnabled(true), [setSoundEnabled]);
  const pause = useCallback(() => setSoundEnabled(false), [setSoundEnabled]);
  const toggleSound = useCallback(() => setSoundEnabled(!stateRef.current.soundEnabled), [setSoundEnabled]);
  const togglePanel = useCallback(() => setPanelOpen((open) => !open), []);

  const setVolume = useCallback((volume: number) => {
    const nextVolume = clampVolume(volume);
    setState((current) => ({ ...current, volume: nextVolume }));
    const active = channels.current[activeIndex.current];
    if (active && stateRef.current.soundEnabled) fadeAudio(active, active.volume, hiddenRef.current ? nextVolume * 0.2 : nextVolume, 180);
  }, []);

  const setAmbientEnabled = useCallback((enabled: boolean) => {
    setState((current) => ({ ...current, ambientEnabled: enabled }));
    const active = channels.current[activeIndex.current];
    if (enabled && stateRef.current.soundEnabled) {
      void startTrack(stateRef.current.selectedTrackId, false);
    } else if (active) {
      fadeAudio(active, active.volume, 0, 400, () => {
        active.pause();
        setPlaying(false);
      });
    }
  }, [startTrack]);

  const setAutoMatchEnabled = useCallback((enabled: boolean) => {
    setState((current) => ({ ...current, autoMatchEnabled: enabled }));
  }, []);

  const availableTracks = useMemo(() => AUDIO_TRACKS.filter((track) => track.available && !unavailableIds.includes(track.id)), [unavailableIds]);

  const moveBy = useCallback((step: number) => {
    const index = Math.max(0, availableTracks.findIndex((track) => track.id === stateRef.current.selectedTrackId));
    const next = availableTracks[(index + step + availableTracks.length) % availableTracks.length];
    if (next) selectTrack(next.id);
  }, [availableTracks, selectTrack]);

  const previousTrack = useCallback(() => moveBy(-1), [moveBy]);
  const nextTrack = useCallback(() => moveBy(1), [moveBy]);

  const setWorld = useCallback((mode?: RendererMode, theme?: ThemeName) => {
    if (!stateRef.current.autoMatchEnabled) return;
    const recommendation = getRecommendedTrackId(mode, theme);
    if (recommendation !== stateRef.current.selectedTrackId) selectTrack(recommendation);
  }, [selectTrack]);

  const value = useMemo<AudioContextValue>(() => ({
    ...state,
    currentTrack: getAudioTrack(state.selectedTrackId),
    tracks: AUDIO_TRACKS,
    playing,
    panelOpen,
    unavailableIds,
    message,
    setPanelOpen,
    togglePanel,
    setSoundEnabled,
    toggleSound,
    play,
    pause,
    selectTrack,
    setVolume,
    setAmbientEnabled,
    setAutoMatchEnabled,
    previousTrack,
    nextTrack,
    setWorld,
  }), [message, panelOpen, pause, play, playing, previousTrack, nextTrack, selectTrack, setAmbientEnabled, setAutoMatchEnabled, setSoundEnabled, setVolume, setWorld, state, togglePanel, toggleSound, unavailableIds]);

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudioContext() {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudioContext must be used inside AudioProvider");
  return context;
}


