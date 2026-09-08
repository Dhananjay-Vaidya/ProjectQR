"use client";

/**
 * Chooses the surface for /create: the standalone Living tree section when the
 * renderer is "living" (the default), or the full studio editor for the other
 * worlds. Mode is still driven by ?mode= via ModeFromQuery.
 */

import { Editor } from "@/components/editor/Editor";

export function CreateExperience() {
  return <Editor />;
}
