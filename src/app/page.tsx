"use client";

import Link from "next/link";
import { HeroPreview } from "@/components/landing/HeroPreview";
import { ExperienceShelf } from "@/components/landing/ExperienceShelf";
import { AudioToggle } from "@/components/ui/AudioToggle";
import { useAudioStore } from "@/stores/audioStore";
import { useEffect } from "react";

const STARTERS = [
  { href: "/create", title: "Create", text: "Build a scannable 3D QR world from any URL." },
  { href: "/verify", title: "Verify", text: "Check a downloaded code before sharing or printing." },
  { href: "/create?mode=city", title: "City", text: "Turn dark modules into a miniature skyline." },
  { href: "/create?mode=particle", title: "Particles", text: "Use a kinetic sculpture that assembles into a QR." },
];

const PROOF = [
  ["4", "living render styles"],
  ["3", "seasonal themes"],
  ["1", "verified QR export"],
];

export default function Home() {
  useEffect(() => { useAudioStore.getState().setActivity("landing"); }, []);
  return (
    <main className="lf-home">
      <header className="lf-home__nav" aria-label="Primary navigation">
        <Link href="/" className="lf-home__brand lf-focus">
          <span className="lf-home__mark" aria-hidden="true">LF</span>
          <span>LinkForge</span>
        </Link>
        <nav className="lf-home__links">
          <Link href="/create" className="lf-focus">Create</Link>
          <Link href="/create?mode=living" className="lf-focus">Living</Link>
          <Link href="/create?mode=city" className="lf-focus">City</Link>
          <Link href="/verify" className="lf-focus">Verify</Link>
        </nav>
      </header>

      <HeroPreview />

      <section className="lf-home__start" aria-labelledby="lf-home-start-title">
        <div>
          <p className="lf-home__eyebrow">Start here</p>
          <h2 id="lf-home-start-title">Choose what you want to do.</h2>
        </div>
        <div className="lf-home__starter-grid">
          {STARTERS.map((item) => (
            <Link key={item.href} href={item.href} className="lf-home__starter lf-focus">
              <span>{item.title}</span>
              <small>{item.text}</small>
            </Link>
          ))}
        </div>
      </section>

      <ExperienceShelf />

      <section className="lf-home__proof" aria-label="LinkForge capabilities">
        {PROOF.map(([number, label]) => (
          <div key={label} className="lf-home__proof-item">
            <strong>{number}</strong>
            <span>{label}</span>
          </div>
        ))}
        <div className="lf-home__audio">
          <span>Ambient room tone</span>
          <AudioToggle />
        </div>
      </section>

      <section className="lf-home__how">
        <div className="lf-home__step">
          <p className="lf-step__rule">1</p>
          <p>Paste a link.</p>
        </div>
        <div className="lf-home__step">
          <p className="lf-step__rule">2</p>
          <p>Pick a world and theme.</p>
        </div>
        <div className="lf-home__step">
          <p className="lf-step__rule">3</p>
          <p>Tap to reveal the QR and download.</p>
        </div>
      </section>

      <footer className="lf-home__footer lf-ui-sm">
        <span>LinkForge</span>
        <Link href="/create" className="lf-focus" style={{ color: "var(--lf-ink)" }}>
          Create
        </Link>
        <Link href="/verify" className="lf-focus" style={{ color: "var(--lf-ink)" }}>
          Verify a code
        </Link>
      </footer>
    </main>
  );
}
