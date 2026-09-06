export type AudioTheme = "neon" | "verdant" | "ember";
export type AudioActivity = "landing" | "editor";
export interface AudioThemeConfig { sample?: string; }

export interface AudioScene {
  connect(dest: AudioNode): void;
  start(): void;
  stop(): void;
}
