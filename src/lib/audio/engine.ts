import { createScene } from "./scenes";
import type { AudioActivity, AudioScene, AudioTheme } from "./types";

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private scene: AudioScene | null = null;
  private theme: AudioTheme = "verdant";
  private enabled = false;
  private reveal = 0;
  private lastReveal = 0;
  private activity: AudioActivity = "landing";
  private volume = 0.6;

  private ensure() {
    if (this.ctx) return;
    this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.gain.value = 0.0001; this.master.connect(this.ctx.destination);
  }
  enable() { this.ensure(); if (!this.ctx || !this.master) return; this.enabled = true; void this.ctx.resume(); if (!this.scene) { this.scene = createScene(this.ctx, this.theme); this.scene.connect(this.master); this.scene.start(); } this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.linearRampToValueAtTime(0.18 * this.volume, this.ctx.currentTime + 1.5); }
  disable() { this.enabled = false; if (!this.ctx || !this.master) return; this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 1.5); }
  setTheme(theme: AudioTheme) { if (theme === this.theme) return; this.theme = theme; if (!this.enabled || !this.ctx || !this.master) return; const old = this.scene; const next = createScene(this.ctx, theme); const g = this.ctx.createGain(); g.gain.value = 0.0001; next.connect(g); g.connect(this.master); next.start(); g.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 2); if (old) setTimeout(() => old.stop(), 2100); this.scene = next; }
  setVolume(volume: number) { this.volume = Math.max(0, Math.min(1, volume)); if (this.ctx && this.master && this.enabled) this.master.gain.linearRampToValueAtTime(0.18 * this.volume, this.ctx.currentTime + 0.3); }
  setReveal(progress: number) { this.reveal = Math.max(0, Math.min(1, progress)); if (!this.ctx || !this.master || !this.enabled) return; const duck = 0.18 * this.volume * Math.pow(10, -9 / 20); this.master.gain.cancelScheduledValues(this.ctx.currentTime); this.master.gain.linearRampToValueAtTime(this.reveal > 0.01 && this.reveal < 0.99 ? duck : 0.18 * this.volume, this.ctx.currentTime + 0.8); if (this.lastReveal < 0.6 && this.reveal >= 0.6) this.chime(); this.lastReveal = this.reveal; }
  setActivity(activity: AudioActivity) { this.activity = activity; }
  private chime() { if (!this.ctx || !this.master) return; const o = this.ctx.createOscillator(); const g = this.ctx.createGain(); o.type = "sine"; o.frequency.setValueAtTime(this.theme === "ember" ? 220 : this.theme === "verdant" ? 440 : 880, this.ctx.currentTime); o.frequency.exponentialRampToValueAtTime(o.frequency.value * 1.25, this.ctx.currentTime + 0.35); g.gain.value = 0.3; o.connect(g); g.connect(this.master); envelope(g, this.ctx); o.start(); o.stop(this.ctx.currentTime + 0.8); }
  suspend() { if (this.ctx && this.ctx.state === "running") void this.ctx.suspend(); }
  resume() { if (this.enabled && this.ctx && this.ctx.state === "suspended") void this.ctx.resume(); }
}
function envelope(g: GainNode, ctx: AudioContext) { g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.75); }
export const audioEngine = new AudioEngine();
