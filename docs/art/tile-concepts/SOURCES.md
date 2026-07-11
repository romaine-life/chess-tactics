# Tile source records

Tile source packs are private live-media records. Git does not mirror their
archives, textures, meshes, previews, or rendered derivatives. Text license and
provenance metadata may remain here, but it must identify the corresponding
private version rather than a repository media path.

An authoring tool fetches the selected private source into a temporary
workspace, applies deterministic projection code, uploads the exact result as a
candidate, and removes the workspace after review. A local mirror or historical
worktree path is not source authority.
