// The selected-level preview column (the Editor's and Campaign screen's 4th column). ONE
// implementation, shared so a level looks identical wherever it is previewed (ADR-0059).
//
// ONE box, with rails instead of gaps. The column used to be a floating heading over three
// separate framed slabs and a loose pair of buttons under them, so the page showed through in
// four places and the name — the only thing saying WHICH level this is — had nothing behind it.
// It is a single divided box now: the name is its top row, every separation is the box's own
// rail, and the verbs are cells of its bottom row rather than controls parked beneath it. The
// divided grid is the primitive for exactly this (ADR-0059) and lays every rail and junction
// from its own grid lines, so nothing here draws a rule of its own.
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { FramedReadOnlyBoardView } from './shared/BoardViewFraming';
import { levelToEditorBoard } from '../core/levelBoard';
import { boardPalettes, LevelInfoCompact, levelBattleDealLine } from './LevelInfoCompact';
import type { Level } from '../core/level';
import { ChromeDividedGridRow, DividedInnerChromeBox } from './shared/ChromeDividedGrid';
import { NavButton } from './shared/NavButton';
import {
  CHROME_LEAF_FILL_SURFACE,
  CHROME_STRUCTURAL_FILL_ROLE,
  leafSurfacePhase,
} from './shared/chromeSurfacePolicy';
import { PieceTypeIcon } from './shared/PieceTypeIcon';
import { STRATEGIKON_CARD_MARK_CLASS, useStrategikonCardsIcon } from './strategikonNavigation';
import { PaintedSurfaceBoundary } from './shell/PaintedSurfaceBoundary';

/**
 * One verb of the column, seated as a CELL of the box's bottom row.
 *
 * Declared, never handed over rendered: a caller that could pass its own markup could wrap the
 * verbs in a box of its own — which is what every call site did, and why they sat outside the
 * frame as a loose pair. Given as data, the column seats each one in a compartment the box's own
 * column line divides, and a caller cannot author the space between them.
 */
export type LevelPreviewVerb = {
  /** Stable identity, so React keeps the cell across selection changes. */
  id: string;
  label: string;
  /** Same-origin app target. Game controls are buttons, never hyperlinks (ADR-0052). */
  to?: string;
  /** Present but unavailable — a locked level's Play. Absent `to` is inert either way. */
  disabled?: boolean;
  title?: string;
};

/**
 * A verb IS its compartment: pressable edge to edge, wearing the leaf oak over the box's marble
 * (ADR-0433), with the box's own frame and rail as its edges. Not a registered unit — that brings
 * its own frame, which would draw a control sitting INSIDE the cell a few pixels in from the rail
 * that already bounds it. Same reset the section box's full-width verbs use.
 */
function VerbCell({ verb, index }: { verb: LevelPreviewVerb; index: number }): ReactElement {
  const className = 'section-box-member-verb ce-preview-verb';
  const seat = {
    className,
    // A row of identical controls is cut from one plank run rather than stamping one grain twice.
    style: leafSurfacePhase(index),
    'data-chrome-fill-surface': CHROME_LEAF_FILL_SURFACE,
    title: verb.title,
  };
  if (verb.to === undefined || verb.disabled) {
    return <button {...seat} type="button" disabled>{verb.label}</button>;
  }
  return <NavButton {...seat} to={verb.to}>{verb.label}</NavButton>;
}

