---
status: accepted
date: 2026-07-25
deciders: Nelson, Codex
partially_supersedes: "[ADR-0143](0143-level-editor-sessions-are-attributable-single-writer-and-owner-takeoverable.md)"
---

# ADR-0154: Level Editor viewing does not acquire the writer lease

## Context

ADR-0143 separated writer authority from document revision, but the initial
implementation granted a free writer lease as soon as an owner opened the Level
Editor. An untouched page therefore looked like a live editor until its lease
expired if the browser process disappeared. The server was correct not to infer
that a vanished writer had no unsent RAM, but the page should not have become a
writer before expressing any persisted authoring intent.

Viewport movement, layer/tool selection, object selection, and visual review are
not document mutations. They must not block another tab from beginning real
work.

## Decision

Opening an owner Level Editor page registers an attributable **viewer session**.
Registration:

- does not acquire the writer lease;
- does not advance the fencing generation;
- does not create a recovery snapshot or document revision; and
- returns the current active or most recent authoritative editor separately.

The first change to persisted Level content or its staged campaign assignment
starts editing. The client synchronously records the changed candidate in its
session-scoped browser recovery, then submits a generation-fenced acquisition
request. No cloud mutation is sent before that request is acknowledged.

If the lease is still free, the server advances the fencing generation,
activates that viewer session, and autosave writes the already-visible first
change. If another viewer won the race, the stale generation cannot take over
the new writer. The losing candidate remains a separate browser recovery, the
acknowledged cloud body is remounted read-only, and the active editor is named
in Status.

An explicit **Start editing here** action may acquire a free lease before a
change. **Take over editing** remains an explicit confirmed action whenever
another live writer exists, with the displaced server-known branch preserved as
required by ADR-0143. Reopening the same still-active page session may renew its
existing lease; a different page never acquires merely by opening.

Owner management actions outside the Level Editor register, acquire the free
lease with the same generation fence, perform their one mutation, and close.
They never displace an active Level Editor implicitly.

## Consequences

- Opening or screenshotting an untouched owner Level Editor no longer blocks
  the real author or creates expiry-recovery clutter.
- The authority lease now means that the page has explicitly started editing,
  so conservative crash expiry remains appropriate after acquisition.
- The first persisted change may briefly exist only in session-scoped browser
  recovery while the acquisition request is in flight.
- Selection, inspection, camera controls, and tool/layer choice remain usable
  without writer authority when no competing writer exists.

## Required verification

- Opening and closing an untouched owner page leaves document revision, fencing
  generation, active-writer count, and recovery count unchanged.
- The first persisted authoring change acquires the free lease before autosave
  sends a fenced document mutation.
- Two viewers making their first change concurrently produce exactly one writer;
  the loser cannot displace it and retains a separate browser recovery.
- A page opened while another writer is active remains fully read-only and
  cannot turn a local gesture into an implicit takeover.
- Campaign Editor management mutations explicitly acquire and close a free
  session and fail closed when a Level Editor already holds authority.
