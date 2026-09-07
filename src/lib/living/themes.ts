/**
 * LinkForge diorama themes — PRESENTATION ONLY. A theme never changes geometry;
 * switching a theme lerps every material colour to the new target over 500ms.
 *
 * Default theme is VERDANT. The web viewer uses theme.stage = "transparent"
 * (the page's own sky gradient shows through the Canvas); the opaque `stage`
 * colour is used only for PNG/SVG export backgrounds.
 */

export type ThemeName = "neon" | "verdant" | "ember";

export interface DioramaTheme {
  /** Opaque stage colour — used for export backgrounds only. */
  stage: string;
  /** Platform slab. */
  slab: string;
  /** Light QR module tile. */
  light: string;
  /** Dark QR module tile — this is also the site's runtime --lf-accent. */
  dark: string;
  /** Trunk / structural wood. */
  wood: string;
  /** Three foliage tones. */
  leaves: [string, string, string];
  /** Rare accent voxel colour. */
  accent: string;
  /** Two ground-decor (grass) tones — [tip/light, blade/dark]. */
  grass: [string, string];
  /** Emissive decoration colour (theme "neon" / "ember" ambient particles). */
  shard: string;
  /** Ember-style vertical rain. `null` = no rain for this theme. */
  rain: { desktop: number; mobile: number } | null;
  /** Fraction of grass blades that get a coloured tip (Neon Bloom pink). */
  pinkTips: number;
  /** Baseline count of resting fallen leaves near the trunk. */
  fallenBase: number;
  /** Leaves that detach and tumble per minute. */
  leafFall: number;
}

export const THEMES: Record<ThemeName, DioramaTheme> = {
  neon: {
    stage: "#F6F1E7",
    slab: "#CFC7B9",
    light: "#F7F3EA",
    dark: "#4C4A66",
    wood: "#6E4B34",
    leaves: ["#FFD1E8", "#F7A8CF", "#E07FB4"],
    accent: "#E07FB4",
    grass: ["#7FD24A", "#5FB43A"],
    shard: "#FFFFFF",
    rain: null,
    pinkTips: 0.15,
    fallenBase: 34,
    leafFall: 4,
  },
  verdant: {
    stage: "#F6F1E7",
    slab: "#CFC7B9",
    light: "#F7F3EA",
    dark: "#3B4A3E",
    wood: "#6E4B34",
    leaves: ["#B9F07A", "#7ED957", "#4EA83A"],
    accent: "#4EA83A",
    grass: ["#7FD24A", "#5FB43A"],
    shard: "#FFF3B0",
    rain: null,
    pinkTips: 0,
    fallenBase: 34,
    leafFall: 4,
  },
  ember: {
    stage: "#F6F1E7",
    slab: "#CFC7B9",
    light: "#F7F3EA",
    dark: "#4E3A2E",
    wood: "#6E4B34",
    leaves: ["#FFD37A", "#F5A623", "#D9761F"],
    accent: "#D9761F",
    grass: ["#E2C25C", "#C9A63F"],
    shard: "#FFD37A",
    rain: { desktop: 400, mobile: 160 },
    pinkTips: 0,
    fallenBase: 60,
    leafFall: 12,
  },
};

export const THEME_LABEL: Record<ThemeName, string> = {
  neon: "Neon Bloom",
  verdant: "Verdant",
  ember: "Ember",
};

export const THEME_ORDER: ThemeName[] = ["neon", "verdant", "ember"];

export const DEFAULT_THEME: ThemeName = "verdant";

/** Living: only Ember carries weather (vertical rain). The others sway. */
export function themeHasParticles(name: ThemeName): boolean {
  return THEMES[name].rain !== null;
}
