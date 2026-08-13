---
name: Delmarva Aces
description: Broadcast-grade team site for Aces families — stadium lights on a phone screen.
colors:
  aces-orange: "#E8530A"
  orange-deep: "#C44208"
  orange-wash: "rgba(232,83,10,.18)"
  field-black: "#0A0C0E"
  panel: "#111418"
  panel-raised: "#181C22"
  panel-top: "#1F242C"
  chalk: "#F0EDE8"
  dugout-gray: "#7A8290"
  hairline: "rgba(255,255,255,.08)"
  hairline-accent: "rgba(232,83,10,.35)"
  win-green: "#3DDC6A"
typography:
  display:
    fontFamily: "Oswald, sans-serif"
    fontWeight: 700
    letterSpacing: "0.5px"
  headline:
    fontFamily: "Oswald, sans-serif"
    fontWeight: 600
    fontSize: "clamp(1.4rem, 4vw, 2.2rem)"
  body:
    fontFamily: "Inter, sans-serif"
    fontWeight: 400
    fontSize: "14px"
    lineHeight: 1.6
  label:
    fontFamily: "Roboto Mono, monospace"
    fontSize: "10px"
    letterSpacing: "1.5px"
rounded:
  sm: "6px"
  md: "10px"
  pill: "20px"
components:
  button-primary:
    backgroundColor: "{colors.aces-orange}"
    textColor: "{colors.chalk}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  card:
    backgroundColor: "{colors.panel-raised}"
    rounded: "{rounded.md}"
  chip-live:
    textColor: "{colors.win-green}"
    rounded: "{rounded.pill}"
    padding: "4px 12px"
---

# Design System: Delmarva Aces

## Overview

**Creative North Star: "The Friday Night Broadcast"**

The whole site behaves like a professional sports broadcast that happens to belong to twelve families: near-black surfaces like a stadium at night, one loud team orange doing the work a broadcast bug's accent does, chalk-white text, and monospace "production" labels everywhere data appears. Density is high on game surfaces (scoreboard, gamecast, scorer) and relaxed on family surfaces (home, photos, highlights). Nothing is decorated for its own sake — every glowing edge or pulsing dot means something is live.

**Key Characteristics:**
- Dark broadcast surfaces, one dominant accent, zero pastel.
- Three-voice typography: Oswald shouts (scores, names), Inter speaks (copy), Roboto Mono annotates (labels, counts, timestamps).
- Uppercase mono micro-labels with wide tracking mark every data region.
- Live things pulse; static things don't.

## Colors

A single-accent broadcast palette: orange earns attention, everything else recedes into the night game.

