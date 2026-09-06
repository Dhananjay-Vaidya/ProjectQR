import type { AudioScene, AudioTheme } from "./types";

/** Optional licensed Artlist loop slots. Empty by default; procedural beds remain the source. */
export const AUDIO_SAMPLES: Record<AudioTheme, string | undefined> = { neon: undefined, verdant: undefined, ember: undefined };

type Ctx = AudioContext;
const rng = () => Math.random();
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function impulse(ctx: Ctx, seconds: number) {
  const buffer = ctx.createBuffer(2, ctx.sampleRate * seconds, ctx.sampleRate);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) data[i] = (rng() * 2 - 1) * Math.pow(1 - i / data.length, 2.2);
  }
  return buffer;
}

function noise(ctx: Ctx, brown = false) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < data.length; i++) {
    const white = rng() * 2 - 1;
    last = brown ? (last + white * 0.08) * 0.998 : white;
    data[i] = clamp(brown ? last * 3.5 : white, -1, 1);
  }
  return buffer;
}

function envelope(ctx: Ctx, gain: GainNode, attack: number, release: number) {
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(1, now + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
}

function neon(ctx: Ctx): AudioScene {
  const out = ctx.createGain(); out.gain.value = 0.42;
  const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 1200;
  const verb = ctx.createConvolver(); verb.buffer = impulse(ctx, 3.5);
  const wet = ctx.createGain(); wet.gain.value = 0.4;
  const nodes: AudioNode[] = [out, filter, verb, wet];
  [0, 7, 12].forEach((semitones, i) => {
    const osc = ctx.createOscillator(); osc.type = "sine"; osc.frequency.value = 164.81 * Math.pow(2, semitones / 12);
    osc.detune.value = i === 1 ? 4 : i === 2 ? -4 : 0; osc.start(); nodes.push(osc); osc.connect(filter);
  });
  filter.connect(out); filter.connect(verb); verb.connect(wet); wet.connect(out);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const bell = () => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "sine"; o.frequency.value = [659, 784, 988, 1175, 1318][Math.floor(rng() * 5)]; g.gain.value = 0.25; o.connect(g); g.connect(verb); envelope(ctx, g, 0.01, 2.8); o.start(); o.stop(ctx.currentTime + 3); timer = setTimeout(bell, 6000 + rng() * 8000); };
  return { connect: (dest) => out.connect(dest), start: () => { bell(); }, stop: () => { if (timer) clearTimeout(timer); nodes.forEach((n) => { try { (n as OscillatorNode).stop?.(); } catch {} }); } };
}

function verdant(ctx: Ctx): AudioScene {
  const out = ctx.createGain(); out.gain.value = 0.24;
  const filter = ctx.createBiquadFilter(); filter.type = "bandpass"; filter.Q.value = 0.7; filter.frequency.value = 500;
  const src = ctx.createBufferSource(); src.buffer = noise(ctx); src.loop = true; src.connect(filter); filter.connect(out); src.start();
  let chirpTimer: ReturnType<typeof setTimeout> | undefined;
  const chirp = () => { const g = ctx.createGain(); const o = ctx.createOscillator(); const m = ctx.createOscillator(); o.frequency.value = 2500 + rng() * 1500; m.frequency.value = 18 + rng() * 12; const mg = ctx.createGain(); mg.gain.value = 90; m.connect(mg); mg.connect(o.frequency); o.connect(g); g.gain.value = 0.15; g.connect(out); envelope(ctx, g, 0.005, 0.08); o.start(); m.start(); o.stop(ctx.currentTime + 0.11); m.stop(ctx.currentTime + 0.11); chirpTimer = setTimeout(chirp, 5000 + rng() * 7000); };
  return { connect: (dest) => out.connect(dest), start: () => chirp(), stop: () => { if (chirpTimer) clearTimeout(chirpTimer); try { src.stop(); } catch {} } };
}

function ember(ctx: Ctx): AudioScene {
  const out = ctx.createGain(); out.gain.value = 0.3;
  const filter = ctx.createBiquadFilter(); filter.type = "lowpass"; filter.frequency.value = 220; filter.Q.value = 1.2;
  [98, 98].forEach((f, i) => { const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = i ? 6 : -6; o.connect(filter); o.start(); });
  filter.connect(out);
  const crack = () => { const s = ctx.createBufferSource(); const f = ctx.createBiquadFilter(); const g = ctx.createGain(); s.buffer = noise(ctx, true); f.type = "highpass"; f.frequency.value = 2000; g.gain.value = 0.12; s.connect(f); f.connect(g); g.connect(out); s.start(); s.stop(ctx.currentTime + 0.01 + rng() * 0.08); setTimeout(crack, 80 + rng() * 520); };
  return { connect: (dest) => out.connect(dest), start: crack, stop: () => {} };
}

export function createScene(ctx: AudioContext, theme: AudioTheme): AudioScene { return theme === "neon" ? neon(ctx) : theme === "ember" ? ember(ctx) : verdant(ctx); }
