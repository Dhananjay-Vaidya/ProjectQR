"use client";

/**
 * Ambient-audio engine.
 *
 * Two <audio> elements played alternately; every level change is a gain ramp
 * (enable/disable 1.2s, track switch and loop-point 2s equal-power crossfade),
 * never a hard cut. Master output is capped at 0.35; the stored volume is a
 * fraction of that cap. Off by default; the first enable must come from a user
 * gesture. State ({ enabled, volume, trackId, matchTheme }) persists in
 * localStorage key "lf-audio" and survives client navigation.
 */

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
import { usePathname } from "next/navigation";
import type { ThemeName } from "@/lib/living/themes";
import {
  AUDIO_LIBRARY,
  DEFAULT_TRACK_ID,
  DEFAULT_VOLUME_FRACTION,
  DUCK_FACTOR,
  VOLUME_CAP,
  getTrack,
  groupedTracks,
  type AudioTrack,
} from "@/lib/audio/library";
import { trackForTheme } from "@/lib/audio/themeTracks";

const STORAGE_KEY = "lf-audio";
const ENABLE_RAMP_MS = 1200;
const SWITCH_RAMP_MS = 2000;
const NAV_OUT_MS = 300;
const NAV_IN_MS = 1000;
const HIDE_OUT_MS = 300;
const SHOW_IN_MS = 800;

interface PersistedAudio {
  enabled: boolean;
  volume: number; // slider fraction 0..1 of VOLUME_CAP
  trackId: string;
  matchTheme: boolean;
}

const DEFAULTS: PersistedAudio = {
  enabled: false,
  volume: DEFAULT_VOLUME_FRACTION,
  trackId: DEFAULT_TRACK_ID,
  matchTheme: true,
};

export interface AudioApi {
  enabled: boolean;
  playing: boolean;
  loading: boolean;
  /** Slider position, 0..1 (fraction of the 0.35 cap). */
  volume: number;
  cap: number;
  trackId: string;
  currentTrack: AudioTrack;
  matchTheme: boolean;
  popoverOpen: boolean;
  groups: { group: string; tracks: AudioTrack[] }[];
  liveMessage: string;
  setEnabled: (value: boolean) => void;
  toggleEnabled: () => void;
  setVolume: (fraction: number) => void;
  selectTrack: (id: string) => void;
  setMatchTheme: (value: boolean) => void;
  togglePlay: () => void;
  setPopoverOpen: (open: boolean) => void;
  togglePopover: () => void;
  setDucked: (ducked: boolean) => void;
  applyTheme: (theme: ThemeName | undefined) => void;
}

const Ctx = createContext<AudioApi | null>(null);

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

