---
status: accepted
date: 2026-08-07
deciders: Nelson, Claude
refines:
  - "[ADR-0304](0304-level-editor-documents-are-live-shared-working-copies.md)"
  - "[ADR-0306](0306-browser-authentication-has-one-session-owner.md)"
---

# ADR-0519: An expired sign-in pauses the Level Editor instead of closing it

## Context and Problem Statement

Editing a level, the sign-in expires. Nothing says so; the header still shows the account. Every
edit from that moment on is lost the instant the owner signs back in.

Three independent defects produced that, and each one alone was enough to lose the work.

**The sign-out was invisible.** `/api/auth/me` is read once at startup, and under
[ADR-0306](0306-browser-authentication-has-one-session-owner.md) the shared owner only changes when
some call reports a 401 into it. The editor's autosave failure path never did: a 401 fell into the
generic catch beside a dropped connection, so the shell went on believing it was signed in and the
owner saw "Cloud autosave failed" — true, unactionable, and not what had happened.

**The first failure stopped autosave for the rest of the session.** The debounced autosave effect
returns early whenever the cloud state is `error`. Nothing cleared that latch except a browser
`online` event or the popup sign-in handoff, neither of which a cookie expiry fires. Even
re-authenticating in another tab and returning did not resume it.

**Signing back in orphaned the browser buffer.** Under ADR-0304 browser storage is a bounded retry
buffer, and it did keep the edits — but its address is keyed by account and page session. Signing in
navigates, which retires the page identity, so the returning page found the draft as another
session's *preserved branch*, and adopting one requires a clean document. A level being edited is
dirty by definition, so the branch was declined, the pre-sign-out body mounted over it, and the
work sat in `localStorage` with no UI that could name it or bring it back.

## Decision Outcome

**An expired sign-in under an open working copy is a PAUSE, not a failure and not a closed
document.** The board stays mounted and editable, the browser buffer keeps recording, and the same
owner signing back in resumes the page it left.

- **`signed-out` is its own cloud state**, distinct from `error`. `error` means a write did not land
  and might on retry; `signed-out` means the work is intact and one specific act — signing in —
  resumes it. They earn different words and different buttons: **Sign in and resume**, never
  *Retry*.
- **The 401 is classified by the session owner, not the screen.** The autosave catch calls
  `reportAuthSessionFailure`, which is ADR-0306's authoritative classifier; a true 401 flips the
  shared identity so the whole shell stops claiming to be signed in. The screen reads the boolean,
  it does not read the status code.
- **Document resolution is not re-entered on a lost session.** `isInterruptedByCloudSignOut` guards
  the resolve effect *before* it tears the edit session down. Falling through would reach the
  signed-out branch, which answers "sign in to open this editor document" — blocking the board,
  stopping the buffer, and stranding every edit since the expiry in RAM until the sign-in
  navigation discards it. **This guard is the fix; removing it restores the bug.**
- **The browser recovery is addressed by the document's owner, not by the live session.** Once a
  document resolves, its owner email is held for the page's lifetime. Reading it off the current
  session meant recovery writes stopped at the exact moment they became the only copy.
- **Resuming reconnects; it does not re-open.** `shouldResumeInterruptedCloudSync` requires the same
  account — a different owner falls through to ordinary resolution and can never inherit another's
  mounted document. The resume reopens the page session and rebases onto the acknowledged server
  revision, then lets the normal compare-and-swap autosave carry the signed-out edits up. It must
  never call `applyLevelDocument`: painting the server body over the live editor is the loss this
  whole path exists to prevent. A document that genuinely advanced elsewhere surfaces through the
  existing conflict/merge path.
- **Sign-in is re-probed only while paused.** A bounded probe on focus, visibility and a 20s tick
  runs *only* in the `signed-out` state, so a sign-in completed in another tab is noticed without
  polling identity in the general case. It also self-heals a spurious 401: if the session was in
  fact valid, the first probe restores it. An unreachable probe keeps the last authoritative
  snapshot — a transport blip is not a sign-out.
- **With no browser recovery, sign-in must not navigate away.** When storage is blocked the live
  board is the only copy, so the action opens sign-in beside the editor and lets the probe resume in
  place.

**A browser branch that mount declines to adopt is OFFERED.** Every path that archives an unadopted
divergent candidate now surfaces the newest one as **Restore these edits / Download copy /
Discard**, and the export falls back to it — a retired page session owns no scoped draft, and that
copy is precisely the one worth exporting. The adoption rules in ADR-0304 are unchanged; what
changes is that declining to adopt is no longer the same as hiding it.

## Consequences

- Recovery notices stack rather than overlap: an offer and an interruption can be true at once and
  each needs its own actions. Both use the one existing persistence-notice surface — a new painted
  variant would be raw CSS chrome the surface contract rejects.
- The editor's identity state can now change without a document reload. Anything new that keys off
  `me` inside the editor must tolerate an expired session over a live document.
- Verified end to end against real documents: the 401 raises the paused banner with the board still
  editable, edits made while signed out reach the browser recovery while the server body stays put,
  and signing back in syncs those exact edits without a reload. Both proofs ran on throwaway levels
  that were deleted afterwards.
