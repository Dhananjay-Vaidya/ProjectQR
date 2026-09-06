import type { ThemeName } from "./themes";
export type LeafPaletteName = "theme" | "multicolour" | "fresh" | "autumn" | "custom";

export interface LivingScanColors {
    dark: string;
    finder: string;
    light: string;
}
/** Light / mid / dark: matte and restrained across all three seasons. */
export const LEAF_TINTS: Record<ThemeName, [
    string,
    string,
    string
]> = {
    neon: ["#CEDBD9", "#91B8AE", "#567B76"],
    verdant: ["#A4D66C", "#70B648", "#3F7D38"],
    ember: ["#D7B76E", "#B58443", "#805334"],
};
export const LEAF_PALETTES: Record<Exclude<LeafPaletteName, "theme" | "custom">, [
    string,
    string,
    string
]> = {
    multicolour: ["#A8D86F", "#4EA86E", "#D39B54"],
    fresh: ["#B7DD70", "#65B95A", "#2F7D52"],
    autumn: ["#D7B45D", "#BC7A3D", "#7B5A35"],
};
export function isFinder(size: number, row: number, col: number) {
    return (row < 7 && (col < 7 || col >= size - 7)) || (row >= size - 7 && col < 7);
}
export function luminance(hex: string): number {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
export function themedScanColors(theme: ThemeName): LivingScanColors {
    let dark = LEAF_TINTS[theme][2];
    while (luminance(dark) > .30)
        dark = "#" + [1, 3, 5].map(i => Math.floor(parseInt(dark.slice(i, i + 2), 16) * .96).toString(16).padStart(2, "0")).join("");
    return { dark, finder: "#4EA83A", light: "#F7F3EA" };
}
