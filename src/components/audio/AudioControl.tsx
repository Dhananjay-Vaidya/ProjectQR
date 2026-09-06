"use client";

import { AUDIO_GROUP_LABELS, type AudioMood } from "@/lib/audioThemes";
import { useAudio } from "@/hooks/useAudio";

const MOOD_ORDER: AudioMood[] = ["nature", "calm", "future", "digital", "cinematic"];

export function AudioControl({ className = "" }: { className?: string }) {
  const audio = useAudio();
  const playing = audio.soundEnabled && audio.ambientEnabled && audio.playing;

  return (
    <div className={`lf-audio ${className}`} data-open={audio.panelOpen ? "true" : "false"}>
      <button
        type="button"
        className="lf-audio-toggle lf-focus"
        aria-label={audio.soundEnabled ? "Disable background sound" : "Enable background sound"}
        aria-pressed={playing}
        title={audio.soundEnabled ? "Sound on" : "Sound off"}
        onClick={audio.togglePanel}
      >
        <span className="lf-audio-speaker" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M4 9.5h3.7L13 5v14l-5.3-4.5H4v-5Z" />
            {!audio.soundEnabled ? <path d="m17 9 4 4m0-4-4 4" /> : null}
          </svg>
        </span>
        <span className="lf-audio-bars" data-playing={playing ? "true" : "false"} aria-hidden="true">
          <i /><i /><i /><i />
        </span>
      </button>

      {audio.panelOpen ? (
        <div className="lf-audio-panel" role="dialog" aria-label="Background audio settings">
          <div className="lf-audio-panel__head">
            <div>
              <span>Now Playing</span>
              <strong>{audio.currentTrack.label}</strong>
            </div>
            <button type="button" className="lf-audio-close lf-focus" aria-label="Close audio panel" onClick={() => audio.setPanelOpen(false)}>Close</button>
          </div>

          {audio.message ? <p className="lf-audio-message" role="status">{audio.message}</p> : null}

          <div className="lf-audio-row">
            <span>Sound</span>
            <div className="lf-audio-seg" role="group" aria-label="Background sound">
              <button type="button" className="lf-focus" data-active={audio.soundEnabled ? "true" : "false"} onClick={() => audio.setSoundEnabled(true)}>ON</button>
              <button type="button" className="lf-focus" data-active={!audio.soundEnabled ? "true" : "false"} onClick={() => audio.setSoundEnabled(false)}>OFF</button>
            </div>
          </div>

          <div className="lf-audio-actions">
            <button type="button" className="lf-audio-mini lf-focus" onClick={audio.previousTrack} aria-label="Previous track">Previous</button>
            <button type="button" className="lf-audio-mini lf-focus" onClick={audio.soundEnabled ? audio.pause : audio.play} aria-label={audio.soundEnabled ? "Pause background sound" : "Play background sound"}>{audio.soundEnabled ? "Pause" : "Play"}</button>
            <button type="button" className="lf-audio-mini lf-focus" onClick={audio.nextTrack} aria-label="Next track">Next</button>
          </div>

          <div className="lf-audio-tracks" aria-label="Track selector">
            {MOOD_ORDER.map((mood) => {
              const tracks = audio.tracks.filter((track) => track.mood === mood);
              return (
                <div className="lf-audio-group" key={mood}>
                  <span>{AUDIO_GROUP_LABELS[mood]}</span>
                  {tracks.map((track) => {
                    const unavailable = !track.available || audio.unavailableIds.includes(track.id);
                    const selected = audio.selectedTrackId === track.id;
                    return (
                      <button
                        type="button"
                        key={track.id}
                        className="lf-audio-track lf-focus"
                        data-selected={selected ? "true" : "false"}
                        disabled={unavailable}
                        aria-label={`Select ${track.label}`}
                        onClick={() => audio.selectTrack(track.id)}
                      >
                        <i aria-hidden="true" />
                        <span>{track.label}</span>
                        {unavailable ? <small>Unavailable</small> : null}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>

          <label className="lf-audio-volume">
            <span>Background audio volume</span>
            <strong>{Math.round(audio.volume * 100)}%</strong>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(audio.volume * 100)}
              aria-label="Background audio volume"
              onChange={(event) => audio.setVolume(Number(event.target.value) / 100)}
            />
          </label>

          <label className="lf-audio-switch">
            <span>Ambient</span>
            <input type="checkbox" checked={audio.ambientEnabled} onChange={(event) => audio.setAmbientEnabled(event.target.checked)} />
          </label>
          <label className="lf-audio-switch">
            <span>Auto-match to world</span>
            <input aria-label="Enable automatic soundtrack matching" type="checkbox" checked={audio.autoMatchEnabled} onChange={(event) => audio.setAutoMatchEnabled(event.target.checked)} />
          </label>
        </div>
      ) : null}

      {audio.panelOpen ? <button type="button" className="lf-audio-backdrop" aria-label="Close audio panel" onClick={() => audio.setPanelOpen(false)} /> : null}
    </div>
  );
}

export function EnterWithSound() {
  const audio = useAudio();
  if (audio.soundEnabled) return null;

  return (
    <button type="button" className="lf-enter-sound lf-focus" onClick={audio.play}>
      Enter with sound
    </button>
  );
}