export function LevelPreviewColumn({
  level,
  title,
  embedded = false,
  verbs = [],
  field,
  onPaintedChange,
}: {
  level: Level;
  title: string;
  embedded?: boolean;
  /** The column's verbs, one cell each across the box's bottom row. */
  verbs?: readonly LevelPreviewVerb[];
  /**
   * A control that is not a verb — the Editor's Assign-to-campaign picker. It takes a full-width
   * row of its own under the verbs, because a picker is not one of the compartments they divide.
   */
  field?: ReactNode;
  /** Lets an owning composite keep the whole scene atomic while selection changes. */
  onPaintedChange?: (painted: boolean) => void;
}): ReactElement {
  const board = useMemo(() => levelToEditorBoard(level), [level]);
  const [terrainPainted, setTerrainPainted] = useState(false);
  const [scenePainted, setScenePainted] = useState(false);
  const [frameError, setFrameError] = useState<Error | null>(null);
  const signature = useMemo(() => JSON.stringify(level), [level]);
  useEffect(() => {
    setTerrainPainted(false);
    setScenePainted(false);
    setFrameError(null);
  }, [signature]);
  const allyCount = level.layers.units.filter((unit) => unit.side === 'player').length;
  const enemyCount = level.layers.units.filter((unit) => unit.side === 'enemy').length;
  // What the player brings to a WAR BATTLE is the deal, not a roster: their army arrives from
  // their own collection as cards, so an ally unit count there is a 0 that means nothing. The
  // headline number is how many cards the Battle deals. A Campaign or standalone level fields
  // real allies on the map, and keeps counting them.
  const dealLine = levelBattleDealLine(level);
  // The colours each side wears on the very board beside this line, read from the projection the
  // renderer consumes — so the mark and the piece standing on the map are the same sprite.
  const palettes = boardPalettes(level);
  const cardsIconSrc = useStrategikonCardsIcon();
  const titleId = `level-preview-title-${level.id}`;
  // The box's columns ARE its verbs: one compartment each, so the rail between Edit Board and
  // Test Play is the box's own column line. A column with a single verb declares one column and
  // has no internal line for a rail to be.
  const columns = verbs.length > 1
    ? verbs.map(() => 'minmax(0, 1fr)')
    : ['minmax(0, 1fr)'];
  const resetFrame = (): void => {
    setTerrainPainted(false);
    setScenePainted(false);
    setFrameError(null);
  };

  return (
    <PaintedSurfaceBoundary
      surface={`level-preview:${level.id}`}
      signature={signature}
      readyToCompose={terrainPainted && scenePainted}
      error={frameError}
      loadingLabel="Preparing level preview…"
      onRetry={resetFrame}
      onPaintedChange={onPaintedChange}
    >
      <aside className={embedded ? 'menu-dest-col menu-dest-preview ce-preview-col' : 'ce-editor-preview-col ce-preview-col'} aria-labelledby={titleId}>
        <DividedInnerChromeBox
          className="ce-preview-box"
          columns={columns}
          fillRole={CHROME_STRUCTURAL_FILL_ROLE}
          aria-labelledby={titleId}
        >
          {/* The box's name, across every column: which level this is, is not one of the
              compartments the verbs are split into. */}
          <ChromeDividedGridRow spans="all" className="ce-preview-name">
            <h2 id={titleId}>{title}</h2>
          </ChromeDividedGridRow>

          {/* Each side's mark is the piece the player actually meets on the board, in that side's
              own palette — not a glyph cut out of a mockup — and the card back is the one the
              player deals with. */}
          <ChromeDividedGridRow spans="all" className="ce-preview-forces">
            <div className="ce-force-readout" aria-label="Level forces">
              {dealLine !== null ? (
                <span className="ce-force ce-force-cards"><img className={`ce-force-card ${STRATEGIKON_CARD_MARK_CLASS}`} src={cardsIconSrc} alt="" draggable={false} />Cards <strong>{dealLine}</strong></span>
              ) : (
                <span className="ce-force ce-force-ally"><PieceTypeIcon type="rook" palette={palettes.player} className="ce-force-unit" />Allies <strong>{allyCount}</strong></span>
              )}
              <span className="ce-force ce-force-enemy"><PieceTypeIcon type="rook" palette={palettes.enemy} className="ce-force-unit" />Enemies <strong>{enemyCount}</strong></span>
            </div>
          </ChromeDividedGridRow>

          {/* A compartment, not a plate: the map reaches this box's frame on both sides and its
              rails above and below, the way the level row's thumbnail reaches its box. It carries
              no surface of its own either — the level art floats on the world, and a slab behind
              it would put stone around the board (ADR-0032/0067). */}
          {board ? (
            <ChromeDividedGridRow spans="all" className="ce-preview-board">
              <div className="ce-level-viewer">
                <FramedReadOnlyBoardView
                  board={board}
                  viewKey={level.id}
                  ariaLabel={`${level.name} board`}
                  onTerrainFirstFrame={() => setTerrainPainted(true)}
                  onSceneFirstFrame={() => setScenePainted(true)}
                  onFrameError={(value) => setFrameError(
                    value instanceof Error ? value : new Error(String(value)),
                  )}
                />
              </div>
            </ChromeDividedGridRow>
          ) : null}

          {/* The readout takes no frame of its own — the box's rails are already its edges, and a
              box inside a bounded row would draw the same line twice. */}
          <ChromeDividedGridRow spans="all" className="ce-preview-facts">
            <LevelInfoCompact level={level} framed={false} />
          </ChromeDividedGridRow>

          {verbs.length ? (
            <ChromeDividedGridRow
              className="ce-preview-verbs"
              spans={verbs.length > 1 ? undefined : 'all'}
            >
              {verbs.map((verb, index) => (
                <VerbCell key={verb.id} verb={verb} index={index} />
              ))}
            </ChromeDividedGridRow>
          ) : null}

          {field ? (
            <ChromeDividedGridRow spans="all" className="ce-preview-field">{field}</ChromeDividedGridRow>
          ) : null}
        </DividedInnerChromeBox>
      </aside>
    </PaintedSurfaceBoundary>
  );
}
