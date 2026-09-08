/**
 * City themes = time of day. Presentation only — never changes geometry.
 * A theme switch lerps every colour and the window lit-fraction over 500ms.
 *
 * Dark data/finder rooftops stay dark and light modules stay light in ALL
 * three themes, so the top-down verified export still decodes.
 */

import type { ThemeName } from "@/lib/living/themes";

export interface CityTheme {
  /** Three facade tones, dark → light or warm range. */
  facades: [string, string, string];
  /** Rooftop colour — always dark, never lighter than the facades. */
  roof: string;
  /** Unlit window glass. */
  glass: string;
  /** One or two lit-window tones. */
  litColors: [string, string];
  /** Fraction of windows lit (0–1). */
  litFraction: number;
  /** Emissive strength added by a lit window. */
  windowEmissive: number;
  /** Fraction of lit windows that flicker slowly. */
  flickerFraction: number;
  /** Street run tile colour. */
  street: string;
  /** Centre-dash colour on street runs. */
  streetDash: string;
  /** Plaza tile colour. */
  plaza: string;
  /** Whether perimeter / plaza lamps glow. */
  lampLit: boolean;
  lampColor: string;
  /** Key-light elevation in degrees (90 = overhead noon, 15 = low dusk). */
  keyElevationDeg: number;
  keyIntensity: number;
  ambientIntensity: number;
  hemiIntensity: number;
  contactShadowOpacity: number;
  /** Page background override for this theme (null = leave the page as-is). */
  stageBg: string | null;
  /** Grass-tip accent reused by Living (Part C). */
  accent: string;
  /** Cars get emissive headlight dots. */
  carHeadlights: boolean;
  night: boolean;
}

export const CITY_THEMES: Record<ThemeName, CityTheme> = {
  // Verdant = day
  verdant: {
    facades: ["#D9D2C3", "#C6BFB0", "#B1AA9B"],
    roof: "#3B4A3E",
    glass: "#56605C",
    litColors: ["#56605C", "#56605C"],
    litFraction: 0,
    windowEmissive: 0,
    flickerFraction: 0,
    street: "#E8E3D8",
    streetDash: "#F3EFE6",
    plaza: "#ECE7DB",
    lampLit: false,
    lampColor: "#FFE6B0",
    keyElevationDeg: 62,
    keyIntensity: 1.15,
    ambientIntensity: 2.0,
    hemiIntensity: 1.35,
    contactShadowOpacity: 0.28,
    stageBg: null,
    accent: "#7FD24A",
    carHeadlights: false,
    night: false,
  },
  // Ember = dusk
  ember: {
    facades: ["#CDB79A", "#B89C7D", "#9E846A"],
    roof: "#4E3A2E",
    glass: "#4A4038",
    litColors: ["#FFD27A", "#FFD27A"],
    litFraction: 0.35,
    windowEmissive: 0.8,
    flickerFraction: 0,
    street: "#DED3C2",
    streetDash: "#EFE3CE",
    plaza: "#E2D7C4",
    lampLit: true,
    lampColor: "#FFCE86",
    keyElevationDeg: 15,
    keyIntensity: 1.05,
    ambientIntensity: 1.1,
    hemiIntensity: 0.7,
    contactShadowOpacity: 0.42,
    stageBg: null,
    accent: "#F5A623",
    carHeadlights: true,
    night: false,
  },
  // Neon Bloom = night
  neon: {
    facades: ["#4C4A66", "#3F3D57", "#33324A"],
    roof: "#23223A",
    glass: "#2E2C44",
    litColors: ["#BFF3FF", "#FFD1F0"],
    litFraction: 0.7,
    windowEmissive: 1.0,
    flickerFraction: 0.05,
    street: "#6B6A85",
    streetDash: "#807FA0",
    plaza: "#5E5D78",
    lampLit: true,
    lampColor: "#FFE9C4",
    keyElevationDeg: 40,
    keyIntensity: 0.35,
    ambientIntensity: 0.55,
    hemiIntensity: 0.4,
    contactShadowOpacity: 0.5,
    stageBg: "#2A2941",
    accent: "#F7A8CF",
    carHeadlights: true,
    night: true,
  },
};

export function cityTheme(name: ThemeName): CityTheme {
  return CITY_THEMES[name];
}

export const CITY_TIME_THEMES: Record<"day" | "night", CityTheme> = {
  day: {
    ...CITY_THEMES.verdant,
    litColors: ["#6A716D", "#F2B866"],
    litFraction: 0.08,
    windowEmissive: 0.08,
    stageBg: "linear-gradient(180deg, #F7F3EA 0%, #E9F3F6 100%)",
  },
  night: {
    ...CITY_THEMES.neon,
    facades: ["#536069", "#47545D", "#3D4A52"],
    roof: "#26323A",
    glass: "#071015",
    litColors: ["#FFD78A", "#A8D3FF"],
    litFraction: 0.68,
    windowEmissive: 2.1,
    flickerFraction: 0.08,
    street: "#132025",
    streetDash: "#273940",
    plaza: "#18262B",
    lampColor: "#F2B866",
    keyIntensity: 0.46,
    ambientIntensity: 0.78,
    hemiIntensity: 0.54,
    stageBg: "linear-gradient(180deg, #09120F 0%, #111A22 100%)",
  },
};
