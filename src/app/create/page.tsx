import type { Metadata } from "next";
import { Suspense } from "react";
import { Editor } from "@/components/editor/Editor";
import { ModeFromQuery } from "@/components/editor/ModeFromQuery";

export const metadata: Metadata = {
  title: "Make a world — LinkForge",
  description:
    "Turn a link into a miniature tree, city, or sculpture on a QR platform. Tap to reveal the code; every download is checked against your link first.",
};

export default function CreatePage() {
  return (
    <>
      <Suspense fallback={null}>
        <ModeFromQuery />
      </Suspense>
      <Editor />
    </>
  );
}
