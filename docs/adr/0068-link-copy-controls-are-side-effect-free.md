---
status: "accepted"
date: 2026-07-08
deciders: Nelson
---

# ADR-0068: Link-copy controls are side-effect free

## Context and Problem Statement

The Level Editor's Board panel has link-copy controls. One of them is currently labeled
"Share Link" and has been implemented as a publish action: it calls the backend, creates or
refreshes a public map row, and copies a generated `/play?map=...` URL.

That is the wrong contract for this control. A button that appears to copy a link must not
quietly publish, save, refresh snapshots, mutate the URL, change route state, create public
records, or otherwise alter the app. The owner's intent is stricter and simpler: the control
copies the link that is already in the browser's URL bar.

## Decision Drivers

- Copying a link is a clipboard operation, not a persistence operation.
- A user should never trigger publish/save/public-record creation by pressing a copy-link button.
- The browser address bar is the source of truth for what gets copied.
- The action must be understandable without knowing implementation terms such as `public_maps`,
  "publish", "snapshot", or "share link".

## Considered Options

- Keep the current publish-and-copy behavior.
- Keep a copy button, but have it mint or refresh a public link behind the scenes.
- Make link-copy controls side-effect free: copy the current address bar URL only.

## Decision Outcome

Chosen: **link-copy controls are side-effect free**.

The Level Editor Board panel's current "Share Link" button, and any replacement for it, must
make **no app change whatsoever**. It must only copy the current browser address bar URL. It must
not:

- save or publish content
- create, update, or refresh `public_maps`
- call `/api/maps/publish`
- mutate any DB row or local application state
- rewrite, normalize, or navigate the current URL
- switch modes, routes, panels, selections, or dirty/saved state

The only allowed effect is the browser/OS clipboard receiving the exact current URL. If the app
needs a publishing workflow, that must be a separate explicitly labeled action, not hidden behind
a copy-link button.

## Consequences

- Good: link-copy behavior becomes obvious and trustable.
- Good: copy-link controls cannot accidentally change live content or public availability.
- Good: the URL bar remains the single visible source for what will be copied.
- Cost: any future public-map publishing workflow needs its own explicit affordance and wording.

## Implementation Notes

For the Level Editor Board panel, this decision means the button currently labeled "Share Link"
must stop calling `publishMap()` / `/api/maps/publish`. The copy operation should read the current
location from the browser and write that URL to the clipboard.