function loadState(): PersistedAudio {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const saved = JSON.parse(raw) as Partial<PersistedAudio>;
    const trackId =
      typeof saved.trackId === "string" && AUDIO_LIBRARY.some((t) => t.id === saved.trackId)
        ? saved.trackId
        : DEFAULT_TRACK_ID;
    return {
      enabled: saved.enabled === true,
      volume: typeof saved.volume === "number" ? clamp01(saved.volume) : DEFAULT_VOLUME_FRACTION,
      trackId,
      matchTheme: saved.matchTheme !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const [state, setState] = useState<PersistedAudio>(DEFAULTS);
  const [hydrated, setHydrated] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [liveMessage, setLiveMessage] = useState("");

  const chans = useRef<[HTMLAudioElement | null, HTMLAudioElement | null]>([null, null]);
  const warm = useRef<HTMLAudioElement | null>(null);
  const active = useRef(0);
  const fades = useRef<Map<HTMLAudioElement, number>>(new Map());
  const gestureReady = useRef(false);
  const ducked = useRef(false);
  const hiddenPaused = useRef(false);
  const loopArmed = useRef(false);
  const stateRef = useRef(state);
  const pausedRef = useRef(false); // user hit play/pause on the Now-playing row
  const lastTheme = useRef<ThemeName | undefined>(undefined);
  const firstPath = useRef(true);

  useEffect(() => {
    stateRef.current = state;
    if (hydrated) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        /* storage unavailable */
      }
    }
  }, [state, hydrated]);

  /* ---------- level ramps ---------- */

  const effVolume = useCallback(
    () => stateRef.current.volume * VOLUME_CAP * (ducked.current ? DUCK_FACTOR : 1),
    [],
  );

  const cancelFade = useCallback((el: HTMLAudioElement) => {
    const id = fades.current.get(el);
    if (id !== undefined) {
      cancelAnimationFrame(id);
      fades.current.delete(el);
    }
  }, []);

  const fadeTo = useCallback(
    (el: HTMLAudioElement, target: number, ms: number, done?: () => void) => {
      cancelFade(el);
      const from = el.volume;
      const start = performance.now();
      const tick = (now: number) => {
        const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms);
        el.volume = clamp01(from + (target - from) * t);
        if (t < 1) {
          fades.current.set(el, requestAnimationFrame(tick));
        } else {
          fades.current.delete(el);
          done?.();
        }
      };
      fades.current.set(el, requestAnimationFrame(tick));
    },
    [cancelFade],
  );

  const equalPowerCrossfade = useCallback(
    (toEl: HTMLAudioElement, fromEl: HTMLAudioElement, toTarget: number, ms: number, done?: () => void) => {
      cancelFade(toEl);
      cancelFade(fromEl);
      const fromStart = fromEl.volume;
      const start = performance.now();
      const tick = (now: number) => {
        const t = ms <= 0 ? 1 : Math.min(1, (now - start) / ms);
        const a = Math.sin((t * Math.PI) / 2);
        const b = Math.cos((t * Math.PI) / 2);
        toEl.volume = clamp01(toTarget * a);
        fromEl.volume = clamp01(fromStart * b);
        if (t < 1) {
          fades.current.set(toEl, requestAnimationFrame(tick));
        } else {
          fades.current.delete(toEl);
          fades.current.delete(fromEl);
          done?.();
        }
      };
      fades.current.set(toEl, requestAnimationFrame(tick));
    },
    [cancelFade],
  );

  /* ---------- playback ---------- */

  const announce = useCallback((text: string) => setLiveMessage(text), []);

  const preloadTheme = useCallback((theme: ThemeName | undefined) => {
    const el = warm.current;
    if (!el || !theme) return;
    const track = getTrack(trackForTheme(theme));
    if (!el.src.endsWith(track.src)) {
      el.src = track.src;
      el.preload = "auto";
      el.load();
    }
  }, []);

  const playTrack = useCallback(
    (id: string, opts: { fadeMs: number; fromSilence?: boolean }) => {
      const from = chans.current[active.current];
      const to = chans.current[1 - active.current];
      if (!to || !from || !gestureReady.current) return;
      const track = getTrack(id);

      if (!to.src.endsWith(track.src)) {
        to.src = track.src;
        to.load();
      }
      to.preload = "auto";
      try {
        to.currentTime = 0;
      } catch {
        /* not seekable yet */
      }
      to.volume = 0;
      to.dataset.trackId = id;

      void to
        .play()
        .then(() => {
          setPlaying(true);
          if (opts.fromSilence || from.paused) {
            fadeTo(to, effVolume(), opts.fadeMs);
            if (!from.paused) fadeTo(from, 0, opts.fadeMs, () => from.pause());
          } else {
            equalPowerCrossfade(to, from, effVolume(), opts.fadeMs, () => {
              from.pause();
            });
          }
          active.current = 1 - active.current;
          // Re-arm the loop watcher only once the new element is the active one.
          loopArmed.current = false;
        })
        .catch(() => {
          setPlaying(false);
        });
    },
    [effVolume, fadeTo, equalPowerCrossfade],
  );

  /* Loop point: start the other element 2s (loopCrossfadeSec) before the end. */
  const onTimeUpdate = useCallback(
    (event: Event) => {
      const el = event.target as HTMLAudioElement;
      if (el !== chans.current[active.current] || el.paused) return;
      const dur = el.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;
      const track = getTrack(el.dataset.trackId ?? stateRef.current.trackId);
      if (dur - el.currentTime <= track.loopCrossfadeSec && !loopArmed.current) {
        // Latch immediately so a second timeupdate before play() resolves
        // can't start a third element; playTrack clears it after the swap.
        loopArmed.current = true;
        playTrack(track.id, { fadeMs: track.loopCrossfadeSec * 1000 });
      }
    },
    [playTrack],
  );

  /* ---------- element wiring ---------- */

  useEffect(() => {
    const a = new Audio();
    const b = new Audio();
    const w = new Audio();
    for (const el of [a, b, w]) {
      el.loop = false;
      el.preload = "none";
      el.crossOrigin = "anonymous";
    }
    chans.current = [a, b];
    warm.current = w;

    const onWaiting = () => setLoading(true);
    const onReady = () => setLoading(false);
    const onPlay = () => setPlaying(true);
    for (const el of [a, b]) {
      el.addEventListener("timeupdate", onTimeUpdate);
      el.addEventListener("waiting", onWaiting);
      el.addEventListener("stalled", onWaiting);
      el.addEventListener("loadstart", onWaiting);
      el.addEventListener("canplay", onReady);
      el.addEventListener("playing", onReady);
      el.addEventListener("playing", onPlay);
    }

    return () => {
      for (const el of [a, b]) {
        el.removeEventListener("timeupdate", onTimeUpdate);
        el.removeEventListener("waiting", onWaiting);
        el.removeEventListener("stalled", onWaiting);
        el.removeEventListener("loadstart", onWaiting);
        el.removeEventListener("canplay", onReady);
        el.removeEventListener("playing", onReady);
        el.removeEventListener("playing", onPlay);
        el.pause();
        el.removeAttribute("src");
      }
      w.pause();
      w.removeAttribute("src");
    };
  }, [onTimeUpdate]);

  /* ---------- hydrate + arm the first gesture ---------- */

  useEffect(() => {
    const restored = loadState();
    stateRef.current = restored;
    pausedRef.current = false;
    setState(restored);
    setHydrated(true);

    if (!restored.enabled) return;
    const onFirstGesture = () => {
      gestureReady.current = true;
      if (stateRef.current.enabled && !pausedRef.current) {
        playTrack(stateRef.current.trackId, { fadeMs: ENABLE_RAMP_MS, fromSilence: true });
        preloadTheme(lastTheme.current);
      }
    };
    window.addEventListener("pointerdown", onFirstGesture, { once: true });
    window.addEventListener("keydown", onFirstGesture, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- visibility ---------- */

  useEffect(() => {
    const onVisibility = () => {
      const el = chans.current[active.current];
      if (!el) return;
      if (document.hidden) {
        if (!el.paused) {
          fadeTo(el, 0, HIDE_OUT_MS, () => el.pause());
          hiddenPaused.current = true;
          setPlaying(false);
        }
      } else if (hiddenPaused.current && stateRef.current.enabled && !pausedRef.current) {
        hiddenPaused.current = false;
        void el.play().then(() => {
          setPlaying(true);
          fadeTo(el, effVolume(), SHOW_IN_MS);
        });
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fadeTo, effVolume]);

  /* ---------- route change: clean dip, state preserved ---------- */

  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    const el = chans.current[active.current];
    const other = chans.current[1 - active.current];
    if (!el) return;
    if (other && !other.paused) {
      cancelFade(other);
      fadeTo(other, 0, NAV_OUT_MS, () => other.pause());
    }
    if (!el.paused) {
      fadeTo(el, 0, NAV_OUT_MS, () => {
        el.pause();
        setPlaying(false);
        if (stateRef.current.enabled && !pausedRef.current && !document.hidden) {
          requestAnimationFrame(() => {
            void el.play().then(() => {
              setPlaying(true);
              fadeTo(el, effVolume(), NAV_IN_MS);
            });
          });
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  /* ---------- public actions ---------- */

  const setEnabled = useCallback(
    (value: boolean) => {
      pausedRef.current = false;
      setState((s) => ({ ...s, enabled: value }));
      stateRef.current = { ...stateRef.current, enabled: value };
      if (value) {
        gestureReady.current = true;
        playTrack(stateRef.current.trackId, { fadeMs: ENABLE_RAMP_MS, fromSilence: true });
        preloadTheme(lastTheme.current);
        announce(`Ambient sound on. Now playing ${getTrack(stateRef.current.trackId).title}.`);
      } else {
        for (const el of chans.current) {
          if (el && !el.paused) fadeTo(el, 0, ENABLE_RAMP_MS, () => el.pause());
        }
        setPlaying(false);
        announce("Ambient sound off.");
      }
    },
    [playTrack, fadeTo, preloadTheme, announce],
  );

  const toggleEnabled = useCallback(() => setEnabled(!stateRef.current.enabled), [setEnabled]);

  const setVolume = useCallback(
    (fraction: number) => {
      const v = clamp01(fraction);
      setState((s) => ({ ...s, volume: v }));
      stateRef.current = { ...stateRef.current, volume: v };
      const el = chans.current[active.current];
      if (el && !el.paused) fadeTo(el, effVolume(), 160);
    },
    [fadeTo, effVolume],
  );

  const selectTrack = useCallback(
    (id: string) => {
      pausedRef.current = false;
      setState((s) => ({ ...s, trackId: id, matchTheme: false }));
      stateRef.current = { ...stateRef.current, trackId: id, matchTheme: false };
      announce(`Now playing ${getTrack(id).title}.`);
      if (stateRef.current.enabled) playTrack(id, { fadeMs: SWITCH_RAMP_MS });
    },
    [playTrack, announce],
  );

  const setMatchTheme = useCallback(
    (value: boolean) => {
      setState((s) => ({ ...s, matchTheme: value }));
      stateRef.current = { ...stateRef.current, matchTheme: value };
      if (value) {
        const id = trackForTheme(lastTheme.current);
        setState((s) => ({ ...s, trackId: id }));
        stateRef.current = { ...stateRef.current, trackId: id };
        preloadTheme(lastTheme.current);
        if (stateRef.current.enabled && chans.current[active.current]?.dataset.trackId !== id) {
          announce(`Match theme on. Now playing ${getTrack(id).title}.`);
          playTrack(id, { fadeMs: SWITCH_RAMP_MS });
        } else {
          announce("Match theme on.");
        }
      } else {
        announce("Match theme off.");
      }
    },
    [playTrack, preloadTheme, announce],
  );

  const applyTheme = useCallback(
    (theme: ThemeName | undefined) => {
      lastTheme.current = theme;
      if (!theme || !stateRef.current.matchTheme) return;
      const id = trackForTheme(theme);
      preloadTheme(theme);
      const playingId = chans.current[active.current]?.dataset.trackId;
      if (id === stateRef.current.trackId) {
        if (stateRef.current.enabled && playingId !== id) playTrack(id, { fadeMs: SWITCH_RAMP_MS });
        return;
      }
      setState((s) => ({ ...s, trackId: id }));
      stateRef.current = { ...stateRef.current, trackId: id };
      if (stateRef.current.enabled) {
        announce(`Now playing ${getTrack(id).title}.`);
        playTrack(id, { fadeMs: SWITCH_RAMP_MS });
      }
    },
    [playTrack, preloadTheme, announce],
  );

  const togglePlay = useCallback(() => {
    if (!stateRef.current.enabled) return;
    const el = chans.current[active.current];
    if (!el) return;
    const next = !pausedRef.current;
    pausedRef.current = next;
    if (next) {
      fadeTo(el, 0, 400, () => el.pause());
      setPlaying(false);
      announce("Paused.");
    } else {
      void el.play().then(() => {
        setPlaying(true);
        fadeTo(el, effVolume(), 800);
        announce(`Now playing ${getTrack(el.dataset.trackId ?? stateRef.current.trackId).title}.`);
      });
    }
  }, [fadeTo, effVolume, announce]);

  const setDucked = useCallback(
    (value: boolean) => {
      if (ducked.current === value) return;
      ducked.current = value;
      const el = chans.current[active.current];
      if (el && !el.paused) fadeTo(el, effVolume(), 400);
    },
    [fadeTo, effVolume],
  );

  const togglePopover = useCallback(() => setPopoverOpen((o) => !o), []);

  const value = useMemo<AudioApi>(
    () => ({
      enabled: state.enabled,
      playing,
      loading,
      volume: state.volume,
      cap: VOLUME_CAP,
      trackId: state.trackId,
      currentTrack: getTrack(state.trackId),
      matchTheme: state.matchTheme,
      popoverOpen,
      groups: groupedTracks(),
      liveMessage,
      setEnabled,
      toggleEnabled,
      setVolume,
      selectTrack,
      setMatchTheme,
      togglePlay,
      setPopoverOpen,
      togglePopover,
      setDucked,
      applyTheme,
    }),
    [
      state.enabled,
      state.volume,
      state.trackId,
      state.matchTheme,
      playing,
      loading,
      popoverOpen,
      liveMessage,
      setEnabled,
      toggleEnabled,
      setVolume,
      selectTrack,
      setMatchTheme,
      togglePlay,
      togglePopover,
      setDucked,
      applyTheme,
    ],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        role="status"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          margin: -1,
          padding: 0,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          clipPath: "inset(50%)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {liveMessage}
      </div>
    </Ctx.Provider>
  );
}

export function useAudioContext(): AudioApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAudioContext must be used inside AudioProvider");
  return ctx;
}