### Primary
- **Aces Orange** (#E8530A): scores in the lead, live indicators, primary actions, the batter's name on the field, active nav. The team's voice.
- **Deep Rally Orange** (#C44208): hover/pressed states of the primary.
- **Orange Wash** (rgba(232,83,10,.18)): selected/tinted backgrounds behind orange content.

### Secondary
- **Win Green** (#3DDC6A): live-stream badges, hits, positive outcomes. Never decorative.

### Neutral
- **Field Black** (#0A0C0E): page background.
- **Panel** (#111418) / **Panel Raised** (#181C22) / **Panel Top** (#1F242C): the three-step tonal ladder for cards, headers, and nested surfaces.
- **Chalk** (#F0EDE8): primary text — warm white, like foul-line chalk.
- **Dugout Gray** (#7A8290): secondary text, labels, muted metadata.
- **Hairline** (rgba(255,255,255,.08)) and **Hairline Accent** (rgba(232,83,10,.35)): 1px borders; the accent variant only around orange-adjacent content.

### Named Rules
**The Scoreboard Rule.** Orange is a signal, not a theme: leaders, live states, and primary actions only — roughly ≤10% of any screen. If everything is orange, nothing is winning.

## Typography

**Display Font:** Oswald (sans-serif fallback)
**Body Font:** Inter (sans-serif fallback)
**Label/Mono Font:** Roboto Mono

**Character:** A jumbotron pairing — condensed athletic capitals for anything scored or named, a quiet humanist body, and a broadcast-truck monospace for the data layer.

### Hierarchy
- **Display** (700, up to ~44px, line-height 1): scores, jersey numbers, hero numerals.
- **Headline** (600, clamp 1.4–2.2rem): page and section titles, player names.
- **Body** (400, 14px, 1.6): descriptions, feed text.
- **Label** (400–500, 9–11px, letter-spacing 1–2px, UPPERCASE, mono): section markers ("PLAY BY PLAY"), counts, timestamps, positions.

### Named Rules
**The Three Voices Rule.** Never let a voice do another's job: no mono headlines, no Oswald body copy, no Inter data labels.

## Layout

Max-width containers (~1280px) centered over full-bleed black; game surfaces use dense multi-column grids that collapse to a single column under 768px. Spacing rhythm is compact — 8/10/14/20px gaps — with generous separation only between unrelated sections. Sticky elements (nav at 52–64px, the gamecast feed column) keep game state visible while scrolling. Phone-first verification: 375×812 must fit the hero and answer "score, inning, who's up" without scrolling on live pages.

## Elevation & Depth

Depth is tonal first (the Panel ladder), shadows second. Shadows are soft and offset (e.g. 0 8px 24px rgba(0,0,0,.5)) and appear on floating/overlay elements only — banners, toasts, docked plates. Flat at rest; glow (drop-shadow in Orange Wash) is reserved for the logo and live elements.

## Shapes

Rounded-rectangle language: 6px for controls, 8–10px for cards and panels, 20px pills for badges/chips. 1px hairline borders define edges; no thick borders, no colored left-border stripes (retired as a habit). Circles are reserved for people (avatars/headshots) and status dots.

## Components

### Buttons
- **Shape:** softly rounded (6px)
- **Primary:** Aces Orange fill, Chalk text, 10px 18px padding; hover deepens to Deep Rally Orange.
- **Ghost/secondary:** transparent with Hairline border, Dugout Gray text; hover raises to Panel Top.

### Chips / Badges
- **Style:** pill (20px), 1px tinted border, transparent or washed background, mono 10–11px text.
- **Live variants:** Win Green with a pulsing 6px dot; TEST/DEMO variants use orange.

### Cards / Containers
- **Corner Style:** 10px
- **Background:** Panel Raised on Field Black; nested surfaces step up the ladder.
- **Border:** 1px Hairline (Hairline Accent when the content is orange/live).
- **Internal Padding:** 14–20px.

### Navigation
- Fixed dark translucent bar (blur backdrop), logo + Oswald wordmark with orange accent word, Inter links; active/hover = orange text. Collapses to a hamburger on phones; coach items grouped under a "Coach" cluster.

### Data/Feed Rows (signature)
- Mono uppercase micro-label header, tight bordered rows (1px hairline separators), color-coded values (orange = ours/leading, green = hit/live, gray = out/neutral). New rows flash an orange wash that fades (~0.5s).

## Do's and Don'ts

### Do:
- **Do** mark every data region with a mono uppercase micro-label (10px, 1.5px tracking).
- **Do** make live things pulse (blink/pip animation) and stop the pulse the moment they aren't live.
- **Do** keep phones first: 100dvh fits, collapse columns under 768px, thumb-size tap targets on game-day tools.
- **Do** use headshots for people, jersey-number circles as the fallback.

### Don't:
- **Don't** spend orange on decoration — it means live, leading, or "yours".
- **Don't** write copy that sells features to strangers; the audience already knows the team.
- **Don't** introduce new hues, fonts, or light-mode surfaces; the night-game world is the identity.
- **Don't** use thick colored side-borders on cards or feed rows (retired habit — use background tint + a status dot instead).
