---
status: accepted
date: 2026-08-12
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0090](0090-private-draft-cards-preview-and-manage-working-copies.md)"
  - "[ADR-0304](0304-level-editor-documents-are-live-shared-working-copies.md)"
---

# ADR-0585: An observing capture declares itself on the request that CREATES a document, not only on the one that joins it

## Context and Problem Statement

`npm run shot` calls itself an observer of the Level Editor, and CLAUDE.md says so in the owner's
words: automated verification "opens an observing session against a real document — screenshots and
checks read it, they never write to it."

It wrote. Every capture of an editor URL that carried no `levelId` and no `document` minted a new
durable working copy on the owner's account — `user/campaign`, level id `l70`-style, name
**Untitled level**, revision 1, `never_saved: true` — and then dutifully observed the thing it had
just made. Fifteen of them were sitting on nelson@romaine.life when this was found, dated between
2026-08-09 and 2026-08-12, and they surface in the signed-in owner's **Continue editing** card list
at `/editor`: precisely the bounded private-preview surface ADR-0090 exists to scope.

The gap was in *which request* observation covered. `installObservationSessionPatch` rewrites
`POST /api/editor-documents/{id}/edit-sessions` to `intent: 'observe'`, and the server honours it —
the session comes back `state: "observing"`, exactly as designed. But a session-open needs a
document id, so by the time that request exists the document exists too. The write happens one
request earlier, in `POST /api/editor-documents/resolve`, which does two different jobs behind one
address: it ATTACHES to a working copy, and for a URL that has none it CREATES one. Observation had
been fitted to the join and never to the birth.

Measured directly against the live editor rather than argued from the code
(`frontend/tmp-shots/probe.mjs`, discarded):

- `/editor/level?levelId=off-l-hold-bridge&layer=camera` → `POST …/resolve` **200**, attaching to the
  existing `legacy-j5kip7ztaipw`; session `state: "observing"`. Already read-only. `dbResolveEditorDocument`
  reconciles a found row through `dbReconcileEditorDocument`, which reports `baseline_conflict` and
  writes nothing.
- `/editor/level?layer=camera` → `POST …/resolve` **201**, minting `l71`. One capture, one document.

So the defect is narrow and total: attaching was always clean, creating was never covered.

## Decision Drivers

- The observation contract is stated to the owner as a guarantee. A guarantee that holds for one of
  two requests on the path is not one.
- A capture that cannot find something to look at should say so. Minting a blank level and
  photographing it answers a question nobody asked.
- The rewrite must not use CDP request interception. This script already carries a long comment and a
  measured 6/6 hang (commit af37db63) explaining why: interception wedges Vite dev-server module
  requests indefinitely, and every editor capture loads the board's lazily-imported modules.
- The owner's private documents are the thing being protected. Cleanup after the fact is not a
  substitute for not creating them.

## Considered Options

- Teach the capture not to use document-less editor URLs (a usage rule, enforced by nothing).
- Have the capture delete whatever it created, after the fact.
- Extend the existing `intent` vocabulary to the resolve request, and refuse the create.

## Decision Outcome

Chosen: **extend the existing `intent` vocabulary to resolve**, because the seam and the word already
exist — `editorEditSessionOpenRequest` has parsed `intent: 'write' | 'observe'` (body or
`x-level-editor-session-intent`, defaulting to `write`) since observation was introduced. Resolve now
parses the same field the same way, so an observing caller declares itself once and every
document-touching request on the path honours it. Under `observe`:

- a create-shaped body (no `level_id`) is refused **409 `observation_cannot_create_editor_document`**;
- a `level_id` with no working copy is refused **404 `editor_document_not_found_for_level`**, thrown
  before the canonical read and the INSERT;
- an existing working copy resolves exactly as before, 200, reconciled and unwritten.

Page-side, `editorDocumentObservationKind` is now the single classifier both the rewrite and the
node-side tally consult, so the two cannot drift about what needed rewriting — the same reason that
predicate was shared for the session-open. `shot.mjs` reports a refusal **before any pixels are
written**, naming the fact rather than the status: the editor renders a local-only fallback when its
document never arrives (`setCloudSaveState('error')`, "Cloud autosave is unavailable"), so the
selector would have been found and a PNG of that fallback would have looked like a successful
capture of an empty level.

A usage rule was rejected because nothing would enforce it — the fifteen documents are what a usage
rule that nobody wrote down produces. Delete-after-the-fact was rejected because it makes every
capture a writer whose cleanup can fail, and a failed cleanup is indistinguishable from the bug
being fixed.

`--anonymous` was fixed in the same pass, because it is now the answer the error message gives for
capturing a blank editor and it did not work. It skipped the sign-in navigation only, and the local
dev backend grants a loopback request an owner session regardless — so `/api/auth/me` answered
signed-in from a cookie-less profile and the page opened private routes anyway. Its signed-out mock
existed but sat inside the CDP interception block, which only runs behind `--abort-request*`. It is
now a `window.fetch` patch on that one request, the same technique the observation rewrite uses.

### Consequences

- Good: the stated contract is now the enforced one, at the server boundary rather than by client
  convention. A capture cannot create an editor document, whatever URL it is pointed at.
- Good: a document-less editor URL produces a named refusal and a non-zero exit instead of a
  plausible screenshot of a level that did not exist a second earlier.
- Good: `--anonymous` genuinely signs the capture out, so a blank-editor capture has a real path.
- Cost: captures of a bare `/editor/level` now fail. That is the intended behaviour, and the error
  names the three ways forward (an existing `levelId`, an existing `?document=`, or `--anonymous`).
- Cost: `check-workspace-geometry.mjs` and `level-editor-pan-e2e.mjs` share the patch and inherit the
  refusal. Both take an explicit URL pointing at a real document and both wait on a selector with a
  timeout, so a refused resolve surfaces as a selector timeout rather than the named message.
- No migration. `intent` is a request field with a `write` default; every existing caller is unchanged.

## Pros and Cons of the Options

### Teach the capture not to use document-less URLs

- Good: no code.
- Bad: enforced by nothing, and the fifteen orphans are the evidence of what that is worth.

### Delete after the fact

- Good: leaves no residue when it works.
- Bad: every capture stays a writer; a failed cleanup reproduces the original bug; and a document
  that briefly existed has already appeared in **Continue editing**.

### Extend `intent` to resolve

- Good: reuses the vocabulary, the parser shape and the `write` default already in the file; refuses
  at the boundary; one classifier shared by the rewrite and its proof.
- Bad: a second place that must keep speaking the same two words. Mitigated by parsing them
  identically and defaulting identically.
