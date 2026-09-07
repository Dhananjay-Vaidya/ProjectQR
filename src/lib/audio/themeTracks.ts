import type { ThemeName } from "@/lib/living/themes";
import { DEFAULT_TRACK_ID } from "./library";

/**
 * The theme → default-track map. Edit it here and nowhere else.
 *
 *   Neon Bloom → Relaxation
 *   Verdant    → Forest Walk
 *   Ember      → Hazy After Hours
 */
export const THEME_TRACKS: Record<ThemeName, string> = {
  neon: "relaxation",
  verdant: "forest-walk",
  ember: "hazy-after-hours",
};

export function trackForTheme(theme: ThemeName | undefined): string {
  return (theme && THEME_TRACKS[theme]) || DEFAULT_TRACK_ID;
}
