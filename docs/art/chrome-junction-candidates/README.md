# Chrome candidate workflow

Chrome source sheets, extracted candidates, review images, native-rail reports,
and rejected attempts are backend-owned media under ADR-0085. Their historical
repository paths are preserved in migration provenance, but the bytes do not
belong in this directory after cutover.

The durable workflow is:

1. Generate or extract into a temporary, ignored workspace at native size.
2. Preserve exact source bytes with `live-media-admin-client.mjs
   archive-source`.
3. Upload candidates with `upload-candidate` or an outside-repository
   `upload-candidate-batch` manifest. Candidate metadata records role, family,
   orientation, crop, native dimensions, provider attempt, and seam evidence.
4. Inspect candidates through Chrome Lab or Rail Lab, which read the admin media
   catalog and authenticated candidate URLs.
5. Record owner review and activate canonical semantic slots through the backend
   workflow. Copying a file, changing a manifest, or saving a generated filename
   cannot install Chrome art.

Runtime Chrome consumes only these stable roles:

- `ui/chrome/outer/atom.png`
- `ui/chrome/outer/rail.png`
- `ui/chrome/inner/atom.png`
- `ui/chrome/inner/rail.png`
- `ui/chrome/divider/joint.png`

Numeric composition geometry remains code-owned. Material bytes, candidate
membership/provenance, lifecycle state, and active pointers remain live-storage
owned. The native-size, directional-family, seam, and no-resampling rules in
ADR-0084 still apply.
