# Wall-decoration provenance

Wall-decoration source strips, generated transparent sprites, face projections,
contact sheets, and proofs are private live-media versions. Typed metadata owns
the west/north face role and mount coordinates; game data stores only the stable
semantic decoration slot.

The old forge/build pair and static pixel/promotion authority were retired by
ADR-0085. The two code manifests that remain own only stable semantic slot names
and deterministic face/mount geometry; they contain no pixels, candidate list,
accepted pointer, or lifecycle state. A future authoring pass generates and
projects in a temporary workspace, uploads each exact candidate, mounts it on
the real wall preview, and records review and acceptance through the backend.
Any `/assets/...` address used by the renderer is a backend semantic slot, not a
repository or public-folder path.
