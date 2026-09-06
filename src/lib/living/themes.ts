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
  /** Two ground-decor (grass) tones. */
  grass: [string, string];
  /** Emissive decoration colour (theme "neon" / "ember" ambient particles). */
  shard: string;
}

export const THEMES: Record<ThemeName, DioramaTheme> = {
  neon: {
    stage: "#F4F1F7",
    slab: "#DAD5E2",
    light: "#F9F7FC",
    dark: "#4C4A66",
    wood: "#5B5470",
    leaves: ["#8FE3F5", "#B79CFF", "#F6A5E1"],
    accent: "#FFD1F0",
    grass: ["#C9C4E8", "#B4AEDC"],
    shard: "#FFFFFF",
  },
  verdant: {
    stage: "#F5F0E6",
    slab: "#D8CFC0",
    light: "#F7F3EA",
    dark: "#3B4A3E",
    wood: "#7A5A3C",
    leaves: ["#1F7A4D", "#2E9E62", "#9BE05A"],
    accent: "#E8F7B0",
    grass: ["#7DBF5A", "#5EA347"],
    shard: "#FFF3B0",
  },
  ember: {
    stage: "#F7F1E4",
    slab: "#DCCFB8",
    light: "#FAF4E8",
    dark: "#4E3A2E",
    wood: "#5A3E2E",
    leaves: ["#D98A2B", "#F0B43C", "#B8471F"],
    accent: "#FFE08A",
    grass: ["#C9A85C", "#B08F45"],
    shard: "#FFD37A",
  },
};

export const THEME_LABEL: Record<ThemeName, string> = {
  neon: "Neon Bloom",
  verdant: "Verdant",
  ember: "Ember",
};

export const THEME_ORDER: ThemeName[] = ["neon", "verdant", "ember"];

export const DEFAULT_THEME: ThemeName = "verdant";

/** Does this theme use falling emissive shard particles? Verdant sways instead. */
export function themeHasParticles(name: ThemeName): boolean {
  return name === "neon" || name === "ember";
}
