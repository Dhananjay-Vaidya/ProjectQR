/**
 * The ambient-audio library. This is the ONLY place track names, files, groups,
 * durations and credits live — no component may hard-code them.
 */

export interface AudioTrack {
  id: string;
  title: string;
  group: AudioGroup;
  src: string;
  /** Best-effort length; the real value is read from the element at runtime. */
  durationSec: number;
  /** Equal-power crossfade length at the loop point, in seconds. */
  loopCrossfadeSec: number;
  /** Credit / licence line shown in the popover footer. */
  credit?: string;
}

/** Group headings, in fixed display order. */
export const AUDIO_GROUPS = ["Nature", "Calm", "Spatial", "City", "Warm"] as const;
export type AudioGroup = (typeof AUDIO_GROUPS)[number];

const CREDIT = "Mixkit free ambient loop — mixkit.co/license";

export const AUDIO_LIBRARY: readonly AudioTrack[] = [
  { id: "forest-walk", title: "Forest Walk", group: "Nature", src: "/audio/ambient/mixkit-forest-walk-607.mp3", durationSec: 174, loopCrossfadeSec: 2, credit: CREDIT },
  { id: "forest-treasure", title: "Forest Treasure", group: "Nature", src: "/audio/ambient/mixkit-forest-treasure-138.mp3", durationSec: 104, loopCrossfadeSec: 2, credit: CREDIT },
  { id: "relaxation", title: "Relaxation", group: "Calm", src: "/audio/ambient/mixkit-relaxation-05-749.mp3", durationSec: 118, loopCrossfadeSec: 2, credit: CREDIT },
  { id: "relax-beat", title: "Relax Beat", group: "Calm", src: "/audio/ambient/mixkit-relax-beat-292.mp3", durationSec: 108, loopCrossfadeSec: 2, credit: CREDIT },
  { id: "hazy-after-hours", title: "Hazy After Hours", group: "Calm", src: "/audio/ambient/mixkit-hazy-after-hours-132.mp3", durationSec: 127, loopCrossfadeSec: 2, credit: CREDIT },
  { id: "voxscape", title: "Voxscape", group: "Spatial", src: "/audio/ambient/mixkit-voxscape-571.mp3", durationSec: 300, loopCrossfadeSec: 2, credit: CREDIT },
  { id: "vastness", title: "Vastness", group: "Spatial", src: "/audio/ambient/mixkit-vastness-184.mp3", durationSec: 230, loopCrossfadeSec: 2, credit: CREDIT },
  { id: "cyberpunk-city", title: "Cyberpunk City", group: "City", src: "/audio/ambient/mixkit-cyberpunk-city-140.mp3", durationSec: 100, loopCrossfadeSec: 2, credit: CREDIT },
  { id: "valley-sunset", title: "Valley Sunset", group: "Warm", src: "/audio/ambient/mixkit-valley-sunset-127.mp3", durationSec: 134, loopCrossfadeSec: 2, credit: CREDIT },
];

/** Master output ceiling. The slider is a fraction of this. */
export const VOLUME_CAP = 0.35;
/** Where the slider sits by default: 0.6 of the cap. */
export const DEFAULT_VOLUME_FRACTION = 0.6;
/** −9 dB duck factor applied in Scan mode. */
export const DUCK_FACTOR = 0.35481; // 10 ** (-9 / 20)

export const DEFAULT_TRACK_ID = "relaxation";

export function getTrack(id: string): AudioTrack {
  return (
    AUDIO_LIBRARY.find((t) => t.id === id) ??
    AUDIO_LIBRARY.find((t) => t.id === DEFAULT_TRACK_ID)!
  );
}

export function groupedTracks(): { group: AudioGroup; tracks: AudioTrack[] }[] {
  return AUDIO_GROUPS.map((group) => ({
    group,
    tracks: AUDIO_LIBRARY.filter((t) => t.group === group),
  })).filter((entry) => entry.tracks.length > 0);
}
