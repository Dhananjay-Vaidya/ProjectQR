# LinkForge

LinkForge turns ordinary URLs into polished, scannable QR experiences. A link can become a living tree platform, a miniature city skyline, a particle sculpture, or a clean export-ready QR code while preserving scan reliability.

## Features

- 3D QR experiences built from the encoded URL
- Living tree renderer with seasonal themes and user-selectable leaf palettes
- City renderer with skyline-style buildings, streets, rooftops, and lit window details
- Particle and mosaic QR modes
- Experience/Scan transition so users can enjoy the scene and reveal the readable QR
- Verified PNG export using `jsqr` before download
- Optional SVG export for the standard QR renderer
- Ambient procedural audio that stays off until the user enables it
- Responsive create workspace and landing page

## Tech Stack

- Next.js App Router
- React 19
- TypeScript
- Three.js with `@react-three/fiber` and `@react-three/drei`
- Framer Motion
- Zustand
- Tailwind CSS 4
- `qrcode` for QR generation
- `jsqr` for export verification

## Routes

- `/` - landing page with live previews and entry points
- `/create` - main QR world editor
- `/create?mode=living` - open the editor in Living mode
- `/create?mode=city` - open the editor in City mode
- `/create?mode=particle` - open the editor in Particles mode
- `/create?mode=mosaic` - open the editor in Mosaic mode
- `/create?url=https%3A%2F%2Fexample.com` - prefill a URL
- `/verify` - verify whether a QR image decodes to the expected URL

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Scripts

```bash
npm run dev
npm run lint
npm run build
npm run start
```

## Project Structure

```text
src/app                 App routes and global CSS
src/components/editor   Create-page workspace UI
src/components/landing  Home-page live previews
src/components/qr       QR renderers
src/lib/audio           Procedural ambient audio engine
src/lib/living          Living tree generation, themes, scan colours
src/lib                 QR, export, verification, and shared render helpers
src/stores              Editor and audio state
scripts                 Browser and renderer verification scripts
evidence                Local screenshots generated during review
```

## Git Setup

This project is intended to live in its own repository, separate from the portfolio project.

After creating an empty GitHub repository, connect it from this folder:

```bash
git init
git branch -M main
git add .
git commit -m "Initial LinkForge app"
git remote add origin https://github.com/<your-user>/<your-repo>.git
git push -u origin main
```

## Notes

- Sound never autoplays. The audio context is created only after a user gesture.
- QR export paths should remain verification-first. Do not bypass scan checks before download.
- `node_modules`, `.next`, local environment files, and generated build artifacts should stay out of Git.
