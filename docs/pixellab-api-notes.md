# PixelLab API and MCP Notes

These notes capture what we learned while trying to use PixelLab for the board
tile pipeline. They are intentionally practical: what seemed useful, what broke,
and how to approach the next experiment.

## Current Read

PixelLab is useful for raw game-asset candidates, inspiration, and object-style
animation experiments. It should not be treated as the geometry authority for
this project.

For Chess Tactics, generated material still has to land in the explicit layer contract
from ADR-0075 and `docs/tile-ruleset.md`:

- native `96x180` TOP or SIDE frame;
- canonical top vertices `(48,41) (96,68) (48,95) (0,68)`;
- top and side alpha ownership kept separate;
- shared edge sockets;
- no generated crop junk, chess pieces, side-bearing cube, or mismatched perspective.

PixelLab can help make candidate art. The local pipeline decides whether that
candidate becomes a production asset.

## MCP Shape

The PixelLab MCP exposes game-asset-shaped tools rather than a generic image
prompt endpoint. The relevant tools we considered or used:

- `create_tiles_pro`: tile sheets; supports style references through
  `style_images` JSON with base64 data.
- `create_1_direction_object`: standalone object generation; can use
  `style_images`.
- `create_8_direction_object`: multi-angle object generation; can use a
  `reference_image_base64` or `style_image_base64`.
- `animate_object`: object animation; useful for props or effects, but not
  automatically a board-tile animation solution.
- tileset tools such as top-down and sidescroller tilesets: promising for normal
  game tilesets, but not automatically aligned to our custom isometric tile body.

The MCP terms do not map perfectly to the web UI or Aseprite integration terms.
Expect naming mismatches around "reference image", "style image", "concept
image", and "init image".

## Reference Support

Reference support exists, but it is not uniform across tools.

Useful patterns:

- Some tools accept explicit base64 image fields.
- `create_tiles_pro` supports `style_images` as JSON.
- Object tools have clearer reference/style image fields than some tile tools.
- The safest route is to provide image data explicitly, not just mention a file
  path in the prompt.

Open question:

- Whether a given MCP call treats a reference as style, structure, exact image,
  or loose inspiration depends on the tool. Test each tool directly and record
  the result.

## What Worked

- PixelLab generated asset-shaped candidates quickly enough to explore.
- Downloading outputs locally and reviewing them inside Tileset Studio was more
  useful than judging them on the website.
- PixelLab outputs were useful as raw candidates and visual prompts for what to
  avoid or pursue.

## What Did Not Work

- The web workflow was too slow and clunky for fast iteration.
- Raw PixelLab tiles did not automatically match our board geometry.
- Generated animation frames were not guaranteed to preserve a stable tile body.
- A good-looking generated image was not enough; it still had to socket into the
  board and survive board-scale review.
- Treating the output as final art caused confusion. The catalog should show
  accepted assets; candidates belong in a queue/review workflow.

## Local Pipeline Lessons

Do not accept generated tile art directly.

The pipeline should be:

1. Generate candidate art with PixelLab or another image tool.
2. Download outputs into `docs/art/...` for auditability.
3. Keep candidate sources under `docs/art/...`; use the deterministic builder to emit
   public runtime layers only when a candidate is worth testing in the app.
4. Verify canonical footprint, edge angle, side height, and socket legality.
5. Review in Tileset Studio at tile scale and board scale.
6. Promote only accepted assets into the main catalog.

PixelLab is one input to the pipeline, not the pipeline.

## Recommended Next PixelLab Experiment

Use `create_tiles_pro` with explicit `style_images` from the relevant production
`-top.png` layers or their original flat material sources. Never provide a combined
top+side cube as a transition-top reference.

Test one narrow target at a time:

- one grass base tile variant
- one water base tile variant
- one grass-water transition mask

For each run, record:

- PixelLab tool name
- exact prompt
- exact top-only reference image source
- whether reference was style-only or structure-following
- generated output IDs
- local downloaded paths
- Tileset Studio verdict

Do not start by asking PixelLab for a full production tileset. Start with one
asset and prove the reference/style behavior.

## Animation Takeaway

Water top animation is solved and accepted. `frontend/scripts/build-water-anim.py`
turns native PixelLab candidates into an eight-frame horizontal TOP sheet: every frame
copies the static top alpha, frame 0 is the exact static top, and the independent SIDE
never moves. The tile-layer guard verifies those invariants.

For another animated terrain family:

- start from its accepted static TOP and generate small frame deltas;
- preserve palette and copy the exact static alpha into every frame;
- keep frame 0 identical to the static TOP;
- do not redesign or animate the SIDE as part of a top experiment;
- use frame-by-frame pixel checks and real-board review before registry acceptance.

## Standing Rule

PixelLab can produce candidates. Chess Tactics owns acceptance.

No PixelLab output becomes production art until it passes:

- canonical geometry check
- socket legality check
- board-scale visual review
- style match against the skirmish concept target
