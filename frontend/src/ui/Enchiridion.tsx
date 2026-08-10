import { useCallback, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { legalMoves } from '../core/rules';
import { createBlankLevel } from '../core/level';
import { levelToEditorBoard, unitsForGamePieces } from '../core/levelBoard';
import { PIECE_LABEL, PLAYABLE_PIECE_TYPES, type PlayablePieceType } from '../core/pieces';
import type { BoardSize, Piece, PieceType, Side } from '../core/types';
import { resolvedLiveMediaUrl } from '@chess-tactics/board-render';
import { PredrawnMoveHighlightPaint } from '../render/PredrawnMoveHighlightPaint';
import { runCardArtSlot, runCardName } from '../run/cardNames';
import {
  ATARAXIA_BY_TIER,
  ATARAXIA_TIERS,
  RUN_CARD_BY_ID,
  RUN_CARD_CATALOG,
  RUN_LIPSANA,
  RUN_MANUBIAE,
  cardContentsLabel,
  cardCostGold,
  runCardTierOf,
  runCardTierRank,
  type AtaraxiaTier,
  type ManubiumDefinition,
  type ManubiumId,
  type RunArmyPieceType,
  type RunCardDefinition,
  type RunCardRarity,
  type RunCardTier,
  type LipsanonId,
} from '../run/model';
import {
  EMPTY_RUN_PROGRESSION,
  RUN_PROGRESSION_EVENT,
  highestUnlockedAtaraxiaTier,
  readRunProgression,
  type RunProgression,
} from '../run/progression';
import { generateTerrainDressing } from './generatedReferenceBoard';
import { RunCard } from './RunCard';
import { StaticReadOnlyBoardView } from './shared/BoardViewFraming';
import { AlphaBoundIcon } from './shared/AlphaBoundIcon';
import {
  loadLipsanaStatistics,
  LIPSANA_STATISTICS_EVENT,
  type LipsanaStatistics,
} from '../run/lipsanonStatistics';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import {
  CARD_GOLD_FILTER_VALUES,
  CARD_RARITY_FILTER_VALUES,
  CARD_UNIT_FILTER_VALUES,
  ENCHIRIDION_CARD_FILTERS_ALL,
  ENCHIRIDION_SECTIONS,
  ENCHIRIDION_SECTION_LABEL,
  enchiridionSectionHref,
  type CardGoldFilter,
  type CardRarityFilter,
  type CardUnitFilter,
  type EnchiridionCardFilters,
  type EnchiridionSection,
} from './enchiridionRoute';
import { installedUiMedia } from './installedUiMedia';
import { STRATEGIKON_CARD_MARK_CLASS, useStrategikonCardsIcon } from './strategikonNavigation';
import { LipsanonIcon } from './Lipsana';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { siblingRailAddresses, useOpenRailTab } from './shared/railOpenIntent';
import { useProgressiveMount } from './shared/useProgressiveMount';
import { ataraxiaNumeralArtUrl } from './ataraxiaNumeral';
import { InnerChromeBox, OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';
import { navigateApp } from './navigation';
import { NavButton } from './shared/NavButton';
import { ChromeButton } from './shared/ChromeButton';
import { PieceTypeIcon } from './shared/PieceTypeIcon';
import { RunCardCostCoin, RUN_CARD_COST_COIN_SLOT } from './shared/RunCardCostCoin';
import { RunGoldAmount, RunGoldIcon } from './RunResources';
import {
  RunCardGoldTierDivider,
  runCardTierLabel,
  useRunCardGoldTierDividerSource,
} from './shared/RunCardGoldTierDivider';
import { useRunCardCostCrownSource } from './shared/runCardCostCrown';
import { RUN_PROGRESS_MEDIA_ROLE } from './shared/RunProgressIcon';
import { KitScroll } from './KitScroll';
import { EnchiridionContentSceneSlot } from './shell/AuthoredSceneSlot';
import { CHROME_LEAF_FILL_SURFACE } from './shared/chromeSurfacePolicy';

/**
 * Every section's mark, resolved to installed media. These are the same kit icons the
 * rail used to name as Skirmish-HUD glyph classes; as classes they painted a CSS
 * background under the HUD's sizing rules instead of the rail's, so Terrain (the one
 * section already on installed media) sat a third larger than its five neighbours.
 *
 * Ataraxia is the one section whose idea already owns a mark elsewhere, so it resolves
 * the Run title bar's emblem role rather than naming media of its own. It used to take
 * the shared kit objective flag, which Start, zones and the Skirmish HUD also paint —
 * a second symbol for a ladder that already has one (ADR-0059, ADR-0363).
 */
/**
 * Cards are marked by the back of a card, the same one the Chartulary wears and the same one
 * the Run deals — a hook rather than a constant, because the back follows the player's choice.
 */
function useSectionIconSrc(): Record<EnchiridionSection, string> {
  const cards = useStrategikonCardsIcon();
  return {
    units: installedUiMedia('ui-kit-icons-unit-studio-png'),
    terrain: installedUiMedia('ui-kit-icons-tileset-studio-png'),
    // Manubiae are money, so they wear the Run's own gold coin rather than a second symbol
    // minted for them — the same coin a card's cost is struck on (ADR-0329, ADR-0059).
    manubiae: resolvedLiveMediaUrl(RUN_CARD_COST_COIN_SLOT),
    cards,
    lipsana: installedUiMedia('ui-kit-icons-info-png'),
    ataraxia: installedUiMedia(RUN_PROGRESS_MEDIA_ROLE.ataraxia),
  };
}

const UNIT_COPY: Record<PlayablePieceType, string> = {
  pawn: 'Moves one square forward; from its starting square it may move two. Captures one square diagonally forward.',
  knight: 'Jumps in an L: two squares along one axis and one along the other.',
  bishop: 'Slides any distance along a diagonal until its diagonal path is blocked.',
  rook: 'Slides any distance in a straight orthogonal line until its path is blocked.',
  queen: 'Slides any distance orthogonally or diagonally until its path is blocked.',
  king: 'Moves one square in any direction. Authored Battles may also permit specific castling moves.',
};

// Each example board is sized to its unit's reach: short-range units get a tight board so
// their sprite and marks stay large; sliding units keep the long board that shows their rays.
// `seed` feeds the Generate terrain dressing — per-unit values curated so every card rolls a
// distinct, readable landscape (rerolling a card = changing its seed).
const MOVEMENT_EXAMPLE_LAYOUT: Record<PlayablePieceType, { size: BoardSize; at: { x: number; y: number }; seed: number }> = {
  pawn: { size: { cols: 5, rows: 5 }, at: { x: 2, y: 3 }, seed: 101 },
  knight: { size: { cols: 5, rows: 5 }, at: { x: 2, y: 2 }, seed: 214 },
  bishop: { size: { cols: 7, rows: 7 }, at: { x: 3, y: 3 }, seed: 307 },
  rook: { size: { cols: 7, rows: 7 }, at: { x: 3, y: 3 }, seed: 401 },
  queen: { size: { cols: 7, rows: 7 }, at: { x: 3, y: 3 }, seed: 503 },
  king: { size: { cols: 5, rows: 5 }, at: { x: 2, y: 2 }, seed: 601 },
};

function movementExample(type: PlayablePieceType): {
  size: BoardSize;
  piece: Piece;
  pieces: Piece[];
  moves: Set<string>;
  captures: Set<string>;
} {
  const { size, at } = MOVEMENT_EXAMPLE_LAYOUT[type];
  const piece: Piece = {
    id: `enchiridion-${type}`,
    side: 'player',
    type,
    x: at.x,
    y: at.y,
    alive: true,
    startX: at.x,
    startY: at.y,
    pawnForward: 'north',
    facing: 'north',
  };
  const targets: Piece[] = type === 'pawn'
    ? [
        { id: 'pawn-capture-left', side: 'enemy', type: 'pawn', x: at.x - 1, y: at.y - 1, alive: true, startY: 0 },
        { id: 'pawn-capture-right', side: 'enemy', type: 'pawn', x: at.x + 1, y: at.y - 1, alive: true, startY: 0 },
      ]
    : [];
  const pieces = [piece, ...targets];
  const legal = legalMoves(piece, pieces, size);
  return {
    size,
    piece,
    pieces,
    moves: new Set(legal.map((move) => `${move.x},${move.y}`)),
    captures: new Set(legal.filter((move) => move.capture).map((move) => `${move.x},${move.y}`)),
  };
}

// The real Battle board at reference scale: Generate-dressed ordinary-ground terrain plus
// the example's live pieces, drawn by the same read-only renderer every board surface uses.
// Legal destinations and captures overlay through the game's own diamond cell paint.
function MovementDiagram({ type }: { type: PlayablePieceType }): ReactElement {
  const example = useMemo(() => movementExample(type), [type]);
  const board = useMemo(() => {
    const level = createBlankLevel(`enchiridion-${type}`, PIECE_LABEL[type], example.size.cols, example.size.rows);
    const dressing = generateTerrainDressing({
      cols: example.size.cols,
      rows: example.size.rows,
      seed: MOVEMENT_EXAMPLE_LAYOUT[type].seed,
      // The tactical content — marked squares and every standing piece — stays on calm
      // default grass; the generated accents dress the board around it.
      keepClear: new Set([
        ...example.moves,
        ...example.captures,
        ...example.pieces.map((piece) => `${piece.x},${piece.y}`),
      ]),
    });
    return {
      ...levelToEditorBoard(level),
      ...dressing,
      units: unitsForGamePieces(example.pieces),
    };
  }, [example, type]);
  return (
    <div
      className="enchiridion-unit-board"
      role="img"
      aria-label={`${PIECE_LABEL[type]} legal movement on an open board`}
    >
      <StaticReadOnlyBoardView
        board={board}
        ariaLabel={`${PIECE_LABEL[type]} movement board`}
        renderCellOverlay={(cell) => {
          const key = `${cell.x},${cell.y}`;
          const isCapture = example.captures.has(key);
          const isMove = example.moves.has(key) && !isCapture;
          if (!isMove && !isCapture) return null;
          return (
            <span
              className={`le-tactical-cell ${isCapture ? 'is-threat' : 'is-move'}`}
              aria-hidden="true"
            >
              {isMove ? <PredrawnMoveHighlightPaint /> : null}
            </span>
          );
        }}
      />
    </div>
  );
}

// The one section frame every reference panel wears, in both transports: framed as its
// own titled chrome box on a host that owns no header, unframed under a host that does.
// Exported because the Strategikon's Run-fed sections (the Chartulary) are the same kind
// of panel and must not grow a lookalike frame (ADR-0059).
export function ReferenceSectionFrame({
  children,
  chromeConsumer,
  className = '',
  framed,
  title,
}: {
  children: ReactNode;
  chromeConsumer: string;
  className?: string;
  framed: boolean;
  title: string;
}): ReactElement {
  const panelClassName = `enchiridion-panel ${className}`.trim();
  if (framed) {
    return (
      <OuterChromeBox chromeConsumer={chromeConsumer} titled className={panelClassName}>
        <OuterChromeHeader title={title} />
        {children}
      </OuterChromeBox>
    );
  }
  return (
    <section className={`${panelClassName} enchiridion-panel-unframed`}>
      <h2 className="settings-section-title">{title}</h2>
      {children}
    </section>
  );
}

function UnitsSection({ framed }: { framed: boolean }): ReactElement {
  return (
    <ReferenceSectionFrame
      chromeConsumer="enchiridion-units"
      className="enchiridion-unit-panel"
      framed={framed}
      title="Units"
    >
      <p>Each board is drawn by the Battle renderer and its moves come from the same movement engine. Cyan squares are legal destinations; red squares are captures.</p>
      <KitScroll className="enchiridion-reference-scroll">
        <div className="enchiridion-unit-grid">
          {PLAYABLE_PIECE_TYPES.map((type) => (
            <InnerChromeBox className="enchiridion-unit-card" key={type}>
              <div className="enchiridion-unit-copy">
                <h3>{PIECE_LABEL[type]}</h3>
                <p>{UNIT_COPY[type]}</p>
              </div>
              <MovementDiagram type={type} />
            </InnerChromeBox>
          ))}
        </div>
      </KitScroll>
    </ReferenceSectionFrame>
  );
}

const TERRAIN_FEATURES = [
  {
    label: 'Open ground',
    copy: 'Grass, dirt, stone, roads, bridges, pebbles, and sand permit ordinary movement.',
    icon: 'ic-grid',
  },
  {
    label: 'Water',
    copy: 'A sliding unit may enter water, but its move ends there. A unit already in water leaves normally.',
    icon: 'skirmish-icon skirmish-icon-move',
  },
  {
    label: 'Gaps and blocking terrain',
    copy: 'Cliff, rock, and void cells cannot be occupied. They stop sliding rays at the first blocked diagonal or orthogonal cell.',
    icon: 'skirmish-icon skirmish-icon-shield',
  },
  {
    label: 'Elevation',
    copy: 'A unit may climb one level in a step. Higher rises block entry; descending is unrestricted.',
    icon: 'skirmish-icon skirmish-icon-flag',
  },
  {
    label: 'Fences',
    copy: 'A fence blocks the orthogonal edge it occupies. A diagonal is blocked only when both routes around that corner are closed.',
    icon: 'skirmish-icon skirmish-icon-crossed-swords',
  },
] as const;

/**
 * One Manubium's board: the shape that earns it, standing still.
 *
 * Every entry is a real position on a real board, drawn by the Battle renderer through the
 * same read-only view the Units section uses — not an illustration of a tactic but the tactic
 * itself, arranged. `struck` marks what the move hits, in the game's own threat paint;
 * `opened` marks the line it works along, in the move paint. A player who has seen a legal
 * destination on this board has already learned what both colours mean.
 */
interface ManubiumExample {
  readonly size: BoardSize;
  readonly pieces: readonly Piece[];
  /** Squares the deed strikes — enemy units it attacks or takes. */
  readonly struck: readonly string[];
  /** Squares it works through — an opened line, a square captured onto. */
  readonly opened: readonly string[];
  readonly seed: number;
}

function unit(side: Side, type: PieceType, x: number, y: number): Piece {
  const forward = side === 'player' ? 'north' : 'south';
  return {
    id: `manubiae-${side}-${type}-${x}-${y}`,
    side,
    type,
    x,
    y,
    alive: true,
    startX: x,
    startY: y,
    facing: forward,
    ...(type === 'pawn' ? { pawnForward: forward } : {}),
  };
}

// Player units stand toward the bottom of each board and enemies toward the top, the way a
// Battle is laid out, so a reader recognizes the sides before reading a word.
const MANUBIUM_EXAMPLE: Readonly<Record<ManubiumId, ManubiumExample>> = {
  'advantageous-capture': {
    size: { cols: 5, rows: 5 },
    pieces: [unit('player', 'knight', 1, 3), unit('enemy', 'rook', 2, 1)],
    struck: ['2,1'],
    opened: [],
    seed: 811,
  },
  'royal-fork': {
    size: { cols: 5, rows: 5 },
    pieces: [unit('player', 'knight', 2, 2), unit('enemy', 'king', 3, 0), unit('enemy', 'rook', 1, 0)],
    struck: ['3,0', '1,0'],
    opened: [],
    seed: 822,
  },
  'long-capture': {
    // The only diagrams in this section that are not five squares square, because the deed does
    // not fit on a board that size: eight squares of reach needs nine of board. The whole lane
    // the Rook crossed is marked, so the distance is the picture rather than a number in the copy.
    size: { cols: 9, rows: 5 },
    pieces: [unit('player', 'rook', 0, 2), unit('enemy', 'bishop', 8, 2)],
    struck: ['8,2'],
    opened: ['1,2', '2,2', '3,2', '4,2', '5,2', '6,2', '7,2'],
    seed: 911,
  },
  'humble-mate': {
    // A PAWN's mate, drawn because it is the top of this ladder and the least likely thing a
    // player will ever see. Four of the King's own men seal it in; the fifth square is held by
    // the Pawn giving the mate, which the second Pawn defends so the King cannot simply take it.
    size: { cols: 5, rows: 5 },
    pieces: [
      unit('player', 'pawn', 2, 1),
      unit('player', 'pawn', 1, 2),
      unit('enemy', 'king', 1, 0),
      unit('enemy', 'rook', 0, 0),
      unit('enemy', 'knight', 2, 0),
      unit('enemy', 'pawn', 0, 1),
      unit('enemy', 'pawn', 1, 1),
    ],
    struck: ['1,0'],
    opened: ['2,2'],
    seed: 899,
  },
  'discovered-check': {
    // The Bishop has just stepped off the file to the corner, and the Rook behind it now runs
    // all the way to the King. The open squares between them are the discovery.
    size: { cols: 5, rows: 5 },
    pieces: [unit('player', 'rook', 2, 4), unit('player', 'bishop', 4, 4), unit('enemy', 'king', 2, 0)],
    struck: ['2,0'],
    opened: ['2,3', '2,2', '2,1'],
    seed: 833,
  },
  'long-check': {
    // The long diagonal of a nine-square board, corner to corner: the Bishop stands at one end
    // and the King is in check at the other, eight squares away with nothing in between.
    size: { cols: 9, rows: 9 },
    pieces: [unit('player', 'bishop', 0, 8), unit('enemy', 'king', 8, 0)],
    struck: ['8,0'],
    opened: ['1,7', '2,6', '3,5', '4,4', '5,3', '6,2', '7,1'],
    seed: 922,
  },
  'double-check': {
    // The same open file, and a Knight that strikes the King as well. Two attackers at once:
    // no block and no capture answers both, so the King has to move.
    size: { cols: 5, rows: 5 },
    pieces: [unit('player', 'rook', 2, 4), unit('player', 'knight', 1, 2), unit('enemy', 'king', 2, 0)],
    struck: ['2,0'],
    opened: ['2,3', '2,1'],
    seed: 844,
  },
  'en-passant': {
    // The enemy Pawn has just stepped two squares past. The marked empty square is the one it
    // stepped over, and the one the capturing Pawn lands on.
    size: { cols: 5, rows: 5 },
    pieces: [unit('player', 'pawn', 2, 3), unit('enemy', 'pawn', 3, 3)],
    struck: ['3,3'],
    opened: ['3,2'],
    seed: 855,
  },
  'smothered-mate': {
    size: { cols: 5, rows: 5 },
    pieces: [
      unit('player', 'knight', 2, 1),
      unit('enemy', 'king', 4, 0),
      unit('enemy', 'rook', 3, 0),
      unit('enemy', 'pawn', 4, 1),
      unit('enemy', 'pawn', 3, 1),
    ],
    struck: ['4,0'],
    opened: [],
    seed: 866,
  },
  'promotion-mate': {
    // The Pawn has just arrived on the top rank and become a Queen. The marked empty square
    // below her is the one it stepped off; the King is sealed against the edge by its own Pawns
    // and there is nothing on the rank to block her.
    size: { cols: 5, rows: 5 },
    pieces: [
      unit('player', 'queen', 4, 0),
      unit('enemy', 'king', 0, 0),
      unit('enemy', 'pawn', 0, 1),
      unit('enemy', 'pawn', 1, 1),
    ],
    struck: ['0,0'],
    opened: ['4,1'],
    seed: 877,
  },
  'underpromotion-mate': {
    // The Knight case, drawn because it is the only one a position can require: a QUEEN on this
    // same square would not even be giving check. The King's other flights are answered — two by
    // its own men, one by the Knight, one by the second Pawn coming up behind.
    size: { cols: 5, rows: 5 },
    pieces: [
      unit('player', 'knight', 2, 0),
      unit('player', 'pawn', 1, 3),
      unit('enemy', 'king', 0, 1),
      unit('enemy', 'bishop', 0, 0),
      unit('enemy', 'pawn', 1, 0),
      unit('enemy', 'pawn', 1, 1),
    ],
    struck: ['0,1'],
    opened: ['2,1'],
    seed: 888,
  },
};

function ManubiumDiagram({ id, name }: { id: ManubiumId; name: string }): ReactElement {
  const example = MANUBIUM_EXAMPLE[id];
  const board = useMemo(() => {
    const level = createBlankLevel(`enchiridion-${id}`, name, example.size.cols, example.size.rows);
    const dressing = generateTerrainDressing({
      cols: example.size.cols,
      rows: example.size.rows,
      seed: example.seed,
      // The tactical content stays on calm default grass so the marks and the pieces read;
      // the generated accents dress the board around it, exactly as the Units section does.
      keepClear: new Set([
        ...example.struck,
        ...example.opened,
        ...example.pieces.map((piece) => `${piece.x},${piece.y}`),
      ]),
    });
    return {
      ...levelToEditorBoard(level),
      ...dressing,
      units: unitsForGamePieces(example.pieces),
    };
  }, [example, id, name]);
  return (
    <div className="enchiridion-unit-board" role="img" aria-label={`${name} on an example board`}>
      <StaticReadOnlyBoardView
        board={board}
        ariaLabel={`${name} board`}
        renderCellOverlay={(cell) => {
          const key = `${cell.x},${cell.y}`;
          const isStruck = example.struck.includes(key);
          const isOpen = example.opened.includes(key) && !isStruck;
          if (!isStruck && !isOpen) return null;
          return (
            <span className={`le-tactical-cell ${isStruck ? 'is-threat' : 'is-move'}`} aria-hidden="true">
              {isOpen ? <PredrawnMoveHighlightPaint /> : null}
            </span>
          );
        }}
      />
    </div>
  );
}

/**
 * What one Manubium is worth, in the same gold vocabulary every other Run surface uses —
 * through the shared amount, so a price here is drawn exactly like a price anywhere else
 * (ADR-0059). The one scaled entry has a rate rather than a number, so it wears the mark
 * beside its own words instead.
 */
function ManubiumPrice({ entry }: { entry: ManubiumDefinition }): ReactElement {
  if (entry.goldTenths === null) {
    return (
      <p className="enchiridion-manubium-price">
        <RunGoldIcon />
        <span>{entry.priceNote}</span>
      </p>
    );
  }
  return (
    <p className="enchiridion-manubium-price">
      <RunGoldAmount valueTenths={entry.goldTenths} />
    </p>
  );
}

/**
 * Manubiae — the things the board itself pays for.
 *
 * Ordered cheapest first, which is also roughly most-often-first, so the section reads as the
 * ladder it is: the deed a competent player lands several times a Battle sits at the top, and
 * the one they may never land sits at the bottom.
 */
function ManubiaeSection({ framed }: { framed: boolean }): ReactElement {
  return (
    <ReferenceSectionFrame
      chromeConsumer="enchiridion-manubiae"
      className="enchiridion-manubiae-panel"
      framed={framed}
      title="Manubiae"
    >
      <p>Gold a Battle pays for what your units do, the moment they do it — over and above the Battle&rsquo;s own reward. Red squares are what the move strikes; cyan squares are the line it works along.</p>
      <KitScroll className="enchiridion-reference-scroll">
        <div className="enchiridion-unit-grid">
          {RUN_MANUBIAE.map((entry) => (
            <InnerChromeBox className="enchiridion-unit-card" key={entry.id}>
              <div className="enchiridion-unit-copy">
                <h3>{entry.name}</h3>
                <ManubiumPrice entry={entry} />
                <p>{entry.earnedBy}</p>
              </div>
              <ManubiumDiagram id={entry.id} name={entry.name} />
            </InnerChromeBox>
          ))}
        </div>
      </KitScroll>
      <InnerChromeBox className="enchiridion-rule-exceptions">
        <h3>How they add up</h3>
        <p>Only <strong>your</strong> units earn these — the enemy does the same things and is paid nothing — and each one pays again every time you land it.</p>
        <p>One move may earn <strong>several</strong> at once, and each pays in full: a capture that also forks is both, and a promotion that mates is paid alongside the check it discovered.</p>
        <p>The two checks are one ladder, because every double check <em>is</em> a discovered check — uncovering the second attacker is the only way to give check with two units at once. The better rung pays and the other stands down: a double check pays <strong>30</strong> in place of the discovered check&rsquo;s 20, never 50 for the same check.</p>
        <p><strong>The mate pays once.</strong> Every Battle ends in checkmate, and four of these describe one — what the mating unit is worth, what the King&rsquo;s own men were doing around it, and whether that unit arrived by promoting. A smothered mate <em>is</em> a Knight&rsquo;s mate and an underpromotion mate <em>is</em> a mate by the lesser piece you chose, so they are rungs of one ladder too. The dearest that fits your mate is the one you are paid.</p>
        <p><strong>Undo</strong> takes back the gold along with the move that earned it, so no deed here is worth undoing for profit.</p>
      </InnerChromeBox>
    </ReferenceSectionFrame>
  );
}

function TerrainSection({ framed }: { framed: boolean }): ReactElement {
  return (
    <ReferenceSectionFrame
      chromeConsumer="enchiridion-terrain"
      className="enchiridion-terrain-panel"
      framed={framed}
      title="Terrain"
    >
      <KitScroll className="enchiridion-reference-scroll">
        <div className="enchiridion-terrain-list">
          {TERRAIN_FEATURES.map((feature) => (
            <InnerChromeBox className="enchiridion-terrain-row" key={feature.label}>
              <span className={feature.icon} aria-hidden="true" />
              <span>
                <h3>{feature.label}</h3>
                <p>{feature.copy}</p>
              </span>
            </InnerChromeBox>
          ))}
        </div>
      </KitScroll>
      <InnerChromeBox className="enchiridion-rule-exceptions">
        <h3>Path exceptions</h3>
        <p><strong>Knights</strong> jump over gaps, fences, and intervening obstacles. Only the landing square must be legal.</p>
        <p><strong>Bishops</strong> inspect the diagonal they actually travel. Obstacles on neighboring non-diagonal tiles are ignored; a blocker on the diagonal itself still ends the path.</p>
      </InnerChromeBox>
    </ReferenceSectionFrame>
  );
}

function statisticFor(statistics: LipsanaStatistics, lipsanonId: LipsanonId) {
  return statistics[lipsanonId] ?? { timesPicked: 0, battlesWonWhileHeld: 0 };
}

type LipsanonBrowseMode = 'rows' | 'grouped';

// One reference entry control in two transports (ADR-0256): a host that gives records
// addresses (lipsana, cards) renders a NavButton whose route is the record's address
// (ADR-0052 — the route is kept updated, never a hoverable link); a host with ephemeral
// reference selection (the Battle-hosted Strategikon) keeps a plain selection button.
function ReferenceTrigger({ to, onSelect, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  to?: string;
  onSelect: () => void;
}): ReactElement {
  if (to) return <NavButton to={to} {...props}>{children}</NavButton>;
  return <button type="button" onClick={onSelect} {...props}>{children}</button>;
}

export function LipsanaCodex({
  lipsanonIds = RUN_LIPSANA.map((lipsanon) => lipsanon.id),
  title = 'Lipsana',
  showStatistics = true,
  framed = true,
  selectedLipsanonId = null,
  lipsanonHref,
}: {
  lipsanonIds?: readonly LipsanonId[];
  title?: string;
  showStatistics?: boolean;
  framed?: boolean;
  /** The route-addressed lipsanon; read only when lipsanonHref makes selection navigational. */
  selectedLipsanonId?: LipsanonId | null;
  /** When present, lipsanon selection navigates to this address instead of setting local state. */
  lipsanonHref?: (lipsanonId: LipsanonId) => string;
}): ReactElement {
  const [localSelectedId, setLocalSelectedId] = useState<LipsanonId>(lipsanonIds[0] ?? RUN_LIPSANA[0].id);
  // Routed hosts derive the selection from the address every render; an unknown or
  // absent lipsanon address falls back to the first visible lipsanon without rewriting the URL.
  const selectedId = lipsanonHref ? (selectedLipsanonId ?? lipsanonIds[0] ?? RUN_LIPSANA[0].id) : localSelectedId;
  const [browseMode, setBrowseMode] = useState<LipsanonBrowseMode>('rows');
  const [statistics, setStatistics] = useState<LipsanaStatistics>({});
  const [statisticsStatus, setStatisticsStatus] = useState<'loading' | 'account' | 'browser'>('loading');
  const browsePanelId = useId();
  const visibleLipsana = RUN_LIPSANA.filter((lipsanon) => lipsanonIds.includes(lipsanon.id));
  const selected = RUN_LIPSANA.find((lipsanon) => lipsanon.id === selectedId)
    ?? visibleLipsana[0]
    ?? RUN_LIPSANA[0];

  useEffect(() => {
    if (lipsanonHref) return;
    if (!lipsanonIds.includes(localSelectedId) && lipsanonIds[0]) setLocalSelectedId(lipsanonIds[0]);
  }, [lipsanonHref, lipsanonIds, localSelectedId]);

  useEffect(() => {
    if (!showStatistics) return undefined;
    let active = true;
    const refresh = () => {
      void loadLipsanaStatistics().then((result) => {
        if (!active) return;
        setStatistics(result.statistics);
        setStatisticsStatus(result.accountBacked ? 'account' : 'browser');
      });
    };
    refresh();
    window.addEventListener(LIPSANA_STATISTICS_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(LIPSANA_STATISTICS_EVENT, refresh);
    };
  }, [showStatistics]);

  const selectedStatistic = statisticFor(statistics, selected.id);
  return (
    <ReferenceSectionFrame
      chromeConsumer="enchiridion-lipsana"
      className="enchiridion-lipsanon-panel"
      framed={framed}
      title={title}
    >
      {lipsanonIds.length ? (
        <div className="enchiridion-lipsanon-layout">
          <div className="enchiridion-lipsanon-browser">
            <div className="le-seg enchiridion-lipsanon-view-tabs" role="tablist" aria-label="Lipsanon browsing layout">
              <ChromeButton unit="inner-text-button"
                data-testid="lipsanon-view-rows"
                role="tab"
                aria-controls={browsePanelId}
                aria-selected={browseMode === 'rows'}
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', browseMode === 'rows' && 'active')}
                onClick={() => setBrowseMode('rows')}
              >
                Rows
              </ChromeButton>
              <ChromeButton unit="inner-text-button"
                data-testid="lipsanon-view-grouped"
                role="tab"
                aria-controls={browsePanelId}
                aria-selected={browseMode === 'grouped'}
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', browseMode === 'grouped' && 'active')}
                onClick={() => setBrowseMode('grouped')}
              >
                Grouped
              </ChromeButton>
            </div>
            <div
              id={browsePanelId}
              className={`enchiridion-lipsanon-browse-panel is-${browseMode}`}
              role="tabpanel"
              aria-label={`${browseMode === 'rows' ? 'Rows' : 'Grouped'} lipsanon view`}
            >
              <KitScroll className="enchiridion-lipsanon-scroll">
                {browseMode === 'rows' ? (
                  <ul className="enchiridion-lipsanon-rows" aria-label={title}>
                    {visibleLipsana.map((lipsanon) => (
                      <li key={lipsanon.id}>
                        <ReferenceTrigger
                          to={lipsanonHref?.(lipsanon.id)}
                          onSelect={() => setLocalSelectedId(lipsanon.id)}
                          data-chrome-unit="inner-list-row"
                          className={chromeUnitClassNames(
                            'inner-list-row',
                            'enchiridion-lipsanon-row',
                            selected.id === lipsanon.id && 'is-active',
                          )}
                          aria-label={`${lipsanon.name}. ${lipsanon.description}`}
                          aria-pressed={selected.id === lipsanon.id}
                        >
                          <LipsanonIcon lipsanonId={lipsanon.id} className="enchiridion-lipsanon-row-icon" />
                          <span className="enchiridion-lipsanon-row-name">{lipsanon.name}</span>
                        </ReferenceTrigger>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <InnerChromeBox className="enchiridion-lipsanon-group">
                    <ul className="enchiridion-lipsanon-group-grid" aria-label={title}>
                      {visibleLipsana.map((lipsanon) => (
                        <li key={lipsanon.id}>
                          <ReferenceTrigger
                            to={lipsanonHref?.(lipsanon.id)}
                            onSelect={() => setLocalSelectedId(lipsanon.id)}
                            className={`enchiridion-lipsanon-grouped-trigger${selected.id === lipsanon.id ? ' is-active' : ''}`}
                            aria-label={`${lipsanon.name}. ${lipsanon.description}`}
                            aria-pressed={selected.id === lipsanon.id}
                          >
                            <LipsanonIcon lipsanonId={lipsanon.id} />
                          </ReferenceTrigger>
                        </li>
                      ))}
                    </ul>
                  </InnerChromeBox>
                )}
              </KitScroll>
            </div>
          </div>
          <InnerChromeBox className="enchiridion-lipsanon-detail">
            <LipsanonIcon lipsanonId={selected.id} />
            <div>
              <h3>{selected.name}</h3>
              <p>{selected.description}</p>
            </div>
            {showStatistics ? (
              <dl>
                <div><dt>Times picked</dt><dd>{selectedStatistic.timesPicked}</dd></div>
                <div><dt>Battles won while held</dt><dd>{selectedStatistic.battlesWonWhileHeld}</dd></div>
              </dl>
            ) : null}
            {showStatistics ? (
              <small>{statisticsStatus === 'loading' ? 'Loading history…' : statisticsStatus === 'account' ? 'Account history' : 'This browser'}</small>
            ) : null}
          </InnerChromeBox>
        </div>
      ) : (
        <InnerChromeBox className="enchiridion-empty">
          <h3>No lipsana held</h3>
          <p>This Lipsanotheca is presently, and perhaps suspiciously, empty.</p>
        </InnerChromeBox>
      )}
    </ReferenceSectionFrame>
  );
}

// The filter vocabulary is the address vocabulary; these controls only present it. Options are
// built from the same value lists the route module validates a query against, so a filter the
// gallery can show and a filter an address can carry cannot drift apart.
export type {
  CardGoldFilter,
  CardRarityFilter,
  CardUnitFilter,
  EnchiridionCardFilters,
} from './enchiridionRoute';

const CARD_GOLD_FILTER_OPTIONS: readonly HouseSelectOption<CardGoldFilter>[] = Object.freeze([
  { value: 'all', label: 'All' },
  ...CARD_GOLD_FILTER_VALUES.map((value) => ({
    value: value as Exclude<CardGoldFilter, 'all'>,
    label: <RunCardCostCoin value={Number(value)} className="enchiridion-card-filter-gold-amount" />,
  })),
]);

const CARD_UNIT_FILTER_OPTIONS: readonly HouseSelectOption<CardUnitFilter>[] = Object.freeze([
  { value: 'all', label: 'Any unit' },
  ...CARD_UNIT_FILTER_VALUES.map((value) => ({
    value,
    label: (
      <span className="enchiridion-card-filter-unit-label">
        <PieceTypeIcon type={value} className="enchiridion-card-filter-unit-icon" />
        <span>{PIECE_LABEL[value]}</span>
      </span>
    ),
  })),
]);

const CARD_RARITY_FILTER_OPTIONS: readonly HouseSelectOption<CardRarityFilter>[] = Object.freeze([
  { value: 'all', label: 'All rarities' },
  ...CARD_RARITY_FILTER_VALUES.map((value) => ({
    value,
    label: `${value[0].toUpperCase()}${value.slice(1)}`,
  })),
]);

export function cardMatchesFilters(
  card: RunCardDefinition,
  goldFilter: CardGoldFilter,
  unitFilter: CardUnitFilter,
  rarityFilter: CardRarityFilter,
): boolean {
  return (goldFilter === 'all' || cardCostGold(card.value) === Number(goldFilter))
    && (unitFilter === 'all' || card.pieces.some((piece) => piece === unitFilter))
    && (rarityFilter === 'all' || card.rarity === rarityFilter);
}

// The card gallery's filter row, shared by the whole-catalog reference and the Run's held
// Chartulary. One control row governs both, so the two galleries cannot drift into
// lookalike filters with different options or different compact amounts (ADR-0059).
export function CardGalleryFilters({
  goldFilter,
  unitFilter,
  rarityFilter,
  onGoldFilterChange,
  onUnitFilterChange,
  onRarityFilterChange,
  count,
  testIdPrefix,
}: {
  goldFilter: CardGoldFilter;
  unitFilter: CardUnitFilter;
  rarityFilter: CardRarityFilter;
  onGoldFilterChange: (filter: CardGoldFilter) => void;
  onUnitFilterChange: (filter: CardUnitFilter) => void;
  onRarityFilterChange: (filter: CardRarityFilter) => void;
  count: number;
  testIdPrefix: string;
}): ReactElement {
  return (
    <InnerChromeBox className="enchiridion-card-filters" fillRole="outer" aria-label="Card filters">
      <div
        className="enchiridion-card-filter"
        style={{ ['--enchiridion-card-filter-index' as string]: 0 } as CSSProperties}
      >
        <span>Gold</span>
        <HouseSelect
          value={goldFilter}
          options={CARD_GOLD_FILTER_OPTIONS}
          onChange={onGoldFilterChange}
          ariaLabel="Filter cards by gold value"
          testId={`${testIdPrefix}-gold-filter`}
          fillSurface={CHROME_LEAF_FILL_SURFACE}
        />
      </div>
      <div
        className="enchiridion-card-filter"
        style={{ ['--enchiridion-card-filter-index' as string]: 1 } as CSSProperties}
      >
        <span>Contains</span>
        <HouseSelect
          value={unitFilter}
          options={CARD_UNIT_FILTER_OPTIONS}
          onChange={onUnitFilterChange}
          ariaLabel="Filter cards by contained unit type"
          testId={`${testIdPrefix}-unit-filter`}
          fillSurface={CHROME_LEAF_FILL_SURFACE}
        />
      </div>
      <div
        className="enchiridion-card-filter"
        style={{ ['--enchiridion-card-filter-index' as string]: 2 } as CSSProperties}
      >
        <span>Rarity</span>
        <HouseSelect
          value={rarityFilter}
          options={CARD_RARITY_FILTER_OPTIONS}
          onChange={onRarityFilterChange}
          ariaLabel="Filter cards by rarity"
          testId={`${testIdPrefix}-rarity-filter`}
          fillSurface={CHROME_LEAF_FILL_SURFACE}
        />
      </div>
      <span className="enchiridion-card-filter-count" aria-live="polite">
        {count} {count === 1 ? 'card' : 'cards'}
      </span>
    </InnerChromeBox>
  );
}

/**
 * Bands a gallery for display. Starter cards band on their own ahead of the priced ones:
 * His Grace is worth 20 gold on paper but can never be bought, so filing it under "20 gold"
 * sat it among cards a player could actually pay that for (ADR-0414).
 */
export function cardsByTier<T>(
  entries: readonly T[],
  coreOf: (entry: T) => RunCardDefinition,
): Array<[RunCardTier, T[]]> {
  const byTier = new Map<RunCardTier, T[]>();
  for (const entry of entries) {
    const tier = runCardTierOf(coreOf(entry));
    byTier.set(tier, [...(byTier.get(tier) ?? []), entry]);
  }
  return [...byTier.entries()]
    .sort((left, right) => runCardTierRank(left[0]) - runCardTierRank(right[0]));
}

// Cards is the terminal third-column browser: the two rail predecessors retain
// their canonical widths and every remaining pixel belongs to a gallery of the
// real faces themselves. Routes focus a face in that gallery; they never create
// a duplicate fourth-column detail (ADR-0364).
export function CardCodex({
  framed = true,
  selectedCardId = null,
  cardHref,
  filters = null,
  filtersHref,
}: {
  framed?: boolean;
  /** The route-addressed gallery face; read only when cardHref makes focus navigational. */
  selectedCardId?: string | null;
  /** When present, focusing a card navigates to this address instead of setting local state. */
  cardHref?: (cardId: string) => string;
  /** The route-addressed filters; read only when filtersHref makes filtering navigational. */
  filters?: EnchiridionCardFilters | null;
  /** When present, changing a filter navigates to this address instead of setting local state. */
  filtersHref?: (filters: EnchiridionCardFilters) => string;
}): ReactElement {
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const [localFilters, setLocalFilters] = useState<EnchiridionCardFilters>(ENCHIRIDION_CARD_FILTERS_ALL);
  const goldTierDividerSource = useRunCardGoldTierDividerSource();
  // The band coin and every card face read one mark, so a candidate under review is judged on
  // both seats at once rather than on a card that disagrees with the band above it.
  const { url: crownUrl } = useRunCardCostCrownSource();
  const focusedCardId = cardHref ? selectedCardId : localSelectedId;
  // Routed hosts derive the filters from the address every render, the same way focus is derived
  // from it; an absent or unreadable query is no filter at all and never rewrites the URL.
  const { gold: goldFilter, unit: unitFilter, rarity: rarityFilter } = filtersHref
    ? (filters ?? ENCHIRIDION_CARD_FILTERS_ALL)
    : localFilters;
  const changeFilters = (next: EnchiridionCardFilters): void => {
    if (filtersHref) navigateApp(filtersHref(next));
    else setLocalFilters(next);
  };
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const visibleCards = useMemo(
    () => RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, goldFilter, unitFilter, rarityFilter)),
    [goldFilter, rarityFilter, unitFilter],
  );
  // The catalog arrives in pieces so the app is never blocked building it (useProgressiveMount).
  // Tier order is unaffected: cardsByTier sorts its groups by rank, so a partly-filled catalog is
  // the same catalog with its tail missing, not a reordered one.
  const mountedCount = useProgressiveMount(
    visibleCards.length,
    `${goldFilter}|${unitFilter}|${rarityFilter}`,
  );
  const groups = useMemo(
    () => cardsByTier(visibleCards.slice(0, mountedCount), (card) => card),
    [visibleCards, mountedCount],
  );
  useEffect(() => {
    if (!focusedCardId) return;
    const card = galleryRef.current?.querySelector<HTMLElement>(`[data-card-id="${focusedCardId}"]`);
    // An addressed card deeper in the catalog is not on the page yet; mountedCount is a dep, so
    // this runs again on each batch and scrolls to it the moment it arrives.
    if (!card) return;
    const frame = window.requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusedCardId, visibleCards, mountedCount]);
  return (
    <ReferenceSectionFrame
      chromeConsumer="enchiridion-cards"
      className="enchiridion-card-panel"
      framed={framed}
      title="Cards"
    >
      <p>Every card the Run can deal. Starter cards begin in the Chartulary; the rest may be offered by Sectio.</p>
      <div className="enchiridion-card-gallery-layout">
        <CardGalleryFilters
          goldFilter={goldFilter}
          unitFilter={unitFilter}
          rarityFilter={rarityFilter}
          onGoldFilterChange={(gold) => changeFilters({ gold, unit: unitFilter, rarity: rarityFilter })}
          onUnitFilterChange={(unit) => changeFilters({ gold: goldFilter, unit, rarity: rarityFilter })}
          onRarityFilterChange={(rarity) => changeFilters({ gold: goldFilter, unit: unitFilter, rarity })}
          count={visibleCards.length}
          testIdPrefix="enchiridion-card"
        />
        <KitScroll className="enchiridion-card-gallery-scroll">
          <div
            ref={galleryRef}
            className="enchiridion-card-gallery-browser"
            role="list"
            aria-label="Filtered card catalog by tier"
          >
            {groups.map(([value, cards]) => (
              <section className="enchiridion-card-gallery-group" key={value} aria-label={runCardTierLabel(value)}>
                <h3 className="enchiridion-card-gallery-heading">
                  <RunCardGoldTierDivider value={value} source={goldTierDividerSource} crownUrl={crownUrl} />
                </h3>
                <div className="enchiridion-card-gallery-grid">
                  {cards.map((card) => {
                    const focused = focusedCardId === card.id;
                    return (
                      <div className="enchiridion-card-gallery-item" role="listitem" data-card-id={card.id} key={card.id}>
                        <ReferenceTrigger
                          to={cardHref?.(card.id)}
                          onSelect={() => setLocalSelectedId(card.id)}
                          data-ui-sfx="card"
                          className="enchiridion-card-gallery-trigger"
                          aria-label={`${runCardName(card)}. ${cardContentsLabel(card)}. Worth ${cardCostGold(card.value)} gold.`}
                          aria-pressed={focused}
                          aria-current={focused ? 'true' : undefined}
                        >
                          <RunCard card={card} mode="reference" crownUrl={crownUrl} />
                        </ReferenceTrigger>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
            {!groups.length ? (
              <InnerChromeBox className="enchiridion-empty">
                <h3>No matching cards</h3>
                <p>No card has all of the selected properties.</p>
              </InnerChromeBox>
            ) : null}
          </div>
        </KitScroll>
      </div>
    </ReferenceSectionFrame>
  );
}

/**
 * Optional Run difficulty as a reference record (ADR-0266, ADR-0268, ADR-0291). Every
 * installed tier presents the one anatomy the selector presents — numbered label,
 * subtitle, literal impact — read from the same `ATARAXIA_BY_TIER` the Run reads, so the
 * Enchiridion cannot describe a condition the Run does not apply. Tier zero is a member
 * of the ladder here exactly as it is there, with no special rendering branch.
 *
 * A row is its rung and its descriptive name: the numeral takes the mark seat every other
 * reference section fills with a glyph, because a numbered rung of one ladder has nothing
 * for a repeated section glyph to distinguish. The ladder is linear, so a tier's standing
 * is the only thing this record adds beyond the selector: locked tiers state the
 * completion that opens them rather than hiding.
 */
function AtaraxiaSection({ framed }: { framed: boolean }): ReactElement {
  const [progression, setProgression] = useState<RunProgression>(EMPTY_RUN_PROGRESSION);

  useEffect(() => {
    const refresh = () => setProgression(readRunProgression());
    refresh();
    window.addEventListener(RUN_PROGRESSION_EVENT, refresh);
    return () => window.removeEventListener(RUN_PROGRESSION_EVENT, refresh);
  }, []);

  const unlockedThrough = highestUnlockedAtaraxiaTier(progression);
  const completedThrough = progression.highestCompletedAtaraxiaTier;
  // One catalog read for the whole list rather than a prefix scan per row.
  const artUrl = useMemo(() => {
    const byNumeral = new Map(ATARAXIA_TIERS.map((tier) => {
      const { numeral } = ATARAXIA_BY_TIER[tier];
      return [numeral, ataraxiaNumeralArtUrl(numeral)] as const;
    }));
    return (numeral: string) => byNumeral.get(numeral) ?? null;
  }, []);
  return (
    <ReferenceSectionFrame
      chromeConsumer="enchiridion-ataraxia"
      className="enchiridion-ataraxia-panel"
      framed={framed}
      title="Ataraxia"
    >
      <p>Optional Run difficulty, named after real history. The ladder is linear and cumulative: completing the highest tier available to you unlocks exactly the next one, and selecting a tier applies the conditions of every tier up to and including it.</p>
      <KitScroll className="enchiridion-reference-scroll">
        <div className="enchiridion-ataraxia-list">
          {ATARAXIA_TIERS.map((tier) => {
            const definition = ATARAXIA_BY_TIER[tier];
            const locked = tier > unlockedThrough;
            const standing = locked
              ? `Locked — complete ${ATARAXIA_BY_TIER[(tier - 1) as AtaraxiaTier].label} to unlock`
              : tier <= completedThrough ? 'Completed' : 'Unlocked';
            return (
              <InnerChromeBox
                className={`enchiridion-ataraxia-card${locked ? ' is-locked' : ''}`}
                key={tier}
              >
                {artUrl(definition.numeral) ? (
                  <img
                    className="enchiridion-ataraxia-numeral is-art"
                    src={artUrl(definition.numeral) ?? undefined}
                    alt={definition.numeral}
                    draggable={false}
                  />
                ) : (
                  <span className="enchiridion-ataraxia-numeral">{definition.numeral}</span>
                )}
                <span>
                  <h3>{definition.title}</h3>
                  <p>{definition.effect}</p>
                  <small className="enchiridion-ataraxia-standing">{standing}</small>
                </span>
              </InnerChromeBox>
            );
          })}
        </div>
      </KitScroll>
    </ReferenceSectionFrame>
  );
}

/**
 * The reference body for one section, with no rail and no scene slot of its own.
 * The Strategikon mounts this directly inside ITS reference slot: embedding the
 * whole `Enchiridion` would nest a second `enchiridion-shell` region inside the
 * Strategikon's, giving one visual pane two competing director-owned targets.
 */
export function EnchiridionReference({
  section,
  framed,
  selectedLipsanonId,
  lipsanonHref,
  selectedCardId,
  cardHref,
  cardFilters,
  cardFiltersHref,
}: {
  section: EnchiridionSection;
  framed: boolean;
  selectedLipsanonId: LipsanonId | null;
  lipsanonHref?: (lipsanonId: LipsanonId) => string;
  selectedCardId: string | null;
  cardHref?: (cardId: string) => string;
  cardFilters?: EnchiridionCardFilters | null;
  cardFiltersHref?: (filters: EnchiridionCardFilters) => string;
}): ReactElement {
  if (section === 'terrain') return <TerrainSection framed={framed} />;
  if (section === 'manubiae') return <ManubiaeSection framed={framed} />;
  if (section === 'cards') {
    return (
      <CardCodex
        framed={framed}
        selectedCardId={selectedCardId}
        cardHref={cardHref}
        filters={cardFilters}
        filtersHref={cardFiltersHref}
      />
    );
  }
  if (section === 'lipsana') return <LipsanaCodex framed={framed} selectedLipsanonId={selectedLipsanonId} lipsanonHref={lipsanonHref} />;
  if (section === 'ataraxia') return <AtaraxiaSection framed={framed} />;
  return <UnitsSection framed={framed} />;
}

export function Enchiridion({
  section = null,
  sectionHref = enchiridionSectionHref,
  selectedLipsanonId = null,
  lipsanonHref,
  selectedCardId = null,
  cardHref,
  cardFilters = null,
  cardFiltersHref,
  showSectionRail = true,
  sceneInstanceKey = `enchiridion/${section ?? 'root'}`,
  framed = true,
}: {
  section?: EnchiridionSection | null;
  sectionHref?: (section: EnchiridionSection) => string;
  /** The route-addressed lipsanon for the lipsana section; see LipsanaCodex. */
  selectedLipsanonId?: LipsanonId | null;
  /** When present, lipsanon selection in the lipsana section navigates to this address. */
  lipsanonHref?: (lipsanonId: LipsanonId) => string;
  /** The route-addressed gallery face for the cards section; see CardCodex. */
  selectedCardId?: string | null;
  /** When present, card focus in the cards section navigates to this address. */
  cardHref?: (cardId: string) => string;
  /** The route-addressed card filters; see CardCodex. */
  cardFilters?: EnchiridionCardFilters | null;
  /** When present, changing a card filter navigates to this address. */
  cardFiltersHref?: (filters: EnchiridionCardFilters) => string;
  showSectionRail?: boolean;
  sceneInstanceKey?: string;
  framed?: boolean;
}): ReactElement {
  return (
    <div className={`enchiridion-workspace${showSectionRail ? ' has-section-rail' : ''}`}>
      {showSectionRail ? <EnchiridionSectionRail section={section} sectionHref={sectionHref} /> : null}
      {section ? (
        <EnchiridionContentSceneSlot
          className="enchiridion-content"
          sceneInstance={sceneInstanceKey}
        >
          <EnchiridionReference
            section={section}
            framed={framed}
            selectedLipsanonId={selectedLipsanonId}
            lipsanonHref={lipsanonHref}
            selectedCardId={selectedCardId}
            cardHref={cardHref}
            cardFilters={cardFilters}
            cardFiltersHref={cardFiltersHref}
          />
        </EnchiridionContentSceneSlot>
      ) : null}
    </div>
  );
}

export function EnchiridionSectionRail({
  section,
  sectionHref,
}: {
  section: EnchiridionSection | null;
  sectionHref: (section: EnchiridionSection) => string;
}): ReactElement {
  const sectionIconSrc = useSectionIconSrc();
  // Which section wears the open mark. The sections are siblings under one root, and the root
  // differs by host (main menu vs Strategikon), so the family is derived from the very hrefs
  // this rail is handed — see shared/railOpenIntent.ts. `section` is untouched, so the content
  // pane still waits for the committed address and its transition is unchanged.
  const openSection = useOpenRailTab(siblingRailAddresses(ENCHIRIDION_SECTIONS, sectionHref), section);
  return (
    <ApparatusRailColumn className="enchiridion-section-rail" aria-label="Enchiridion sections">
      {ENCHIRIDION_SECTIONS.map((candidate, index) => (
        <ApparatusRailTab
          key={candidate}
          label={ENCHIRIDION_SECTION_LABEL[candidate]}
          to={sectionHref(candidate)}
          index={index}
          active={section === candidate}
          expanded={openSection === candidate}
          iconSrc={sectionIconSrc[candidate]}
          iconClassName={candidate === 'cards' ? STRATEGIKON_CARD_MARK_CLASS : undefined}
          markCanvas={candidate === 'ataraxia' ? 'bleed' : 'inset'}
        />
      ))}
    </ApparatusRailColumn>
  );
}
