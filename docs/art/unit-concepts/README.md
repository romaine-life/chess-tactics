# Unit Concepts

## South Direction Lock

Accepted previews:
- `pawn-helmet-south-concept.png`
- `rook-south-concept.png`
- `knight-south-concept.png`
- `bishop-south-concept.png`
- `queen-south-concept.png`
- `king-south-concept.png`

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

## Generated First-Pass Sprites

Deterministic south-facing sprites for all six pieces are generated from the
accepted public concept copies:

```sh
cd frontend
npm run units:sprites
```

Outputs for each piece:
- `frontend/public/assets/units/{piece}/blue/south.png`
- `frontend/public/assets/units/{piece}/red/south.png`
- `frontend/public/assets/units/{piece}/neutral/south.png`
- `frontend/public/assets/units/{piece}/extraction-report.json`
- `frontend/public/assets/units/extraction-report.json`

The extraction is a first-pass matte, not hand cleanup: it uses color salience
and edge-connected dark-background removal. Dark outer shadow pixels can be
lost, and small dark halo pixels near protected sprite colors can remain. Team
variants recolor saturated blue/cyan sprite pixels while preserving gold, white,
black, red, and steel trim.

## Directional Production Pass

The current production fan-out writes concept candidates to:

- `docs/art/unit-concepts/directions/{piece}/{direction}.png`
- `frontend/public/assets/units/direction-concepts/{piece}/{direction}.png`

Directions are:

- `north`
- `north-east`
- `east`
- `south-east`
- `south`
- `south-west`
- `west`
- `north-west`

The south concept remains the source of truth for identity. Directional concepts
are reviewed as contact sheets before any runtime sprite pipeline consumes them.
