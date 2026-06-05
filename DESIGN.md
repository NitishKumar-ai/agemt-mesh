# Design System — Inmodel Agent Workspace

## Product Context
- **What this is:** A task-first autonomous agent workspace inspired by the interaction patterns of Jules, Devin, Codex, and Claude.
- **Who it's for:** Developers and operators delegating repository tasks to durable autonomous agents.
- **Space/industry:** Developer Tools / Security.
- **Project type:** Web App / Live Dashboard.

## Aesthetic Direction
- **Direction:** Jules/Devin task workspace with refined minimalism.
- **Decoration level:** Restrained — soft lavender surfaces, clean borders, subtle shadows, and focused task states.
- **Mood:** Calm, approachable, capable, and collaborative. The product should feel like delegating work to a trusted engineering teammate.
- **Reference products:** Jules, Devin, Codex, Claude.

## Typography
- **Display/Hero:** `Inter` (as a stand-in for Apple's SF Pro Display) — Clean, legible, highly refined sans-serif.
- **Body:** `Inter` (as a stand-in for SF Pro Text) — Highly legible for UI elements.
- **UI/Labels:** `Inter`
- **Data/Tables:** `Inter`
- **Code:** `Inter` in UI chrome and summaries. Monospace is reserved only for future full code editors or raw terminal output.
- **Loading:** Google Fonts (`Inter`).
- **Scale:** Base 16px, using a standard geometric scale (12px, 14px, 16px, 20px, 24px, 32px, 48px).

## Color
- **Approach:** Balanced — High contrast neutrals with a single semantic action color.
- **Primary:** `#6B5CE7` soft lavender-violet — used for primary actions, active sessions, and progress.
- **Primary Strong:** `#5948D8`
- **Primary Soft:** `#EDE9FE`
- **Neutrals:** Background `#F8F7FC`, Sidebar `#F0EDFA`, Panel `#FFFFFF`, Text `#17151C`, Muted `#77727F`, Border `#E5E1EE`
- **Semantic:** success `#2FA76F`, warning `#DC8B24`, error `#DD4E4E`, info `#6B5CE7`
- **Dark mode:** Not part of the current product direction. The workspace should remain soft, bright, and low contrast.

## Spacing
- **Base unit:** 8px
- **Density:** Spacious / Comfortable
- **Scale:** 2xs(4px) xs(8px) sm(16px) md(24px) lg(32px) xl(48px) 2xl(64px) 3xl(96px)

## Layout
- **Approach:** Persistent collapsible sidebar plus task-focused main workspace.
- **Sidebar:** Search, recent session history, workspace links, GitHub CTA, and product links.
- **Home:** Large left-aligned task prompt, quick starts, and integration shortcuts.
- **Running task:** Execution log in the center with optional details/diff/log pane on the right.
- **Border radius:** sm(8px), md(12px), lg(18px), full(9999px) for status pills.

## Motion
- **Approach:** Intentional — Smooth, native-feeling transitions.
- **Easing:** Apple-style spring physics where possible, or standard `ease-in-out`.
- **Duration:** micro(150ms) short(250ms) medium(350ms).

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-06-03 | Initial design system created | User explicitly requested mimicking the Apple Developer website's premium, spacious aesthetic. |
| 2026-06-04 | Shifted to Jules/Devin task-first workspace | User explicitly requested session-list navigation, soft lavender palette, new-task home, and step-by-step execution view. |
