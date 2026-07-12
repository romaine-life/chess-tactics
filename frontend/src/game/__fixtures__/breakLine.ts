// Real shipped board `off-l-break-line` (campaign off-c-crown-valoria), fetched from
// the official-campaigns workspace blob 2026-07-05. The Texel-fit practice sandbox
// (docs/per-board-ai-plan.md §8). 3×8, rival-kings, King+3 pawns vs King+bishop+pawn.
// Cast through unknown because the stored terrain cells carry editor-only extras
// (e.g. `cover`) beyond the core TerrainCell shape; behaviourally identical for play.
import type { Level } from '../../core/level';

export const breakLineLevel = ({
  "id": "off-l-break-line",
  "name": "Break the Line",
  "board": {
    "cols": 3,
    "rows": 8,
    "heightLevels": 1
  },
  "notes": "Punch through the central road before the enemy can consolidate.",
  "theme": "grassland",
  "layers": {
    "props": [],
    "units": [
      {
        "x": 1,
        "y": 6,
        "side": "player",
        "type": "pawn",
        "facing": "north"
      },
      {
        "x": 0,
        "y": 6,
        "side": "player",
        "type": "pawn",
        "facing": "north"
      },
      {
        "x": 0,
        "y": 7,
        "side": "player",
        "type": "king",
        "facing": "south"
      },
      {
        "x": 0,
        "y": 0,
        "side": "enemy",
        "type": "king",
        "facing": "south"
      },
      {
        "x": 1,
        "y": 1,
        "side": "enemy",
        "type": "bishop",
        "facing": "south"
      },
      {
        "x": 1,
        "y": 7,
        "side": "player",
        "type": "pawn",
        "facing": "north"
      },
      {
        "x": 0,
        "y": 1,
        "side": "enemy",
        "type": "pawn",
        "facing": "south"
      }
    ],
    "zones": [],
    "decals": [],
    "terrain": [
      {
        "x": 0,
        "y": 0,
        "cover": {
          "density": "filled"
        },
        "terrain": "stone",
        "elevation": 0
      },
      {
        "x": 1,
        "y": 0,
        "cover": {
          "density": "filled"
        },
        "terrain": "stone",
        "elevation": 0
      },
      {
        "x": 2,
        "y": 0,
        "cover": {
          "density": "filled"
        },
        "terrain": "sand",
        "elevation": 0
      },
      {
        "x": 0,
        "y": 1,
        "cover": {
          "density": "filled"
        },
        "terrain": "road",
        "elevation": 0
      },
      {
        "x": 1,
        "y": 1,
        "cover": {
          "density": "filled"
        },
        "terrain": "road",
        "elevation": 0
      },
      {
        "x": 2,
        "y": 1,
        "cover": {
          "density": "filled"
        },
        "terrain": "sand",
        "elevation": 0
      },
      {
        "x": 0,
        "y": 2,
        "cover": {
          "density": "filled"
        },
        "terrain": "grass",
        "elevation": 0
      },
      {
        "x": 1,
        "y": 2,
        "cover": {
          "density": "filled"
        },
        "terrain": "road",
        "elevation": 0
      },
      {
        "x": 2,
        "y": 2,
        "cover": {
          "density": "filled"
        },
        "terrain": "grass",
        "elevation": 0
      },
      {
        "x": 0,
        "y": 3,
        "cover": {
          "density": "filled"
        },
        "terrain": "grass",
        "elevation": 0
      },
      {
        "x": 1,
        "y": 3,
        "cover": {
          "density": "filled"
        },
        "terrain": "road",
        "elevation": 0
      },
      {
        "x": 2,
        "y": 3,
        "cover": {
          "density": "filled"
        },
        "terrain": "grass",
        "elevation": 0
      },
      {
        "x": 0,
        "y": 4,
        "cover": {
          "density": "filled"
        },
        "terrain": "grass",
        "elevation": 0
      },
      {
        "x": 1,
        "y": 4,
        "cover": {
          "density": "filled"
        },
        "terrain": "road",
        "elevation": 0
      },
      {
        "x": 2,
        "y": 4,
        "cover": {
          "density": "filled"
        },
        "terrain": "grass",
        "elevation": 0
      },
      {
        "x": 0,
        "y": 5,
        "cover": {
          "density": "filled"
        },
        "terrain": "grass",
        "elevation": 0
      },
      {
        "x": 1,
        "y": 5,
        "cover": {
          "density": "filled"
        },
        "terrain": "road",
        "elevation": 0
      },
      {
        "x": 2,
        "y": 5,
        "cover": {
          "density": "filled"
        },
        "terrain": "grass",
        "elevation": 0
      },
      {
        "x": 0,
        "y": 6,
        "cover": {
          "density": "filled"
        },
        "terrain": "road",
        "elevation": 0
      },
      {
        "x": 1,
        "y": 6,
        "cover": {
          "density": "filled"
        },
        "terrain": "road",
        "elevation": 0
      },
      {
        "x": 2,
        "y": 6,
        "cover": {
          "density": "filled"
        },
        "terrain": "grass",
        "elevation": 0
      },
      {
        "x": 0,
        "y": 7,
        "cover": {
          "density": "filled"
        },
        "terrain": "road",
        "elevation": 0
      },
      {
        "x": 1,
        "y": 7,
        "cover": {
          "density": "filled"
        },
        "terrain": "grass",
        "elevation": 0
      },
      {
        "x": 2,
        "y": 7,
        "cover": {
          "density": "filled"
        },
        "terrain": "grass",
        "elevation": 0
      }
    ]
  },
  "economy": {
    "incomePerTurn": 120,
    "startingFunds": 1000
  },
  "boardCode": "eyJjIjozLCJyIjo4LCJwZiI6Im5hdnktYmx1ZSIsImYiOiJncmFzcy1zdXJmLTAiLCJ0Ijp7IjAsMCI6InN0b25lLXN1cmYtNyIsIjEsMCI6InN0b25lLXN1cmYtNyIsIjIsMCI6InNhbmQtc3VyZi0yIiwiMiwxIjoic2FuZC1zdXJmLTQifSwidSI6eyIxLDYiOlsicGF3bi1jb2RleHNoZWV0Iiwibm9ydGgiLCJuYXZ5LWJsdWUiXSwiMCw2IjpbInBhd24tY29kZXhzaGVldCIsIm5vcnRoIiwibmF2eS1ibHVlIl0sIjAsNyI6WyJraW5nLWNyb3duIiwic291dGgiLCJuYXZ5LWJsdWUiXSwiMCwwIjpbImtpbmctY3Jvd24iLCJzb3V0aCIsImNyaW1zb24iXSwiMSwxIjpbImJpc2hvcC1taXRyZSIsInNvdXRoIiwiY3JpbXNvbiJdLCIxLDciOlsicGF3bi1jb2RleHNoZWV0Iiwibm9ydGgiLCJuYXZ5LWJsdWUiXSwiMCwxIjpbInBhd24tY29kZXhzaGVldCIsInNvdXRoIiwiY3JpbXNvbiJdfSwidiI6eyIyLDEiOiJmaWxsZWQiLCIyLDIiOiJmaWxsZWQiLCIyLDMiOiJmaWxsZWQiLCIxLDMiOiJmaWxsZWQiLCIwLDMiOiJmaWxsZWQiLCIyLDAiOiJmaWxsZWQiLCIxLDAiOiJmaWxsZWQiLCIwLDAiOiJmaWxsZWQiLCIwLDEiOiJmaWxsZWQiLCIxLDEiOiJmaWxsZWQiLCIxLDIiOiJmaWxsZWQiLCIwLDIiOiJmaWxsZWQiLCIxLDQiOiJmaWxsZWQiLCIyLDQiOiJmaWxsZWQiLCIyLDUiOiJmaWxsZWQiLCIyLDYiOiJmaWxsZWQiLCIyLDciOiJmaWxsZWQiLCIxLDciOiJmaWxsZWQiLCIwLDciOiJmaWxsZWQiLCIwLDYiOiJmaWxsZWQiLCIwLDUiOiJmaWxsZWQiLCIxLDUiOiJmaWxsZWQiLCIxLDYiOiJmaWxsZWQiLCIwLDQiOiJmaWxsZWQifSwicmQiOnsiMCw3IjoiY29iYmxlIiwiMCw2IjoiY29iYmxlIiwiMSw2IjoiY29iYmxlIiwiMSw1IjoiY29iYmxlIiwiMSw0IjoiY29iYmxlIiwiMSwzIjoiY29iYmxlIiwiMSwyIjoiY29iYmxlIiwiMSwxIjoiY29iYmxlIiwiMCwxIjoiY29iYmxlIn0sInJ4IjpbIjAsN3wwLDgiLCItMSwxfDAsMSJdfQ",
  "objective": "rival-kings",
  "difficulty": "normal",
  "timeControl": {
    "initialSeconds": 45,
    "incrementSeconds": 0
  },
  "formatVersion": 1
} as unknown) as Level;
