---
version: alpha
name: server.home
description: Slick sharp black-glass launcher for a self-hosted homelab. Near-black canvas with a restrained red accent, frosted white glass tiles, sharp square corners, tight spacing.
colors:
  primary: "#F5F5F5"
  secondary: "#A1A1AA"
  tertiary: "#EF4444"
  neutral: "#000000"
  on-tertiary: "#0A0A0C"
  accent: "#EF4444"
  glass: "rgba(255,255,255,0.06)"
  glass-border: "rgba(255,255,255,0.12)"
typography:
  body-md:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 1rem
    lineHeight: 1.5
  h2:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 1.0625rem
    fontWeight: 600
    lineHeight: 1.3
  label-caps:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 0.7rem
    fontWeight: 600
    letterSpacing: "0.08em"
rounded:
  md: 0px
  lg: 0px
spacing:
  sm: 6px
  md: 10px
  lg: 14px
  xl: 20px
components:
  card:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 8px
    borderColor: "{colors.glass-border}"
  accent-chip:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.md}"
    padding: 8px
---

## Overview

A self-hosted dashboard should feel like a clean, modern control surface — not a wall of
tiny links and not a soft pastel panel. The identity leans on a near-black canvas with a
single restrained red accent, frosted white glass tiles, and sharp square corners. Red is
reserved for emphasis (hover state, group labels); the tiles themselves stay neutral glass
so the accent reads as intentional rather than loud.

## Colors

- **Primary (#F5F5F5):** Primary text on dark surfaces — near-white.
- **Secondary (#A1A1AA):** Muted gray for descriptions and metadata.
- **Tertiary / Accent (#EF4444):** Red — the single accent, used for hover emphasis and
  group labels. Kept low-frequency so it stays "black with red", not "red".
- **Neutral (#000000):** Near-black canvas origin; tiles are translucent over this.
- **Glass (rgba(255,255,255,0.06)) + Glass-border (rgba(255,255,255,0.12)):** Frosted
  white glass surface and edge over the dark canvas.

## Typography

Inter with system fallbacks. Hierarchy from weight and size: `h2` (weight 600) for group and
card titles, `body-md` for content, `label-caps` (small caps, letter-spaced) for section labels.

## Layout

Rows of services render as a dense, responsive grid (up to 4 columns). Full-width with tight
spacing: `lg` between cards, `xl` around the page edge, `md` inside a card.

## Shapes

Tiles use `md` (0px) rounding — sharp, square corners throughout.

## Components

- `card` is the launcher surface: frosted white glass (glass fill, glass-border edge) with a
  blur backdrop; red accent appears on hover.
- `accent-chip` is the high-emphasis element — red, reserved for a single highlighted action.
- Icons are local brand SVGs at ~40px with a soft drop shadow.

## Do's and Don'ts

- **Do** use token references (`{colors.accent}`) instead of literal hex in component defs.
- **Don't** introduce colors outside the palette (black/white/gray + red only).
- **Don't** add rounding — the identity is sharp/square.
- **Do** keep glass blur modest (`blur(12px)`) for the ARM SBC.
- **Don't** reference CDN icons (emoji / mdi- / si- / sh-) — they 404. Local SVGs only.
