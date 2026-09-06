import type { Metadata } from "next";
import Link from "next/link";
import { VerifySuite } from "@/components/verify/VerifySuite";

export const metadata: Metadata = {
  title: "Verify — LinkForge",
  description:
    "Structural QR self-checks and live jsQR decode. A code only counts as scannable when a decoder actually decoded it and the payload matched exactly.",
};

export default function VerifyPage() {
  return (
    <div style={{ minHeight: "100vh" }}>
      <main
        style={{
          maxWidth: 820,
          margin: "0 auto",
          padding: "56px 24px 80px",
          display: "grid",
          gap: 24,
        }}
      >
        <header style={{ display: "grid", gap: 8 }}>
          <Link href="/" className="lf-ui-sm lf-focus" style={{ color: "var(--lf-muted)" }}>
            LinkForge
          </Link>
          <h1 className="lf-display" style={{ margin: 0, fontSize: 36 }}>
            Verify a code
          </h1>
          <p className="lf-muted" style={{ margin: 0, maxWidth: "58ch" }}>
            A LinkForge only counts as scannable when a decoder actually decoded
            it and the payload matched your link exactly.
          </p>
        </header>
        <VerifySuite />
      </main>
    </div>
  );
}
