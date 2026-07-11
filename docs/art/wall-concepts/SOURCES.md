# Wall art provenance

Wall footprint masks, north/west placement rules, and the `(64,96)` anchor are
deterministic geometry. Source materials, generated candidates, wall frames,
thumbnails, and proofs are live-media records in private object storage.

The retired wall bake read media from this directory and wrote frames into
`frontend/public`; both sides of that filesystem pipeline were deleted at the
ADR-0081 cutover. New material candidates are projected in a temporary
workspace, uploaded to typed wall slots, and reviewed through the game-owned
wall instrument before backend acceptance.
