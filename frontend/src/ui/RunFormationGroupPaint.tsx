import type { ReactElement } from 'react';
import {
  RUN_CARD_FORMATION_EDGE_LINE,
  RUN_CARD_FORMATION_TILE_POINTS,
  RUN_CARD_FORMATION_TILE_VIEW_BOX,
  type RunCardFormationEdge,
} from './RunCardFace';

const EDGES: readonly RunCardFormationEdge[] = Object.freeze(['north', 'east', 'south', 'west']);

/**
 * Where a neighbouring seat of the SAME formation lies, in the tile's own coordinates: the
 * midpoint of the edge they share. The tether walks centre-to-shared-edge on both squares, so
 * the two halves meet on the boundary and read as one spine rather than two stubs.
 */
const EDGE_MIDPOINT: Readonly<Record<RunCardFormationEdge, readonly [number, number]>> = Object.freeze({
  north: [72, 13.5],
  east: [72, 40.5],
  south: [24, 40.5],
  west: [24, 13.5],
});

const CENTRE = [48, 27] as const;

/**
 * A formation's own boundary, drawn on the board — the one it is carried in and the one it is
 * seated in alike, because since ADR-0533 both are a plan drawn at the same strength and a block
 * that appeared only on release would say the block is made by letting go of it.
 *
 * The card face already prints its units on ONE outlined plot, because a line between two
 * occupied seats reads as a grid rather than as a body. The tile geometry is shared exactly —
 * the card's diagram is the battlefield's projection scaled into card units, and both tiles are
 * 96 by 54 — so the card's own edge lines land on a board square without adaptation.
 *
 * Every candidate treatment is drawn; `data-formation-group` on the host square picks which one
 * is visible, so switching treatments is a repaint rather than a remount and the same crafted
 * board can be compared under each.
 */
export function RunFormationGroupPaint({
  edges,
}: {
  edges: readonly RunCardFormationEdge[];
}): ReactElement {
  const outward = new Set(edges);
  const inward = EDGES.filter((edge) => !outward.has(edge));
  return (
    <svg
      className="run-formation-group-paint"
      viewBox={RUN_CARD_FORMATION_TILE_VIEW_BOX}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* The plot: the ground this formation stands on, as one surface. Drawn per square with no
          edge between siblings, so adjacent seats fuse into a single patch. */}
      <polygon className="run-formation-group-plot" points={RUN_CARD_FORMATION_TILE_POINTS} />
      {/* The spine, for the tether candidate. */}
      {inward.map((edge) => (
        <line
          className="run-formation-group-tether-under"
          key={`tether-under:${edge}`}
          x1={CENTRE[0]} y1={CENTRE[1]}
          x2={EDGE_MIDPOINT[edge][0]} y2={EDGE_MIDPOINT[edge][1]}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {inward.map((edge) => (
        <line
          className="run-formation-group-tether"
          key={`tether:${edge}`}
          x1={CENTRE[0]} y1={CENTRE[1]}
          x2={EDGE_MIDPOINT[edge][0]} y2={EDGE_MIDPOINT[edge][1]}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {inward.length ? (
        <circle className="run-formation-group-node" cx={CENTRE[0]} cy={CENTRE[1]} r={2.4} />
      ) : null}
      {/* The outline, on the sides that face OFF the formation only.
          Two strokes, wide dark under narrow light: the battlefield already draws a dark line on
          every tile edge, so a dark boundary is camouflaged by the grid it is trying to be read
          against, and a light one alone disappears over sand. The pair reads on both. */}
      {[...outward].map((edge) => {
        const [x1, y1, x2, y2] = RUN_CARD_FORMATION_EDGE_LINE[edge];
        return (
          <line
            className="run-formation-group-edge-under"
            key={`under:${edge}`}
            x1={x1} y1={y1} x2={x2} y2={y2}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
      {[...outward].map((edge) => {
        const [x1, y1, x2, y2] = RUN_CARD_FORMATION_EDGE_LINE[edge];
        return (
          <line
            className="run-formation-group-edge"
            key={`edge:${edge}`}
            x1={x1} y1={y1} x2={x2} y2={y2}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}
