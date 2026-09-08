"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AudioControl } from "@/components/audio/AudioControl";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const crumb = pathname === "/create" ? "Create" : pathname === "/verify" ? "Verify" : null;
  return (
    <div className="app-shell">
      <header className="app-shell__header">
        <Link href="/" className="app-shell__brand lf-focus" aria-label="LinkForge home">
          <svg viewBox="0 0 36 46" fill="none" aria-hidden="true"><rect x="3" y="3" width="21" height="27" rx="3" stroke="currentColor" strokeWidth="2.5"/><rect x="12" y="15" width="21" height="27" rx="3" stroke="currentColor" strokeWidth="2.5" opacity=".55"/><path d="M10 11h7v7m9 9h-7v7" stroke="currentColor" strokeWidth="2.5"/></svg>
          <span>LinkForge</span>
        </Link>
        <nav className="app-shell__nav" aria-label="Primary navigation">
          <Link href="/create" className={`lf-focus${pathname === "/create" ? " is-active" : ""}`}>Create</Link>
          <Link href="/verify" className={`lf-focus${pathname === "/verify" ? " is-active" : ""}`}>Verify</Link>
          <AudioControl />
        </nav>
      </header>
      {crumb ? <div className="app-shell__breadcrumb"><Link href="/" className="lf-focus">Home</Link><span>/</span><span>{crumb}</span></div> : null}
      {children}
      <footer className="app-shell__footer"><span>LinkForge</span><Link href="/create" className="lf-focus">Create</Link><Link href="/verify" className="lf-focus">Verify</Link><span>Every download is decoded and checked against your link.</span></footer>
    </div>
  );
}
