import type { ReactElement } from 'react';
import {
  RUN_CARD_FORMATION_EDGE_LINE,
  RUN_CARD_FORMATION_TILE_POINTS,
  RUN_CARD_FORMATION_TILE_VIEW_BOX,
  type RunCardFormationEdge,
} from './RunCardFace';

/**
 * A formation's own plot, drawn on the board — the one it is carried in and the one it is seated
 * in alike, because since ADR-0533 both are a plan drawn at the same strength and a block that
 * appeared only on release would say the block is made by letting go of it.
 *
 * The card face already prints its units on ONE outlined plot, because a line between two
 * occupied seats reads as a grid rather than as a body. The tile geometry is shared exactly —
 * the card's diagram is the battlefield's projection scaled into card units, and both tiles are
 * 96 by 54 — so the card's own edge lines land on a board square without adaptation.
 */
export function RunFormationGroupPaint({
  edges,
}: {
  edges: readonly RunCardFormationEdge[];
}): ReactElement {
  return (
    <svg
      className="run-formation-group-paint"
      viewBox={RUN_CARD_FORMATION_TILE_VIEW_BOX}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {/* The ground this formation stands on, as one surface. Drawn per square with no edge
          between siblings, so adjacent seats fuse into a single patch. */}
      <polygon className="run-formation-group-plot" points={RUN_CARD_FORMATION_TILE_POINTS} />
      {/* The boundary, on the sides that face OFF the formation only.
          Two strokes, wide dark under narrow livery: the battlefield already draws a dark line on
          every tile edge, so a dark boundary is camouflaged by the grid it is trying to be read
          against, and a light one alone disappears over sand. The pair reads on both. */}
      {edges.map((edge) => {
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
      {edges.map((edge) => {
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
