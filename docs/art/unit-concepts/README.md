# Unit Concepts

## Identity Lock

The six production identities are pawn, rook, knight, bishop, queen, and king.

Direction:
- Normal chess piece first, squad unit second.
- Each unit keeps the classic chess silhouette readable before tactical ornament.
- Pawn uses a restrained helm shell and collar relationship, but should still read
  as a pawn first.
- Rook uses a square castle form with a wide top-platform gate as the facing cue.
- Knight uses leather tack/straps instead of gold trim.
- Bishop uses a mitre-like head and classic diagonal cut, without religious props.
- Queen uses a carved tiara crest, not jewelry or a coronet cup.
- King uses the classic small structural cross finial as a chess-piece cue.
- South-facing details sit on the front of the piece to make facing direction obvious.
- No face, arms, legs, weapon, or character body.
- No separate pedestal, plinth, trophy base, or oversized base ring as a design feature.
- Style target is pixel-tactics: Into the Breach / Advance Wars clarity with Chessmaster identity.

Open polish pass:
- Make the sprite more pixel-native and less glossy.
- Reduce ornament if it starts reading too royal, ceremonial, or character-like.
- Keep the facing mark readable without turning pieces into full character poses.

## Live Asset Contract

Board-unit candidates and accepted frames are uploaded through Unit Art. Postgres
owns metadata and accepted pointers; immutable PNG bytes live in the unit-assets
storage container. Authoring tools may create local review outputs, but they do not
write board sprites into `frontend/public`.

Every candidate requires six palettes and eight directions. Acceptance publishes
the complete asset atomically while the stable piece-family identity remains the
same.
