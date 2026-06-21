# Design System — AgentMesh

## Product Context

- **Product:** A permission-aware temporal company brain with cited answers and durable workflows.
- **Primary users:** Employees seeking trusted context and operators responsible for source, access, and retrieval health.
- **Direction:** Evidence in motion.

## Typography

- **Display:** Instrument Sans, 600-700.
- **Product UI:** Geist, 400-600.
- **Data and code:** IBM Plex Mono, 400-500.
- **Fallbacks:** Arial and system sans-serif are fallbacks only.

## Color

- **Canvas:** `#F6F2EA` light, `#141311` dark.
- **Surface:** `#FFFCF7` light, `#1D1B19` dark.
- **Surface strong:** `#EAE3D8` light, `#292622` dark.
- **Ink:** `#181715` light, `#FAF7F1` dark.
- **Muted:** `#6D675F` light, `#AAA39A` dark.
- **Brand:** `#F04419` light, `#FF5A2A` dark.
- **Success:** `#18794E` light, `#55C892` dark.
- **Warning:** `#A15C00` light, `#E7AD55` dark.
- **Danger:** `#B42318` light, `#F27972` dark.
- **Info:** `#175CD3` light, `#76A9FA` dark.

## Spacing and Shape

- **Base unit:** 4px.
- **Scale:** 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80.
- **Radius:** controls 6px, panels 10px, feature surfaces 16px, pills only for compact status.
- **Content:** 1280px dashboards, 760px reading surfaces.

## Motion

- Micro feedback: 80-120ms.
- Menus and row state: 160-220ms.
- Drawers and route transitions: 240-360ms.
- Motion must communicate state and respect `prefers-reduced-motion`.

## Interaction Rules

- Evidence is visually adjacent to every material answer.
- Color is never the only state indicator.
- Destructive and privileged actions require an accessible confirmation dialog.
- Unknown permission state fails closed.
- Do not present unsupported connectors or workflows as actionable.
