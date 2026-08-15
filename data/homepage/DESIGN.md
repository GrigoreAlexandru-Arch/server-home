---
version: alpha
name: server.home
description: Vivid glassmorphism launcher for a self-hosted homelab. Deep violet canvas with violet/magenta/cyan glows, glassy translucent tiles, dense rounded grid.
colors:
  primary: "#F1F5F9"
  secondary: "#A5B4FC"
  tertiary: "#22D3EE"
  neutral: "#12081F"
  on-tertiary: "#0B0617"
  accent: "#A78BFA"
  glass: "rgba(255,255,255,0.06)"
  glass-border: "rgba(255,255,255,0.14)"
typography:
  body-md:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 1rem
    lineHeight: 1.5
  h2:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 1.125rem
    fontWeight: 700
    lineHeight: 1.3
  label-caps:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 0.75rem
    fontWeight: 600
    letterSpacing: "0.08em"
rounded:
  md: 20px
  lg: 24px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  card:
    backgroundColor: "{colors.glass}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 20px
    borderColor: "{colors.glass-border}"
  accent-chip:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.md}"
    padding: 8px
---

## Overview

A self-hosted dashboard should feel like a bright, colorful control room — not a
dense wall of tiny links, and not a flat grey panel. The identity leans on a deep
violet-magenta canvas with soft glowing color blobs, glassy translucent tiles that
let that color shimmer through, and one vivid accent family (violet/magenta/cyan)
used for emphasis. Tiles read as rounded glass chips that lift gently on hover, and
the page lays out as a dense app grid so everything is reachable at a glance.

## Colors

- **Primary (#F1F5F9):** Primary text on dark surfaces — soft slate-white, not pure
  white, to reduce glare against the vivid background.
- **Secondary (#A5B4FC):** Muted text, descriptions, and metadata. Sets hierarchy
  under primary without competing with the colorful glass.
- **Tertiary (#22D3EE):** Cyan — one of the three glow/accent colors, used sparingly
  for status highlights and hover affordances.
- **Neutral (#12081F):** Deep violet-navy canvas origin. Cards are translucent over
  this rather than opaque, so color shows through.
- **Accent (#A78BFA):** Violet accent used for the page's emphasis and the vivid
  chip; pairs with magenta/cyan glows in the background.
- **Glass (rgba(255,255,255,0.06)) + Glass-border (rgba(255,255,255,0.14)):**
  The tile surface — translucent white with a light top edge — over the dark canvas.

## Typography

Inter with system fallbacks throughout. Hierarchy comes from weight and size, not
family or color: `h2` (weight 700) for group and card titles, `body-md` for content,
`label-caps` for small section labels. Heavier title weights keep names legible on
top of the colorful glass.

## Layout

Rows of services render as a dense, responsive grid (up to 4 columns) rather than
narrow side-by-side lists, so the page reads as a wall of launchers. Full-width with
equal tile heights. Spacing: `lg` between cards, `xl` around the page edge, `md`
inside a card so icons can breathe.

## Shapes

Tiles use `md` (20px) rounding — chunky and modern, matching a rounded app launcher.
Radius scales to `lg` (24px) on the largest surfaces.

## Components

- `card` is the default launcher surface: a translucent glass chip (`glass` fill,
  `glass-border` edge) with a blur+saturate backdrop, so the vivid background blurs
  through behind it.
- `accent-chip` is the high-emphasis element — a violet chip reserved for live status
  or a single highlighted action per view.
- Icons are local brand SVGs at ~44px with a soft drop shadow to sit on the glass.

## Do's and Don'ts

- **Do** use token references (`{colors.tertiary}`) instead of literal hex in
  component definitions; the palette is single-source.
- **Don't** introduce colors outside the palette — extend it first.
- **Don't** nest component variants; `card-hover` is a sibling key, not a child.
- **Do** keep glass blur modest (`blur(12-14px)`) for the ARM SBC; heavy backdrop
  filters cost GPU/CPU across many tiles.
- **Don't** reference CDN icons (emoji / mdi- / si- / sh-) — they 404. Local SVGs only.
