---
status: "proposed"
date: 2026-06-27
deciders: Nelson, Claude
---

# ADR-0016: UI typography is one tokenized system — families, a size scale, weights, and tracking

Generalizes the single typographic decision we already have
([ADR-0008](0008-brand-lockup-typography.md), the brand lockup) into a system for
all **living DOM text**. Sits alongside
[ADR-0014](0014-ui-chrome-low-fidelity-aesthetic.md), which governs text **baked
into chrome art** (a color-budget constraint) — this ADR governs the live text on
top of that chrome.

## Context and Problem Statement

A `--ds-*` token layer already exists in `:root` (four family tokens + a six-step
~1.2-ratio clamp size scale) — but it was never ratified or made mandatory, so the
app bypasses it wholesale:

- **253 of 278 `font-size` declarations (~91%)** are raw px/rem literals across
  **76 distinct values** — micro-stepped, no scale, px and rem with no bridge.
- The same pixel intent is written **three ways** (one swaps in `Jersey 10`, one
  adds `ui-monospace`) — there is no canonical pixel stack.
- `--font-sans` / `--font-serif` are **used 12× but defined nowhere** — those
  elements silently render in the browser default font.
- Two rival token islands (`--menu-type-*`, the asset-screen aliases) shadow the
  `--ds-*` scale.

Hierarchy is decided for exactly one component (the brand lockup); the type
*system* — which family means what, the size ramp, weights, tracking, enforcement —
is undocumented and unenforced. New surfaces re-invent it every time.

## Decision Drivers

- One place to change the type ramp, not 278.
- Kill the "every element hand-picks its own font-size and stack" entropy — the
  disease per-screen polish keeps fighting.
- Make the `--ds-*` layer the **law**, not a suggestion buried in a CSS comment.

## Decision Outcome

**All live UI text is set through design-system tokens. Raw `font-family` and
`font-size` literals are not allowed in component CSS.** The `--ds-*` layer in
`:root` is the single source; this ADR ratifies it, fills its holes, and makes it
mandatory.

### A. Families — four roles; a token is the only legal way to set one

| Token | Role |
|---|---|
| `--ds-font-display` / `--ds-font-pixel` | Default game UI — buttons, labels, dialog, headings (the two are the same stack) |
| `--ds-font-serif` | Long-form / emphasis prose where serif reads better |
| `--ds-font-sans` | Neutral fallback UI |
| `--ds-font-mono` (new) | Inspector / asset tooling / code only |

- `Advance Wars 2 GBA` is the canonical lead in every stack.
- **`Jersey 10` is dropped.** The ~20 one-off variants collapse into the canonical
  pixel stack (`--ds-font-display`/`--ds-font-pixel`).
- `--font-sans` / `--font-serif` become **defined, deprecated aliases** of
  `--ds-font-sans` / `--ds-font-serif` (resolving the 12 dead uses). No new uses.

### B. Size scale — the existing six steps + one display step; map roles, not pixels

| Step | Intended use |
|---|---|
| `--ds-text-2xs` | eyebrow / status / micro |
| `--ds-text-xs` | caption / button label |
| `--ds-text-sm` | control label / descriptor |
| `--ds-text-md` | body / row title |
| `--ds-text-lg` | section / brand heading |
| `--ds-text-xl` | page / panel display |
| `--ds-text-display` (new) | the menu title (folds in `--menu-type-title`) |

`--menu-type-*` maps onto these steps and is retired. The 19px body base folds into
`--ds-text-md`. Components reference a step; they do not hand-pick a size.

### C. Weight & style

- **Pixel/display: weight 400 only** — the face has no real weights, so emphasis is
  size/color, never synthetic bold and never italic.
- **Serif (Newsreader):** `--ds-weight-regular` (400) / `--ds-weight-medium` (500) /
  `--ds-weight-strong` (600); 600+ is reserved for the brand lockup (ADR-0008). The
  floating 380/420 values normalize onto these.

### D. Line-height & tracking

- Tracking is **two tokens**: `--ds-tracking-tight` (.01em, labels) and
  `--ds-tracking-wide` (.14em, eyebrows / brand descriptor). Ad-hoc em values map to
  one of these.
- Line-height defaults by role (tight ~1.0–1.1 for pixel headings; ~1.4 for serif
  body).

### E. Enforcement

- Every `font-family` is a `--ds-font-*` token; every `font-size` a `--ds-text-*`
  token. No literals in component CSS (only the `:root` token block defines values).
- A CI grep / stylelint allowed-list fails the build on a raw `font-size` or a
  non-token `font-family` outside the token block.
- CSS-in-JS (e.g. `ArtworkCompare.tsx`) consumes the same tokens.

### Consequences

- Good: the ramp changes in one place; the three pixel stacks and the dead
  `--font-sans/serif` path are gone; a new surface can't re-invent type.
- **Migration is a separate, staged effort, not part of accepting this ADR.** ~253
  hardcoded sizes snap onto ~7 steps — mechanical at heart but layout-affecting, so
  it is done **screen-by-screen behind the screenshot harness**, the same cadence we
  polish menus on. The token scaffolding (the new `mono`/`display`/`weight`/`tracking`
  tokens and the alias definitions) lands with this ADR; consumption migrates after.

## More Information

- Tokens: `frontend/src/style.css` `:root` (~1585–1649).
- First consumer / related decision: [ADR-0008](0008-brand-lockup-typography.md)
  (brand lockup). Baked-text constraint: [ADR-0014](0014-ui-chrome-low-fidelity-aesthetic.md).
