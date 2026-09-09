# LinkForge — Claude Code Project Instructions

## Project Goal

LinkForge transforms a valid URL into a real QR matrix and renders that matrix as a premium visual experience.

The core product promise is:

URL
→ real QR matrix
→ artistic renderer
→ downloadable scannable QR image

The QR must remain functional.

The visual treatment must never compromise scannability.

## Product Principles

1. QR correctness comes first.
2. Visual quality comes second.
3. Performance comes third.
4. Decorative effects must never corrupt QR geometry.
5. The application should feel premium and experimental, not like a generic dashboard.
6. All heavy visual effects must have a safe fallback.
7. Never fake QR geometry.
8. Never create graphics that merely resemble QR codes.
9. The QR encoder output is the single source of truth.

## Technology Stack

Use only the stack explicitly requested by the user.

Primary stack:

- Next.js 15 App Router
- React
- TypeScript
- Tailwind CSS
- qrcode
- three
- @react-three/fiber
- @react-three/drei
- jsqr
- zustand
- zod

Do not add new packages unless specifically requested.

Do not add:

- Prisma
- database
- auth
- analytics
- shadcn
- Framer Motion
- GSAP
- Playwright
- node-canvas
- unnecessary utility libraries

## Code Quality

Use:

- strong TypeScript types
- small components
- clean separation of concerns
- reusable helpers
- no `any`
- no giant page components
- no unnecessary abstractions
- no placeholder implementations

Do not replace difficult parts with mock implementations.

## Required Architecture

The QR pipeline must be:

Input URL
→ URL normalization
→ validation
→ qrcode library
→ QRModel
→ renderer

QRModel is the source of truth.

Renderers must never call the QR encoder themselves.

## QRModel

The central model should contain:

- module count
- dark/light matrix
- protected function-module matrix
- version
- error correction level
- normalized encoded URL

## Renderer Modes

Initial renderer modes:

- Standard
- City
- Particle
- Mosaic

Every renderer receives QRModel.

## Visual Direction

LinkForge should feel:

- premium
- futuristic
- architectural
- technical
- dimensional
- minimal
- intentional
- dark-first
- high contrast
- product-led

Avoid generic SaaS visual language.

Avoid:

- generic purple gradient backgrounds
- too many rounded cards
- unnecessary glassmorphism
- excessive pills
- random glow everywhere
- repeated three-column marketing card layouts
- stock illustrations
- emoji icons
- excessive gradients
- large empty dashboards
- fake analytics UI
- animations that do not communicate product behavior

## Product-Led UI

The QR experience itself should be the hero.

Whenever possible, demonstrate the product directly instead of describing it.

For example:

Instead of:

"Create beautiful QR codes"

Prefer:

A live QR transformation visible immediately in the hero.

## Performance

Heavy components must be lazy loaded.

For WebGL:

- use InstancedMesh
- use Points for large particle systems where appropriate
- avoid thousands of React children
- avoid per-frame allocations
- memoize expensive calculations
- do not recreate scenes unnecessarily

Landing page previews must be lightweight.

## Accessibility

All controls must have visible labels.

Buttons need accessible names.

PASS/FAIL state must not rely on color only.

Respect prefers-reduced-motion.

## QR Safety

Always preserve:

- finder patterns
- separators
- timing modules
- alignment patterns
- format information
- version information
- fixed dark module
- quiet zone

Protected modules must remain visually plain and reliable.

## Verification

The exported QR image should be checked using jsQR.

Do not claim success unless actual decoding occurred.

If browser-side verification cannot be run automatically, report that manual browser verification is still required.

## Build Discipline

Before finishing:

1. run `npm run build`
2. fix all build errors
3. fix TypeScript errors
4. fix obvious runtime issues
5. ensure lazy-loaded components compile
6. verify `/verify` page exists
7. report limitations honestly

## Important Behavior

Do not stop unnecessarily for confirmation.

When implementation choices are obvious and reversible, choose the best option and continue.

Ask only when a missing decision blocks correct implementation.

## Required Skills

Before editing code, read:

- .claude/skills/frontend-design/SKILL.md
- .claude/skills/qr-design-engine/SKILL.md
- .claude/skills/threejs-qr-renderer/SKILL.md
- .claude/skills/visual-qa/SKILL.md

These instructions apply throughout the project.
