"use client";
import { useAudioStore } from "@/stores/audioStore";

export function AudioToggle() {
  const enabled = useAudioStore((s) => s.enabled);
  const toggle = useAudioStore((s) => s.toggle);

  return (
    <button
      type="button"
      className="lf-audio-toggle lf-focus"
      aria-label={enabled ? "Turn ambient audio off" : "Turn ambient audio on"}
      aria-pressed={enabled}
      title={enabled ? "Ambient audio on" : "Ambient audio off"}
      onClick={toggle}
    >
      <span className="lf-audio-speaker" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M4 9.5h3.7L13 5v14l-5.3-4.5H4v-5Z" />
          <path className="lf-audio-wave lf-audio-wave--one" d="M16 9.2c.8.8 1.2 1.8 1.2 2.8s-.4 2-1.2 2.8" />
          <path className="lf-audio-wave lf-audio-wave--two" d="M18.5 6.7A7.2 7.2 0 0 1 21 12a7.2 7.2 0 0 1-2.5 5.3" />
        </svg>
      </span>
    </button>
  );
}
