# Tile concept provenance

This directory retains text provenance only. Tile source, candidate, proof, and
runtime media moved to private live storage under ADR-0081. The former Blender
recipes and repository-output batch scripts were deleted; they are not a
supported rebuild path.

Projection geometry and visual rules remain in the board, tile, and Blender
contracts. New terrain work generates into a temporary workspace, uploads typed
terrain candidates, and is reviewed on the real board at canonical 1×.
