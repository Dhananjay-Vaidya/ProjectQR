"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useAudio } from "@/hooks/useAudio";
import type { AudioTrack } from "@/lib/audio/library";

const VISIBLE_ROWS = 6;
const LONG_PRESS_MS = 500;

function Equaliser({ animated }: { animated: boolean }) {
  return (
    <span className={`lf-sound-eq${animated ? " is-live" : ""}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function SpeakerIcon({ slash }: { slash: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M4 9.5h3.7L13 5v14l-5.3-4.5H4v-5Z" />
      {slash ? <path d="m16.5 9 5 6m0-6-5 6" strokeLinecap="round" /> : null}
    </svg>
  );
}

export function AudioControl({ className = "" }: { className?: string }) {
  const audio = useAudio();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);

  const [moreOpen, setMoreOpen] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const { setPopoverOpen, popoverOpen } = audio;
  const flatTracks = useMemo(() => audio.groups.flatMap((g) => g.tracks), [audio.groups]);
  const selectedBeyondFold =
    flatTracks.findIndex((t) => t.id === audio.trackId) >= VISIBLE_ROWS;
  const showAll = moreOpen || selectedBeyondFold;

  /* ---- popover open / close plumbing ---- */
  const close = useCallback(() => {
    setPopoverOpen(false);
    buttonRef.current?.focus();
  }, [setPopoverOpen]);

  useEffect(() => {
    if (!popoverOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPopoverOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    const onScroll = (e: Event) => {
      if (!popoverRef.current?.contains(e.target as Node)) setPopoverOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
    const first = popoverRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [popoverOpen, close, setPopoverOpen]);

  /* focus trap */
  const onPopoverKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const focusables = popoverRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const list = Array.from(focusables);
    const firstEl = list[0];
    const lastEl = list[list.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && document.activeElement === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };

  /* ---- button gestures ---- */
  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const onButtonPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button === 2) return;
    longPressed.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      audio.toggleEnabled();
    }, LONG_PRESS_MS);
  };
  const onButtonClick = () => {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    audio.togglePopover();
  };
  const onButtonContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    audio.toggleEnabled();
  };

  /* ---- track listbox keyboard ---- */
  const onListKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const visible = showAll ? flatTracks : flatTracks.slice(0, VISIBLE_ROWS);
    const currentId = focusedId ?? audio.trackId;
    const idx = visible.findIndex((t) => t.id === currentId);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = e.key === "ArrowDown" ? Math.min(visible.length - 1, idx + 1) : Math.max(0, idx - 1);
      const id = visible[next]?.id;
      if (id) {
        setFocusedId(id);
        popoverRef.current?.querySelector<HTMLElement>(`[data-track="${id}"]`)?.focus();
      }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (visible[idx]) audio.selectTrack(visible[idx].id);
    } else if (e.key === "Home") {
      e.preventDefault();
      setFocusedId(visible[0]?.id ?? null);
      popoverRef.current?.querySelector<HTMLElement>(`[data-track="${visible[0]?.id}"]`)?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = visible[visible.length - 1];
      setFocusedId(last?.id ?? null);
      popoverRef.current?.querySelector<HTMLElement>(`[data-track="${last?.id}"]`)?.focus();
    }
  };

  /* ---- mobile bottom-sheet drag ---- */
  const dragStartY = useRef<number | null>(null);
  const onHandlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    dragStartY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null || !popoverRef.current) return;
    const dy = Math.max(0, e.clientY - dragStartY.current);
    popoverRef.current.style.transform = `translateY(${dy}px)`;
  };
  const onHandlePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStartY.current === null || !popoverRef.current) return;
    const dy = e.clientY - dragStartY.current;
    popoverRef.current.style.transform = "";
    dragStartY.current = null;
    if (dy > 100) audio.setPopoverOpen(false);
  };

  const renderRow = (track: AudioTrack) => {
    const selected = track.id === audio.trackId;
    return (
      <button
        key={track.id}
        type="button"
        role="option"
        aria-selected={selected}
        data-track={track.id}
        data-selected={selected ? "true" : "false"}
        tabIndex={(focusedId ?? audio.trackId) === track.id ? 0 : -1}
        className="lf-sound-track lf-focus"
        onClick={() => audio.selectTrack(track.id)}
        onFocus={() => setFocusedId(track.id)}
      >
        <span className="lf-sound-track__title">{track.title}</span>
        <span className="lf-sound-track__play" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5.5v13l11-6.5-11-6.5Z" />
          </svg>
        </span>
      </button>
    );
  };

  return (
    <div
      ref={rootRef}
      className={`lf-sound ${className}`}
      data-open={audio.popoverOpen ? "true" : "false"}
    >
      <button
        ref={buttonRef}
        type="button"
        className="lf-sound-btn lf-focus"
        aria-pressed={audio.enabled}
        aria-label="Ambient sound"
        aria-haspopup="dialog"
        aria-expanded={audio.popoverOpen}
        title="Ambient sound"
        onPointerDown={onButtonPointerDown}
        onPointerUp={clearLongPress}
        onPointerLeave={clearLongPress}
        onClick={onButtonClick}
        onContextMenu={onButtonContextMenu}
      >
        {audio.enabled ? <Equaliser animated={audio.playing} /> : <SpeakerIcon slash />}
      </button>

      {audio.popoverOpen ? (
        <>
          <div className="lf-sound-scrim" aria-hidden="true" onPointerDown={() => audio.setPopoverOpen(false)} />
          <div
            ref={popoverRef}
            className="lf-sound-popover"
            role="dialog"
            aria-label="Ambient sound"
            onKeyDown={onPopoverKeyDown}
          >
            <div
              className="lf-sound-popover__handle"
              aria-hidden="true"
              onPointerDown={onHandlePointerDown}
              onPointerMove={onHandlePointerMove}
              onPointerUp={onHandlePointerUp}
            >
              <span />
            </div>

            {/* 1 — sound switch + volume */}
            <div className="lf-sound-row lf-sound-row--top">
              <label className="lf-sound-switch">
                <input
                  type="checkbox"
                  checked={audio.enabled}
                  onChange={(e) => audio.setEnabled(e.target.checked)}
                />
                <span className="lf-sound-switch__track" aria-hidden="true" />
                <span className="lf-sound-switch__label">Sound</span>
              </label>
              <input
                className="lf-sound-volume"
                type="range"
                min={0}
                max={100}
                value={Math.round(audio.volume * 100)}
                aria-label="Volume"
                onChange={(e) => audio.setVolume(Number(e.target.value) / 100)}
              />
            </div>

            {/* 2 — now playing */}
            {audio.enabled ? (
              <div className="lf-sound-now" data-loading={audio.loading ? "true" : "false"}>
                <Equaliser animated={audio.playing} />
                <span className="lf-sound-now__text">
                  <span className="lf-sound-now__title">{audio.currentTrack.title}</span>
                  <span className="lf-sound-now__group">
                    {audio.loading ? "Buffering…" : audio.currentTrack.group}
                  </span>
                </span>
                <button
                  type="button"
                  className="lf-sound-now__toggle lf-focus"
                  aria-label={audio.playing ? "Pause" : "Play"}
                  onClick={audio.togglePlay}
                >
                  {audio.playing ? (
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8 5.5v13l11-6.5-11-6.5Z" />
                    </svg>
                  )}
                </button>
              </div>
            ) : null}

            {/* 3 — match theme */}
            <label className="lf-sound-match">
              <span className="lf-sound-match__head">
                <span>Match theme</span>
                <input
                  type="checkbox"
                  checked={audio.matchTheme}
                  onChange={(e) => audio.setMatchTheme(e.target.checked)}
                />
                <span className="lf-sound-switch__track" aria-hidden="true" />
              </span>
              <span className="lf-sound-match__hint">Picks a track for each world</span>
            </label>

            {/* 4 — track list */}
            <div className="lf-sound-list" role="listbox" aria-label="Tracks" onKeyDown={onListKeyDown}>
              {audio.groups.map((group) => {
                const rows = group.tracks.filter(
                  (t) => showAll || flatTracks.indexOf(t) < VISIBLE_ROWS,
                );
                if (rows.length === 0) return null;
                return (
                  <div className="lf-sound-group" key={group.group}>
                    <p className="lf-sound-group__head">{group.group}</p>
                    {rows.map(renderRow)}
                  </div>
                );
              })}
              {flatTracks.length > VISIBLE_ROWS && !showAll ? (
                <button
                  type="button"
                  className="lf-sound-more lf-focus"
                  onClick={() => setMoreOpen(true)}
                >
                  More
                </button>
              ) : null}
            </div>

            {/* 5 — credit */}
            {audio.currentTrack.credit ? (
              <p className="lf-sound-credit">{audio.currentTrack.credit}</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function EnterWithSound() {
  const audio = useAudio();
  if (audio.enabled) return null;
  return (
    <button type="button" className="lf-enter-sound lf-focus" onClick={() => audio.setEnabled(true)}>
      Enter with sound
    </button>
  );
}
