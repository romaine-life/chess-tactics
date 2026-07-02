# Landing sound effects (authored foley)

Game landing/terrain SFX are **authored recordings**, not procedurally synthesized.
(An earlier code-synthesized set was removed — see the SFX ADR.)

## Pipeline

- `source/` — the raw multi-take recordings (source of truth, kept locally; `*.mp3`
  is git-ignored, so only committed non-MP3 takes are delivered by the app image).
  Each file holds several takes back-to-back.
  - `hay.mp3` → **grass**, `water.mp3` → **water**, `sand.mp3` → **sand**,
    `landing.mp3` → **arrival** (the "unit lands on the board" thump).
  - `ui-click.mp3` → **click** — the interface feedback tap (menu/button clicks). Optional:
    the slicer skips it if the source is absent, and the UI click stays silent until supplied.
    A click take is short — if the slicer drops it, lower `MIN_SEG` for that run or hand-place
    `click/v0.mp3` + a manifest listing it.

    The shipped click take is a **single hoof clop** hand-picked from
    `stavgag-horse-walking-by-on-road-239269.mp3` (the loudest, best-isolated clop at ~0.844s).
    It was cut by hand rather than through the multi-take slicer (a lone clop is shorter than
    `MIN_SEG`). To reproduce (accurate seek needs a wav decode first — mp3 input-seek snaps to
    frames):

    ```bash
    ffmpeg -y -i stavgag-horse-walking-by-on-road-239269.mp3 -ac 1 -ar 44100 full.wav
    ffmpeg -y -ss 0.840 -t 0.140 -i full.wav raw.wav        # 4ms pre-roll + clop + decay
    # peak-normalize to -1.5 dBFS, 3ms in-fade, 80ms out-fade to zero (kills the road-noise tail)
    peak=$(ffmpeg -i raw.wav -af volumedetect -f null - 2>&1 | sed -n 's/.*max_volume: \(-\?[0-9.]*\) dB.*/\1/p')
    ffmpeg -y -i raw.wav -af "volume=$(awk -v m=$peak 'BEGIN{printf "%.2f",-1.5-m}')dB,afade=t=in:st=0:d=0.003,afade=t=out:st=0.060:d=0.080" \
      -ac 1 -ar 44100 -c:a pcm_s16le frontend/public/assets/sfx/click/v0.wav
    ```
- `slice-sfx.sh` — slices each source into individual one-shot take variants,
  normalizes (one makeup gain per whole file, preserving take-to-take dynamics),
  trims, caps over-long takes, drops near-silent fragments, and writes
  `frontend/public/assets/sfx/<key>/vN.mp3` + `manifest.json`.

Re-generate after editing a source recording:

```bash
bash tools/sfx/slice-sfx.sh   # requires ffmpeg
```

## Consumption

`frontend/src/sfx.ts` fetches each `manifest.json`, decodes the takes, and random-picks
one per landing (so repeats never fatigue). Per-set level trims live in `SAMPLE_GAINS`
in `sfx.ts`. Terrains without a set (stone/road/bridge/dirt/pebble) are silent until
recordings are added; drop sliced takes under `assets/sfx/<key>/` and map the terrain in
`TERRAIN_SAMPLE`. Audition everything in the Studio → **Sound Effects** catalog.

The **click** set is consumed by `playInterface()`, fired by a delegated click listener on
every real control (button/link/switch). It's gated on the **Interface Sounds** toggle
(Settings → Audio) and rides the effects volume like any other effect. The committed
`assets/sfx/click/manifest.json` points at `v0.wav` because repo-wide `*.mp3` ignore rules
would otherwise drop the actual take and leave deployed menu clicks silent.
