# Design System — Agent Mesh OS

## Product Context

- **What this is:** A task-first autonomous agent workspace for delegating repository tasks to durable autonomous agents.
- **Who it's for:** Developers and operators delegating repository tasks to durable autonomous agents.
- **Space/industry:** Developer Tools / Security.
- **Project type:** Web App / Live Dashboard.

## Aesthetic Direction

- **Direction:** Clay.com-inspired warm, playful, premium B2B SaaS — cream canvas with saturated feature cards.
- **Decoration level:** Vibrant yet controlled — warm cream surfaces, saturated brand-color accents, generous whitespace, rounded display typography.
- **Mood:** Warm, approachable, capable, and premium. The product should feel playful and trustworthy — like a hand-crafted tool, not a sterile enterprise dashboard.
- **Reference products:** Clay.com, Linear (for product polish), Notion (for warmth).

## Typography

- **Display/Hero:** `Inter` weight 500 with negative letter-spacing (-2.5px to -0.5px) — substituting for Clay's custom "Plain Black" rounded display face.
- **Body:** `Inter` weight 400, standard letter-spacing.
- **UI/Labels:** `Inter` weight 500–600.
- **Code:** `Inter` for UI chrome. Monospace reserved for raw diffs and terminal output only.
- **Loading:** Google Fonts (`Inter`).
- **Scale:**
  - Display XL: 72px / 500 / -2.5px
  - Display LG: 56px / 500 / -2px
  - Display MD: 40px / 500 / -1px
  - Display SM: 32px / 500 / -0.5px
  - Title LG: 24px / 600 / -0.3px
  - Title MD: 18px / 600
  - Title SM: 16px / 600
  - Body MD: 16px / 400
  - Body SM: 14px / 400
  - Caption: 13px / 500
  - Caption Uppercase: 12px / 600 / 1.5px letter-spacing

## Color

- **Approach:** Warm cream canvas with saturated single-color feature accents and dark primary CTAs.
- **Canvas:** `#fffaf0` cream-tinted white — the default page floor. The warmth differentiates from cool-gray competitors.
- **Primary:** `#0a0a0a` near-black — all primary CTAs.
- **Brand Accents:**
  - Pink: `#ff4d8b` — outbound/sequencer features
  - Teal: `#1a3a3a` — enterprise/featured elements
  - Lavender: `#b8a4ed` — AI-agent products
  - Peach: `#ffb084` — general warmth
  - Ochre: `#e8b94a` — community/status elements
  - Mint: `#a4d4c5` — success accents
  - Coral: `#ff6b5a` — danger/alert highlights
- **Surfaces:**
  - Soft: `#faf5e8` — sidebar, footer bands
  - Card: `#f5f0e0` — cream feature cards
  - Strong: `#ebe6d6` — emphasized bands
- **Text:**
  - Ink: `#0a0a0a` — headlines
  - Body: `#3a3a3a` — running text
  - Muted: `#6a6a6a` — secondary
  - Muted Soft: `#9a9a9a` — captions
- **Semantic:** success `#22c55e`, warning `#f59e0b`, error `#ef4444`
- **Dark mode:** Not part of the system. The cream-throughout palette is a system contract.

## Spacing

- **Base unit:** 4px
- **Density:** Spacious / Generous whitespace
- **Scale:** xxs(4px) xs(8px) sm(12px) md(16px) lg(24px) xl(32px) xxl(48px) section(96px)

## Layout

- **Approach:** Persistent collapsible sidebar plus task-focused main workspace.
- **Sidebar:** Search, recent session history, workspace links, GitHub CTA, and product links. Background: `--surface-soft`.
- **Home:** Large left-aligned task prompt with Clay-scale display typography.
- **Running task:** Execution log in the center with optional details/diff/log pane on the right.
- **Border radius:**
  - xs: 6px (small badges)
  - sm: 8px (small buttons)
  - md: 12px (standard CTAs, inputs)
  - lg: 16px (content cards)
  - xl: 24px (feature cards, modals)
  - pill: 9999px (tabs, badges)

## Motion

- **Approach:** Intentional — smooth, native-feeling transitions with hover lift.
- **Easing:** `cubic-bezier(0.25, 0.46, 0.45, 0.94)`
- **Duration:** micro(150ms) short(250ms) medium(350ms)
- **Effects:** Cards hover with `translateY(-2px)` and subtle shadow. Buttons hover with slight background shift. Sidebar links transition background on 150ms.

## Decisions Log

| Date       | Decision                                    | Rationale                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-03 | Initial design system created               | User explicitly requested mimicking the Apple Developer website's premium, spacious aesthetic.                                                                                                                                      |
| 2026-06-04 | Shifted to Jules/Devin task-first workspace | User explicitly requested session-list navigation, soft lavender palette, new-task home, and step-by-step execution view.                                                                                                           |
| 2026-06-12 | Redesigned to Clay.com warm cream canvas    | User explicitly requested Clay.com-inspired redesign with cream canvas, saturated brand-color feature cards, rounded display typography, and playful premium aesthetic. Replaced lavender palette with 7-color brand accent system. |
