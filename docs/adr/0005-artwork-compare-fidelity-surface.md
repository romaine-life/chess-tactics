---
status: "accepted; navigation superseded by ADR-0058"
date: 2026-06-25
deciders: Nelson, Claude
---

> **Navigation superseded by [ADR-0058](0058-studio-editors-are-viewer-kinds-not-routes.md) (2026-07-03).**
> The compare *surface* stands — the decision to keep a permanent in-app art-vs-live
> comparator is unchanged. What changed is only *where it lives*: it is no longer a
> standalone `/artwork-compare` route with its own toolbar; it is now the Studio's
> `artworkcompare` Viewer kind (`ArtworkCompareLab`), reached from the Pages catalog's
> "Compare to art" affordance, with `/artwork-compare` kept as a deep-link alias. Everything
> below about *what it does and why* remains in force.

# ADR-0005: A permanent in-app art-vs-live compare surface

## Context and Problem Statement

Checking how faithfully a screen matches its accepted concept art kept relying on
throwaway HTML compare pages built and deleted each session. We needed a durable,
first-class way to view the concept art beside the live screen.

## Decision Drivers

- Stop rebuilding the same comparison scaffold every session.
- It must show the *live* app (not a screenshot) and be linkable to a specific pair.

## Considered Options

- One-off `_compare.html` scaffolds in `public/` (status quo).
- A standalone served dev page outside the app.
- A first-class in-app route under Creator Tools.

## Decision Outcome

Chosen: **an in-app route, `/artwork-compare?image=<art>&route=<live>`**, under
Settings → Creator Tools. Concept art on the left (dropdown-selected), the live
app route on the right (iframe), both inside identically sized bordered panes. The
live app is rendered at desktop width and scaled to fit, so the right side never
collapses into the app's mobile layout. State lives in the URL, so any comparison
is linkable and reloadable.

### Consequences

- Good: durable, reusable, linkable; reuses the already-served concept-art copy.
- Cost: ships a creator tool in the app bundle — acceptable, since Creator Tools
  is the creator/dev surface.

## More Information

- Component: `frontend/src/ui/ArtworkCompare.tsx`.
- Art source: `public/assets/artwork/inspiration/ui-screen-concepts/`.
