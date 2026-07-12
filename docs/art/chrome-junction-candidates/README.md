# Chrome junction candidate workflow

Generated chrome sheets are not consumed directly by the app. They are source
art. A generated sheet becomes a usable UI kit only after its chosen parts are
extracted into independent atoms and rails with fixed dimensions.

## Pipeline

1. Save the generated source sheet under this directory.
2. If needed, remove the chroma-key background and save an alpha source sheet.
3. Add or update a spec in
   `frontend/config/chrome-family-extraction/`.
4. Run:

   ```bash
   node frontend/scripts/extract-independent-codex-chrome-parts.mjs frontend/config/chrome-family-extraction/<spec>.json
   ```

5. Register the extracted atom family in
   `frontend/config/nine-slice-registry.json`.
6. Add bake configs under `frontend/config/nine-slice/` for panels and bars.
7. Bake through the normal kit path:

   ```bash
   node frontend/scripts/apply-nine-slice.mjs <asset-id>
   node frontend/scripts/kit-manifest.mjs
   ```

## Rules

- Do not crop generated sheets from rendering code.
- Do not encode crop boxes, target sizes, rail thickness, or transforms in a
  one-off script. Put them in a named extraction spec.
- Atoms and rails are independent source parts. A generated full frame can be a
  reference, but it is not the assembly contract.
- Candidate families should be registered with versioned names until promoted to
  a live `outer` or `inner` role.

## Rejected combined candidate

`codex-independent-v2` is retained as a diagnostic folder only. It used exact
pixel dimensions, but the source pieces were still wrong: atoms were cropped
from art that already included rail/frame arms, so assembly combined rail from
the rail source with rail already baked into the atom.

Do not promote or reuse that source pattern.

## Current separated-source candidate

`codex-independent-v3` restarts the generation with two separate source lanes:

- atom-only sheets for decorative corner/cover atoms,
- rail-only sheets for straight rails and natural rail junctions.

The sheets are not registered as a kit yet. They are for visual selection and a
future extraction spec.

Target dimensions remain:

- Outer: `34x34` corner/junction atoms, `14px` rail.
- Inner: `18x18` corner/junction atoms, `7px` rail.

## Rail contract candidates

`codex-independent-v4` adds rail-only sources for the two rail contracts we want
available at generation time:

- repeatable rail tiles, which must be edge-validated as seamless before use,
- long-authored rails, which are used as whole rails and clipped/masked under
  independent atoms.

Useful previews:

- Outer repeatable rails:
  `docs/art/chrome-junction-candidates/codex-independent-v4/outer-rails-repeatable-alpha.png`
- Outer long-authored rails:
  `docs/art/chrome-junction-candidates/codex-independent-v4/outer-rails-long-alpha.png`
- Inner repeatable rails:
  `docs/art/chrome-junction-candidates/codex-independent-v4/inner-rails-repeatable-alpha.png`
- Inner long-authored rails:
  `docs/art/chrome-junction-candidates/codex-independent-v4/inner-rails-long-alpha.png`

## Native directional family generation

Accepted live rails use the family gate from ADR-0071. Generate both orientations
in one image-model call against the dense fixed-lane template:

```bash
npm run chrome:native-rail-templates
npm run chrome:forge-native-rail-family -- --role=outer --id=<versioned-attempt-id>
npm run chrome:review-native-rail-family -- --id=<versioned-attempt-id>
```

The dense calibration lanes force the image model to paint at the installed pixel
scale. Only the named candidate lanes are extracted, always as untouched 1:1
crops. The importer rejects the attempt as a unit for wrong canvas size,
out-of-lane paint, incomplete coverage, wrong thickness, or failed repeat seams.

A registered family must name that one generation attempt. Pairing horizontal
and vertical survivors from separate attempts is prohibited even when both pass
the geometry gate independently.

Useful previews:

- Outer atoms:
  `docs/art/chrome-junction-candidates/codex-independent-v3/outer-atoms-alpha.png`
- Outer rails:
  `docs/art/chrome-junction-candidates/codex-independent-v3/outer-rails-alpha.png`
- Inner atoms:
  `docs/art/chrome-junction-candidates/codex-independent-v3/inner-atoms-alpha.png`
- Inner rails:
  `docs/art/chrome-junction-candidates/codex-independent-v3/inner-rails-alpha.png`
