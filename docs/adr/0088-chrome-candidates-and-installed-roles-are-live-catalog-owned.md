---
status: "accepted"
date: 2026-07-12
deciders: Nelson, Codex
partially_supersedes:
  - ADR-0084
---

# ADR-0088: Chrome candidates and installed roles are live-catalog owned

## Context

The runtime-media cutover re-audit found a parallel Chrome change that had
landed before ADR-0085's guard reached `main`. It committed 530 review images
under a public runtime path, two generated candidate/family manifests, media
writers, and five generated candidate ids selected by a committed Chrome
profile. A naive path-preserving import would have made every review image an
active public bridge and would still have required a source push to change the
installed Chrome material.

ADR-0084's native-size directional-family and review rules remain correct. Its
Git-backed family records, candidate directories, generator enforcement, and
installed candidate selection do not.

## Decision

### Installed material has five canonical roles

Live Chrome refers only to these semantic runtime slots:

- `ui/chrome/outer/atom.png`
- `ui/chrome/outer/rail.png`
- `ui/chrome/inner/atom.png`
- `ui/chrome/inner/rail.png`
- `ui/chrome/divider/joint.png`

Postgres owns each role's active version. Candidate ids, generated filenames,
repository paths, and hashes cannot be installed authority. Numeric composition
geometry remains code-owned; its source selectors name canonical roles only.

### Candidate and family records come from the admin catalog

Chrome and native-rail attempts are non-active backend candidate versions. Their
version metadata records candidate id/label, role, kind, fit, orientation,
family membership, native dimensions, provider attempt, crop/source evidence,
recommendation, and seam evidence as applicable. Chrome Lab and Rail Lab obtain
that inventory and authenticated candidate content URLs from
`/api/admin/media-assets`. They have visible loading, failure, and refresh state
and no committed manifest fallback.

Source sheets, reports, generated manifests, reviews, and rejected attempts are
private archived versions. Generation and extraction use temporary workspaces
and the live-media upload client; no tool publishes into the repository.

### Cutover preserves bytes without manufacturing acceptance

The one-time importer creates candidate versions for historical Chrome review
images and archives their reports/manifests. It separately maps the five parts
that the old committed profile actually displayed to the canonical runtime
slots as non-production-eligible `legacy-bridge` activations. It never records
owner review or accepted status.

## Consequences

- Changing installed Chrome bytes no longer requires renaming a file or editing
  a candidate manifest in Git.
- Review galleries do not become public runtime slots merely because their old
  files lived under `frontend/public`.
- Chrome and Rail Labs remain owner-operable instruments while their candidate
  database moves behind the backend.
- The initial canonical mappings are storage bridges, not retroactive approval;
  typed UI-kit acceptance still gates production-eligible replacements.

## Related decisions

Builds on ADR-0071 (the deliverable is the instrument), ADR-0076 (native 1x),
ADR-0084 (directional rail families), ADR-0085 (live-storage ownership), and
ADR-0086 (one live data plane).
