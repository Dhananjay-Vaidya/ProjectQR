import type { RendererMode } from "@/types/qr";
import type { ThemeName } from "@/lib/living/themes";

export type AudioMood = "nature" | "calm" | "future" | "digital" | "cinematic";

export interface AudioTrack {
  id: string;
  label: string;
  src: string;
  mood: AudioMood;
  recommendedFor: string[];
  available: boolean;
}

export const AUDIO_GROUP_LABELS: Record<AudioMood, string> = {
  nature: "Nature / Organic",
  calm: "Calm / Focus",
  future: "Futuristic / Spatial",
  digital: "City / Digital",
  cinematic: "Warm / Cinematic",
};

export const AUDIO_TRACKS: AudioTrack[] = [
  {
    id: "forest-walk",
    label: "Forest Walk",
    src: "/audio/ambient/mixkit-forest-walk-607.mp3",
    mood: "nature",
    recommendedFor: ["living", "verdant"],
    available: true,
  },
  {
    id: "forest-treasure",
    label: "Forest Treasure",
    src: "/audio/ambient/mixkit-forest-treasure-138.mp3",
    mood: "nature",
    recommendedFor: ["living"],
    available: true,
  },
  {
    id: "relaxation",
    label: "Relaxation",
    src: "/audio/ambient/mixkit-relaxation-05-749.mp3",
    mood: "calm",
    recommendedFor: ["default"],
    available: true,
  },
  {
    id: "relax-beat",
    label: "Relax Beat",
    src: "/audio/ambient/mixkit-relax-beat-292.mp3",
    mood: "calm",
    recommendedFor: ["focus"],
    available: true,
  },
  {
    id: "hazy-after-hours",
    label: "Hazy After Hours",
    src: "/audio/ambient/mixkit-hazy-after-hours-132.mp3",
    mood: "calm",
    recommendedFor: ["mosaic"],
    available: true,
  },
  {
    id: "voxscape",
    label: "Voxscape",
    src: "/audio/ambient/mixkit-voxscape-571.mp3",
    mood: "future",
    recommendedFor: ["living", "neon"],
    available: true,
  },
  {
    id: "vastness",
    label: "Vastness",
    src: "/audio/ambient/mixkit-vastness-184.mp3",
    mood: "future",
    recommendedFor: ["particle"],
    available: true,
  },
  {
    id: "cyberpunk-city",
    label: "Cyberpunk City",
    src: "/audio/ambient/mixkit-cyberpunk-city-140.mp3",
    mood: "digital",
    recommendedFor: ["city"],
    available: true,
  },
  {
    id: "cat-walk",
    label: "Cat Walk",
    src: "/audio/ambient/mixkit-cat-walk.mp3",
    mood: "digital",
    recommendedFor: ["city"],
    available: false,
  },
  {
    id: "valley-sunset",
    label: "Valley Sunset",
    src: "/audio/ambient/mixkit-valley-sunset-127.mp3",
    mood: "cinematic",
    recommendedFor: ["living", "ember"],
    available: true,
  },
];

export const DEFAULT_AUDIO_TRACK_ID = "relaxation";
export const DEFAULT_AUDIO_VOLUME = 0.24;

export function getAudioTrack(id: string) {
  return AUDIO_TRACKS.find((track) => track.id === id) ?? AUDIO_TRACKS.find((track) => track.id === DEFAULT_AUDIO_TRACK_ID)!;
}

export function getRecommendedTrackId(mode?: RendererMode, theme?: ThemeName) {
  if (mode === "living" && theme === "verdant") return "forest-walk";
  if (mode === "living" && theme === "neon") return "voxscape";
  if (mode === "living" && theme === "ember") return "valley-sunset";
  if (mode === "city") return "cyberpunk-city";
  if (mode === "particle") return "vastness";
  if (mode === "mosaic") return "hazy-after-hours";
  return DEFAULT_AUDIO_TRACK_ID;
}
