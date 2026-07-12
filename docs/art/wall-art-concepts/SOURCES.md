# Wall-decoration provenance

Wall-decoration source strips, generated transparent sprites, face projections,
contact sheets, and proofs are private live-media versions. Typed metadata owns
the west/north face role and mount coordinates; game data stores only the stable
semantic decoration slot.

The old forge/build pair and its static manifest were retired by ADR-0085. A
future authoring pass generates and projects in a temporary workspace, uploads
each exact candidate, mounts it on the real wall preview, and records review and
acceptance through the backend.
