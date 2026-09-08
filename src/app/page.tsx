import { HeroPreview } from "@/components/landing/HeroPreview";
import { ExperienceShelf } from "@/components/landing/ExperienceShelf";

const FAQ = [
  ["Does it work with any link?", "It works with valid web URLs that fit within the QR code's error-correction capacity."],
  ["Will it scan when printed?", "Yes. Every exported PNG is decoded with jsQR before it downloads."],
  ["Can I use my own colours?", "Themes change the world presentation while the verified scan path preserves QR contrast."],
  ["Is my link stored?", "No. LinkForge builds the QR in your browser."],
  ["Can I change the destination later?", "Not yet. A QR code always contains the exact destination used to create it."],
  ["Which phones can scan it?", "Any current phone camera or QR reader that supports standard QR codes."],
];

export default function Home() {
  return <main className="landing-page">
    <HeroPreview />
    <section className="landing-section"><h2>Four worlds from one link</h2><ExperienceShelf /></section>
    <section className="landing-section landing-steps"><h2>How it works</h2><div><p><b>1</b> Paste a link</p><p><b>2</b> Pick a world and a theme</p><p><b>3</b> Tap to reveal the QR and download</p></div></section>
    <section className="landing-section landing-proof"><h2>Why it scans</h2><div><p><i>▦</i>The real QR matrix is the source of truth.</p><p><i>⌘</i>Finder patterns and quiet zone are never decorated.</p><p><i>✓</i>Every download is decoded with jsQR before you get it.</p></div></section>
    <section className="landing-section landing-determinism"><h2>Same link, same world</h2><p>Each world is derived deterministically from the URL. The same destination creates the same geometry every time, while another link grows a distinct world.</p><div aria-hidden="true"><span>https://example.com</span><span>https://linkforge.app</span></div></section>
    <section className="landing-section landing-faq"><h2>FAQ</h2>{FAQ.map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
  </main>;
}
