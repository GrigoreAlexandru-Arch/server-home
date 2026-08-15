---
version: alpha
name: server.home
description: Clean, calm dark-mode launcher for a self-hosted homelab. Deep navy canvas, teal accent, airy spacing.
colors:
  primary: "#E2E8F0"
  secondary: "#94A3B8"
  tertiary: "#2DD4BF"
  neutral: "#0E1726"
  on-tertiary: "#04231E"
typography:
  body-md:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 1rem
    lineHeight: 1.5
  h2:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 1.125rem
    fontWeight: 600
    lineHeight: 1.3
  label-caps:
    fontFamily: Inter, system-ui, sans-serif
    fontSize: 0.75rem
    fontWeight: 600
    letterSpacing: "0.08em"
rounded:
  md: 14px
  lg: 20px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
components:
  card:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
    padding: 20px
  accent-chip:
    backgroundColor: "{colors.tertiary}"
    textColor: "{colors.on-tertiary}"
    rounded: "{rounded.md}"
    padding: 8px
---

## Overview

A self-hosted dashboard should feel like a calm, well-lit control room, not a
dense wall of tiny links. The identity leans on a deep navy-black canvas with
generous whitespace, one restrained teal accent reserved for emphasis, and
softly rounded, slightly translucent cards. Everything is quiet by default so
the live status dots and per-service data are what draw the eye.

## Colors

- **Primary (#E2E8F0):** Primary text on dark surfaces. Soft slate-white, never
  pure white, to reduce glare.
- **Secondary (#94A3B8):** Muted text, descriptions, and metadata. Sets hierarchy
  under primary without competing with it.
- **Tertiary (#2DD4BF):** The single interaction/emphasis accent — teal. Used
  for status highlights, the accent chip, and hover affordances. Used sparingly.
- **Neutral (#0E1726):** Deep navy card surface. Differs only slightly from the
  page canvas so cards feel layered, not boxed.

## Typography

Inter with system fallbacks throughout. Hierarchy comes from weight and size,
not family or color: `h2` for group and card titles, `body-md` for content,
`label-caps` for small section labels. Body is set at a comfortable 1rem so
tiles read as links, not cramped buttons.

## Layout

Spacing is generous by intent — the request was "more space." `md` (16px) for
gaps inside a card, `lg` (24px) between cards, `xl` (40px) between groups and
around the page edge. Groups lay out as full-width rows (style `row`) rather
than narrow side-by-side columns, so the page reads as horizontal bands of
launchers instead of a multi-column list.

## Shapes

Cards use `md` (14px) rounding — present but soft, matching a modern app
launcher rather than a flat OS lock screen. Radius scales up to `lg` (20px) on
the largest surfaces.

## Components

- `card` is the default launcher surface: navy, softly rounded, with enough
  padding that the icon can breathe.
- `accent-chip` is the only high-emphasis element — reserved for live status or
  a single highlighted action per view.

## Do's and Don'ts

- **Do** use token references (`{colors.tertiary}`) instead of literal hex in
  component definitions; the palette is single-source.
- **Don't** introduce colors outside the palette — extend it first.
- **Don't** nest component variants; `card-hover` is a sibling key, not a child.
- **Do** keep emphasis to a minimum: one accent against a quiet canvas.
