# Codex fence realignment prompts

Both outputs were generated with the built-in image-generation tool as
high-resolution **calibration references**. The shown game frames are explicitly
LANCZOS-resampled and cannot be promoted under ADR-0076.

## Wood

Input 1: `docs/art/fence-concepts/candidates/2026-07-10/codex/wood-kit-alpha.png`
as the design/style reference.

Input 2: `frontend/public/assets/tiles/feature/fence-wood-2.png` as projection
and orientation reference only.

```text
Use case: stylized-concept
Asset type: non-production calibration reference for a native pixel-art tactics-game fence kit
Input images: Image 1 is the exact wood design and pixel-art style reference; Image 2 is the required board-edge projection/orientation reference only.
Primary request: regenerate one isolated rustic oak picket-fence rail and one separate matching terminal post. Preserve Image 1's warm oak palette, picket design, rail construction, iron-banded post, chunky pixel-art treatment, and overall visual quality.
Composition: rail on the left, post on the right, clearly separated with generous empty space.
Critical geometry change: the rail must follow Image 2's steep 2:1 isometric board edge, rising exactly 27 units while running 48 units from lower-left to upper-right (29.36 degrees). Do not reuse Image 1's shallow rail angle. The two rail endpoints must visibly lie on that single 2:1 axis. Pickets remain vertical on screen.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background.
Constraints: one rail and one post only; no terrain, grass, ground strip, cast shadow, glow, text, border, watermark, or extra objects. Do not use #00ff00 in the subjects.
```

## Stone

Input 1: `docs/art/fence-concepts/candidates/2026-07-10/codex/stone-kit-alpha.png`
as the design/style reference.

Input 2: `frontend/public/assets/tiles/feature/fence-stone-2.png` as projection
and orientation reference only.

```text
Use case: stylized-concept
Asset type: non-production calibration reference for a native pixel-art tactics-game fence kit
Input images: Image 1 is the exact fieldstone design and pixel-art style reference; Image 2 is the required board-edge projection/orientation reference only.
Primary request: regenerate one isolated low capped fieldstone fence rail and one separate matching compact terminal pier. Preserve Image 1's pale-gray irregular masonry, cool mortar, restrained tan variation, capstone design, chunky pixel-art treatment, and visual quality.
Composition: rail on the left, compact post on the right, clearly separated with generous empty space.
Critical geometry change: the rail must follow Image 2's steep 2:1 isometric board edge, rising exactly 27 units while running 48 units from lower-left to upper-right (29.36 degrees). Do not reuse Image 1's shallow rail angle. The two rail endpoints must visibly lie on that single 2:1 axis. Make the terminal pier proportionally small—roughly half the rail's visible height, not a tower.
Scene/backdrop: perfectly flat solid #00ff00 chroma-key background.
Constraints: one rail and one compact post only; no terrain, grass, ground strip, rubble, cast shadow, glow, text, border, watermark, or extra objects. Do not use #00ff00 in the subjects.
```
