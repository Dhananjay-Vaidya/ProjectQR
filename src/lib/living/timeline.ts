export const LIVING_REVEAL_SECONDS = .75;
export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
export const ease = (v: number) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
export function leafProgress(seconds: number, normalizedDistance: number) {
    // The requested stagger formula finishes the last leaf at .70s.
    return clamp01((seconds - (.1 + .25 * (1 - normalizedDistance))) / .35);
}
export function leafOvershoot(p: number) {
    return p < .7 ? -.15 * Math.sin(Math.PI / 2 * p / .7) : -.15 * Math.cos(Math.PI / 2 * (p - .7) / .3);
}
