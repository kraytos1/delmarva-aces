# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Parents and family of the ~12 Delmarva Aces 13U players, plus the coaches. Two situations dominate: **game day** (following live from the bleachers or from home on a phone — glancing between plays, watching the stream, checking who's up) and **between games** (reliving highlights, checking a kid's stats, browsing photos, adding the schedule to a calendar). Coaches additionally run the scorer, broadcast overlays, and admin tools from a laptop/tablet at the field.

## Product Purpose

A private-feeling team site that makes a youth baseball season feel big-league for the families living it: live gamecast with animations, real stats from scored games, YouTube-deeplinked highlight reels, a photo gallery, printable/broadcast tools for coaches. Success = a parent can find "is it live, what's the score, who's up, did my kid do something great" in seconds, and the coach can run an entire game-day broadcast solo.

## Positioning

Everything is driven by one live scoring pipeline the coach operates (score.html → Supabase → every viewer surface). No GameChanger subscription, no per-family app accounts — one person scores, everyone sees broadcast-grade output on the open web.

## Operating Context

- Buildless static HTML/JS on Vercel (repo kraytos1/delmarva-aces, master auto-deploys); Supabase (Postgres + realtime + storage) as the only backend; YouTube as the video layer (live streams + VOD clips).
- Coach tools live under tools.html ("Coach HQ"), PIN-gated (2000). Scorer is operated one-handed on a phone/tablet at the field, often on flaky wifi — offline queueing and self-healing viewers are load-bearing.
- Season model: activeSeason in config.js; `__test__` season = invisible practice games.
- PWA-installable; push notifications to subscribed families on live/final.

## Capabilities and Constraints

- Live scoring: pitches, at-bats, situational context, spray charts, fielder tags, substitutions, runner credit on SB/CS. Per-runner base tracking is deliberately NOT modeled (booleans only) — viewers infer identities and must degrade gracefully.
- Architecture rule (hard-won): **the scorer publishes state; viewers never independently derive the same fact** (batting-order pointer, clip timing). Realtime is the fast path; polling is truth.
- Data honesty: spring 2026 stats are hardcoded fallback arrays on index.html, not DB rows. Fall DB fills as games are scored.
- Kids' content stays low-key: photo gallery is noindex; no public marketing of children.

## Brand Commitments

- Name: Delmarva Aces (13U East). Logo asset in repo (nav + favicon). Team colors: orange on near-black.
- Voice: confident, warm, family-facing — a broadcast for people who already love the players, not a pitch to strangers.

## Evidence on Hand

- Real rosters, schedules, box scores, highlight clip timestamps, team photos, 17 real sponsor logos (sponsors table + bucket — never bulk-delete).
- Spring 2026 archive season (62-2) preserved as hardcoded fallback.

## Product Principles

- **Family-first, not landing-page.** ~11 known families are the audience; copy that sells features to strangers is clutter (confirmed design rule).
- **Glanceable on a phone in sunlight.** Game-day surfaces answer score/inning/batter in one look.
- **One scorer, many faithful viewers.** Single source of truth; viewers follow, self-heal, and never guess wrong facts confidently.
- **Big-league feel on a zero budget.** Broadcast-grade polish using free infrastructure (YouTube, Vercel, Supabase free tier).
- **Kids protected by default.** Sensitive surfaces noindex; nothing collects family data beyond push opt-in.
