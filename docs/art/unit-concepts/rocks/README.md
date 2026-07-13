# Board-rock provenance

Rock source models and eight-direction delivery sprites are private live-media
records. Their typed domain metadata retains neutral-material identity,
direction, native dimensions, and the board contact anchor. Runtime code stores
the stable rock family/slot and resolves the active catalog through the backend.

The former repository renderer and committed sprite bank were retired by
ADR-0085. Replacement work fetches an authenticated source into a temporary
workspace, renders the canonical fixed camera directly at delivery size, uploads
the candidate set, and removes the workspace after board review.
