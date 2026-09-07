"use client";

/**
 * Chooses the surface for /create: the standalone Living tree section when the
 * renderer is "living" (the default), or the full studio editor for the other
 * worlds. Mode is still driven by ?mode= via ModeFromQuery.
 */

import { useEditorStore } from "@/stores/editorStore";
import { Editor } from "@/components/editor/Editor";
import { LivingSection } from "@/components/living/LivingSection";

export function CreateExperience() {
  const renderer = useEditorStore((s) => s.renderer);
  return renderer === "living" ? <LivingSection /> : <Editor />;
}
