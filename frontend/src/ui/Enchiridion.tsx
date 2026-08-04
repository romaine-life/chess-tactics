import { useCallback, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { legalMoves } from '../core/rules';
import { createBlankLevel } from '../core/level';
import { levelToEditorBoard, unitsForGamePieces } from '../core/levelBoard';
import { PIECE_LABEL, PLAYABLE_PIECE_TYPES, type PlayablePieceType } from '../core/pieces';
import type { BoardSize, Piece } from '../core/types';
import {
  currentLiveMediaCatalog,
  liveMediaForSlot,
  resolvedLiveMediaUrl,
} from '@chess-tactics/board-render';
import { PredrawnMoveHighlightPaint } from '../render/PredrawnMoveHighlightPaint';
import { runCardArtSlot, runCardName } from '../run/cardNames';
import {
  ADLECTED_DISPLAY_NAME,
  AGMINATE_DISPLAY_NAME,
  ATARAXIA_BY_TIER,
  ATARAXIA_TIERS,
  CACOCHYMIC_DESCRIPTION,
  CACOCHYMIC_DISPLAY_NAME,
  EUTACTIC_DISPLAY_NAME,
  RUN_CARD_BY_ID,
  RUN_CARD_CATALOG,
  RUN_STARTER_CARD_BY_ID,
  RUN_CARD_TYPE_REFERENCE,
  RUN_LIPSANA,
  cardContentsLabel,
  type AtaraxiaTier,
  type RunArmyPieceType,
  type RunCardDefinition,
  type RunCardType,
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
import { RunCardFace, runCardPropertyIconUrl } from './RunCardFace';
import { runCardFaceContent, runCardFrameSlot, runCardSpecimen } from './runCardFaceContent';
import { runUnitStateIconUrl, type RunUnitState } from './shared/RunAbilityIcon';
import { runCardFrameGeometryForSlot } from './runCardFrameGeometry';
import { StaticReadOnlyBoardView } from './shared/BoardViewFraming';
import { AlphaBoundIcon } from './shared/AlphaBoundIcon';
import {
  loadLipsanaStatistics,
  LIPSANA_STATISTICS_EVENT,
  type LipsanaStatistics,
} from '../run/lipsanonStatistics';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import {
  ENCHIRIDION_SECTIONS,
  ENCHIRIDION_SECTION_LABEL,
  enchiridionSectionHref,
  type EnchiridionCardType,
  type EnchiridionSection,
} from './enchiridionRoute';
import { installedUiMedia } from './installedUiMedia';
import { LipsanonIcon } from './Lipsana';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { ataraxiaNumeralArtUrl } from './ataraxiaNumeral';
import { InnerChromeBox, OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';
import { NavButton } from './shared/NavButton';
import { ChromeButton } from './shared/ChromeButton';
import { PieceTypeIcon } from './shared/PieceTypeIcon';
import { RunCardCostCoin } from './shared/RunCardCostCoin';
import { RUN_PROGRESS_MEDIA_ROLE } from './shared/RunProgressIcon';
import { KitScroll } from './KitScroll';
import { EnchiridionContentSceneSlot } from './shell/AuthoredSceneSlot';
import { fetchAdminLiveMediaCatalog } from '../net/liveMediaAdmin';
import {
  acceptedCardTypeTextureUrls,
  cardTypeTextureUrls,
  hasCompleteCardTypeTextureSet,
  type CardTypeTextureUrls,
} from './cardTypeTextureReview';

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
const SECTION_ICON_SRC: Record<EnchiridionSection, string> = {
  units: installedUiMedia('ui-kit-icons-unit-studio-png'),
  terrain: installedUiMedia('ui-kit-icons-tileset-studio-png'),
  cards: installedUiMedia('ui-kit-icons-players-png'),
  'card-types': installedUiMedia('ui-kit-icons-game-power-png'),
  lipsana: installedUiMedia('ui-kit-icons-info-png'),
  abilities: installedUiMedia('ui-kit-icons-game-defend-png'),
  ataraxia: installedUiMedia(RUN_PROGRESS_MEDIA_ROLE.ataraxia),
};

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

export type CardGoldFilter = 'all' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type CardUnitFilter = 'all' | RunArmyPieceType;

const CARD_GOLD_FILTER_OPTIONS: readonly HouseSelectOption<CardGoldFilter>[] = Object.freeze([
  { value: 'all', label: 'All' },
  ...Array.from({ length: 10 }, (_, index) => {
    const value = String(index) as Exclude<CardGoldFilter, 'all'>;
    return {
      value,
      label: <RunCardCostCoin value={Number(value)} className="enchiridion-card-filter-gold-amount" />,
    };
  }),
]);

const CARD_UNIT_FILTER_OPTIONS: readonly HouseSelectOption<CardUnitFilter>[] = Object.freeze([
  { value: 'all', label: 'Any unit' },
  ...(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const).map((value) => ({
    value,
    label: (
      <span className="enchiridion-card-filter-unit-label">
        <PieceTypeIcon type={value} className="enchiridion-card-filter-unit-icon" />
        <span>{PIECE_LABEL[value]}</span>
      </span>
    ),
  })),
]);

export function cardMatchesFilters(
  card: RunCardDefinition,
  goldFilter: CardGoldFilter,
  unitFilter: CardUnitFilter,
): boolean {
  return (goldFilter === 'all' || card.value === Number(goldFilter))
    && (unitFilter === 'all' || card.pieces.some((piece) => piece === unitFilter));
}

// The card gallery's filter row, shared by the whole-catalog reference and the Run's held
// Chartulary. One control row governs both, so the two galleries cannot drift into
// lookalike filters with different options or different compact amounts (ADR-0059).
export function CardGalleryFilters({
  goldFilter,
  unitFilter,
  onGoldFilterChange,
  onUnitFilterChange,
  count,
  testIdPrefix,
}: {
  goldFilter: CardGoldFilter;
  unitFilter: CardUnitFilter;
  onGoldFilterChange: (filter: CardGoldFilter) => void;
  onUnitFilterChange: (filter: CardUnitFilter) => void;
  count: number;
  testIdPrefix: string;
}): ReactElement {
  return (
    <InnerChromeBox className="enchiridion-card-filters" aria-label="Card filters">
      <div className="enchiridion-card-filter">
        <span>Gold</span>
        <HouseSelect
          value={goldFilter}
          options={CARD_GOLD_FILTER_OPTIONS}
          onChange={onGoldFilterChange}
          ariaLabel="Filter cards by gold value"
          testId={`${testIdPrefix}-gold-filter`}
        />
      </div>
      <div className="enchiridion-card-filter">
        <span>Contains</span>
        <HouseSelect
          value={unitFilter}
          options={CARD_UNIT_FILTER_OPTIONS}
          onChange={onUnitFilterChange}
          ariaLabel="Filter cards by contained unit type"
          testId={`${testIdPrefix}-unit-filter`}
        />
      </div>
      <span className="enchiridion-card-filter-count" aria-live="polite">
        {count} {count === 1 ? 'card' : 'cards'}
      </span>
    </InnerChromeBox>
  );
}

/** Cards grouped by gold value, ascending — the gallery's one authored ordering. */
export function cardsByGoldValue<T>(
  entries: readonly T[],
  coreOf: (entry: T) => RunCardDefinition,
): Array<[number, T[]]> {
  const byValue = new Map<number, T[]>();
  for (const entry of entries) {
    const value = coreOf(entry).value;
    byValue.set(value, [...(byValue.get(value) ?? []), entry]);
  }
  return [...byValue.entries()].sort((left, right) => left[0] - right[0]);
}

// Cards is the terminal third-column browser: the two rail predecessors retain
// their canonical widths and every remaining pixel belongs to a gallery of the
// real faces themselves. Routes focus a face in that gallery; they never create
// a duplicate fourth-column detail (ADR-0364).
export function CardCodex({
  framed = true,
  selectedCardId = null,
  cardHref,
}: {
  framed?: boolean;
  /** The route-addressed gallery face; read only when cardHref makes focus navigational. */
  selectedCardId?: string | null;
  /** When present, focusing a card navigates to this address instead of setting local state. */
  cardHref?: (cardId: string) => string;
}): ReactElement {
  const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
  const [goldFilter, setGoldFilter] = useState<CardGoldFilter>('all');
  const [unitFilter, setUnitFilter] = useState<CardUnitFilter>('all');
  const focusedCardId = cardHref ? selectedCardId : localSelectedId;
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const visibleCards = useMemo(
    () => RUN_CARD_CATALOG.filter((card) => cardMatchesFilters(card, goldFilter, unitFilter)),
    [goldFilter, unitFilter],
  );
  const groups = useMemo(() => cardsByGoldValue(visibleCards, (card) => card), [visibleCards]);
  useEffect(() => {
    if (!focusedCardId) return;
    const card = galleryRef.current?.querySelector<HTMLElement>(`[data-card-id="${focusedCardId}"]`);
    if (!card) return;
    const frame = window.requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest', inline: 'nearest' }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusedCardId, visibleCards]);
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
          onGoldFilterChange={setGoldFilter}
          onUnitFilterChange={setUnitFilter}
          count={visibleCards.length}
          testIdPrefix="enchiridion-card"
        />
        <KitScroll className="enchiridion-card-gallery-scroll">
          <div
            ref={galleryRef}
            className="enchiridion-card-gallery-browser"
            role="list"
            aria-label="Filtered card catalog by gold value"
          >
            {groups.map(([value, cards]) => (
              <section className="enchiridion-card-gallery-group" key={value} aria-label={`${value} gold cards`}>
                <h3 className="enchiridion-card-gallery-heading">
                  <RunCardCostCoin value={value} className="enchiridion-card-group-gold" />
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
                          aria-label={`${runCardName(card)}. ${cardContentsLabel(card)}. Worth ${card.value} gold.`}
                          aria-pressed={focused}
                          aria-current={focused ? 'true' : undefined}
                        >
                          <RunCard card={card} mode="reference" />
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
                <p>No card has both of the selected properties.</p>
              </InnerChromeBox>
            ) : null}
          </div>
        </KitScroll>
      </div>
    </ReferenceSectionFrame>
  );
}

/**
 * The reference adds only what the model does not already carry: the specimen's printed
 * cost and the longer authored gloss. Its name and frame are read from the card type
 * itself, never restated here.
 */
type CardTypeReferenceDefinition = Readonly<{
  id: EnchiridionCardType;
  cost: number;
  description: string;
  provisional?: boolean;
}>;

const CARD_TYPE_REFERENCES: readonly CardTypeReferenceDefinition[] = Object.freeze([
  {
    id: 'praecipuus',
    cost: 0,
    description: 'Moves this card to the top of every deployment deal.',
  },
  {
    id: 'pestiferous',
    cost: 1,
    description: `Marks one contained unit ${CACOCHYMIC_DISPLAY_NAME}. Whenever that unit dies, the card marks another remaining unit; the empty card remains in the deck.`,
  },
  {
    id: 'concinnous',
    cost: 3,
    description: `Skillfully and harmoniously arranged. One persisted contained unit becomes ${EUTACTIC_DISPLAY_NAME} upon Adlectio; its target may remain hidden until then.`,
  },
  {
    id: 'legatine',
    cost: 4,
    description: `Of a legate, a commander's deputy entrusted with a detached force. One contained unit gains ${ADLECTED_DISPLAY_NAME} upon Adlectio. The target is hidden on multi-unit offers; this one-unit Volunteer shows the state because its target is forced.`,
  },
  {
    id: 'hieratic',
    cost: 4,
    description: `One contained unit gains ${AGMINATE_DISPLAY_NAME} upon Adlectio and prefers its piece-specific station during automatic deployment.`,
  },
]);

const cardTypeName = (definition: CardTypeReferenceDefinition): string => (
  definition.id === 'praecipuus' ? 'Praecipuus' : RUN_CARD_TYPE_REFERENCE[definition.id].name
);

const VOLUNTEER_CARD = RUN_CARD_BY_ID.p;
const CARD_TYPE_TEXTURE_TILE_COUNT = 24;

function CardTypeRowMaterial({
  cardType,
  src,
}: {
  cardType: EnchiridionCardType;
  src?: string;
}): ReactElement | null {
  if (!src) return null;
  return (
    <span
      aria-hidden="true"
      className="enchiridion-card-type-row-material"
      data-card-type-texture={cardType}
    >
      {Array.from({ length: CARD_TYPE_TEXTURE_TILE_COUNT }, (_, index) => (
        <img
          alt=""
          draggable={false}
          key={index}
          src={src}
        />
      ))}
    </span>
  );
}

/**
 * Ordinary properties draw a real one-unit Volunteer offer, while Praecipuus draws
 * canonical His Grace. The glossary therefore cannot show a card the game never deals.
 */
function CardTypeReference({ definition }: { definition: CardTypeReferenceDefinition }): ReactElement {
  const specimen = definition.id === 'praecipuus'
    ? RUN_STARTER_CARD_BY_ID['his-grace']
    : runCardSpecimen({
      pieces: VOLUNTEER_CARD.pieces,
      cardType: definition.id,
      cost: definition.cost,
      cacochymicPieceIndex: definition.id === 'pestiferous' ? 0 : null,
      effectTargetIndex: definition.id === 'concinnous' ? 0 : null,
    });
  const frameSlot = runCardFrameSlot(specimen);
  return (
    <div className="enchiridion-card-type-preview">
      <RunCardFace
        card={runCardFaceContent(specimen, { adlected: true })}
        frameUrl={liveMediaForSlot(frameSlot).media.immutableUrl}
        artUrl={resolvedLiveMediaUrl(runCardArtSlot(specimen))}
        frameGeometry={runCardFrameGeometryForSlot(frameSlot)}
      />
    </div>
  );
}

function CardTypesSection({
  framed,
  textureBatch,
  selectedCardTypeId = null,
  cardTypeHref,
}: {
  framed: boolean;
  textureBatch: string | null;
  /** The route-addressed property; read only when cardTypeHref makes selection navigational. */
  selectedCardTypeId?: EnchiridionCardType | null;
  /** When present, selecting a property navigates to this address instead of setting local state. */
  cardTypeHref?: (cardType: EnchiridionCardType) => string;
}): ReactElement {
  const [localSelectedTypeId, setLocalSelectedTypeId] = useState<EnchiridionCardType>('praecipuus');
  // Routed hosts derive the selection from the address every render; an unknown or absent
  // card-type address falls back to the first property without rewriting the URL.
  const selectedTypeId = cardTypeHref
    ? selectedCardTypeId ?? CARD_TYPE_REFERENCES[0].id
    : localSelectedTypeId;
  const [loadedTextureBatch, setLoadedTextureBatch] = useState<string | null>(null);
  const [textureUrls, setTextureUrls] = useState<CardTypeTextureUrls>({});
  const [textureLoadFailed, setTextureLoadFailed] = useState(false);
  const selected = CARD_TYPE_REFERENCES.find((definition) => definition.id === selectedTypeId)
    ?? CARD_TYPE_REFERENCES[0];
  const acceptedTextureUrls = acceptedCardTypeTextureUrls(currentLiveMediaCatalog());
  const displayedTextureUrls = textureBatch ? textureUrls : acceptedTextureUrls;
  const textureReviewStatus = textureBatch
    ? loadedTextureBatch !== textureBatch
      ? 'loading'
      : textureLoadFailed || !hasCompleteCardTypeTextureSet(textureUrls) ? 'error' : 'ready'
    : undefined;

  useEffect(() => {
    if (!textureBatch) return undefined;
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((catalog) => {
        if (!active) return;
        const nextUrls = cardTypeTextureUrls(catalog, textureBatch);
        setTextureUrls(nextUrls);
        setTextureLoadFailed(!hasCompleteCardTypeTextureSet(nextUrls));
        setLoadedTextureBatch(textureBatch);
      })
      .catch(() => {
        if (!active) return;
        setTextureUrls({});
        setTextureLoadFailed(true);
        setLoadedTextureBatch(textureBatch);
      });
    return () => { active = false; };
  }, [textureBatch]);

  return (
    <ReferenceSectionFrame
      chromeConsumer="enchiridion-card-types"
      className="enchiridion-card-types-panel"
      framed={framed}
      title={textureBatch ? 'Card Types · PixelLab candidates' : 'Card Types'}
    >
      <div
        className="enchiridion-card-type-layout"
        data-card-type-texture-review={textureReviewStatus}
      >
        <KitScroll className="enchiridion-reference-scroll">
          <ul className="enchiridion-card-type-rows" aria-label="Card types">
            {CARD_TYPE_REFERENCES.map((definition) => (
              <li key={definition.id}>
                <ReferenceTrigger
                  to={cardTypeHref?.(definition.id)}
                  onSelect={() => setLocalSelectedTypeId(definition.id)}
                  data-ui-sfx="card"
                  data-chrome-unit="inner-list-row"
                  data-testid={`enchiridion-card-type-${definition.id}`}
                  className={chromeUnitClassNames(
                    'inner-list-row',
                    'enchiridion-card-type-row',
                    selected.id === definition.id && 'is-active',
                  )}
                  aria-label={`${cardTypeName(definition)}. ${definition.description}`}
                  aria-pressed={selected.id === definition.id}
                >
                  <CardTypeRowMaterial
                    cardType={definition.id}
                    src={displayedTextureUrls[definition.id === 'praecipuus' ? 'hieratic' : definition.id]}
                  />
                  <span className="enchiridion-card-type-row-identity">
                    <AlphaBoundIcon
                      className="enchiridion-card-type-row-icon"
                      src={runCardPropertyIconUrl(definition.id)}
                      draggable={false}
                    />
                    <span className="enchiridion-card-type-row-name">{cardTypeName(definition)}</span>
                  </span>
                  {definition.provisional ? <small>Provisional</small> : null}
                </ReferenceTrigger>
              </li>
            ))}
          </ul>
        </KitScroll>
        <div className="enchiridion-card-type-detail">
          <CardTypeReference definition={selected} />
        </div>
      </div>
    </ReferenceSectionFrame>
  );
}

/**
 * The unit states a card property bestows. Each entry names its own accepted
 * `unit-ability-icon` role; the glossary never draws a stand-in glyph (ADR-0339).
 */
const UNIT_STATE_REFERENCES: readonly Readonly<{
  state: RunUnitState;
  name: string;
  description: string;
}>[] = Object.freeze([
  {
    state: 'primogeniture',
    name: 'Primogeniture',
    description: 'Is placed before every other unit.',
  },
  {
    state: 'adlected',
    name: ADLECTED_DISPLAY_NAME,
    description: 'The player chooses its square when its deployment turn arrives.',
  },
  {
    state: 'eutactic',
    name: EUTACTIC_DISPLAY_NAME,
    description: 'During automatic deployment, Pawns prefer the front row; Knights and Bishops prefer the row immediately behind the front; and Rooks, Queens, and the King prefer the back row. If the preferred row is full, the unit uses the nearest available row.',
  },
  {
    state: 'agminate',
    name: AGMINATE_DISPLAY_NAME,
    description: 'Pawns prefer another Pawn or an open file; Knights prefer squares one step in from the edge; Bishops prefer the nearest opposite-color square from another Bishop; Rooks prefer a back-row corner, except the first Rook flanks an Agminate King when possible; Queens prefer the middle; and the King prefers a board edge.',
  },
  {
    state: 'cacochymic',
    name: CACOCHYMIC_DISPLAY_NAME,
    description: CACOCHYMIC_DESCRIPTION,
  },
]);

// A unit state inherits the surface of the one card property that grants it. Derive
// that pairing from the Run model so the two Enchiridion sections cannot drift apart.
const CARD_TYPE_BY_UNIT_STATE = Object.freeze({
  ...Object.fromEntries(
  (Object.entries(RUN_CARD_TYPE_REFERENCE) as [
    RunCardType,
    (typeof RUN_CARD_TYPE_REFERENCE)[RunCardType],
  ][]).map(([cardType, definition]) => [definition.grants, cardType]),
  ),
  // Row texture is decorative; the dedicated property and state icons own identity.
  primogeniture: 'praecipuus',
}) as Readonly<Record<RunUnitState, EnchiridionCardType>>;

function AbilitiesSection({ framed }: { framed: boolean }): ReactElement {
  const textureUrls = acceptedCardTypeTextureUrls(currentLiveMediaCatalog());
  return (
    <ReferenceSectionFrame
      chromeConsumer="enchiridion-abilities"
      className="enchiridion-abilities-panel"
      framed={framed}
      title="Abilities"
    >
      <KitScroll className="enchiridion-reference-scroll">
        <div className="enchiridion-ability-list">
          {UNIT_STATE_REFERENCES.map(({ state, name, description }) => {
            const cardType = CARD_TYPE_BY_UNIT_STATE[state];
            return (
              <InnerChromeBox
                className="enchiridion-ability-card"
                data-card-type={cardType}
                key={state}
              >
                <CardTypeRowMaterial
                  cardType={cardType}
                  src={textureUrls[cardType === 'praecipuus' ? 'hieratic' : cardType]}
                />
                <img
                  className="enchiridion-ability-icon"
                  src={runUnitStateIconUrl(state)}
                  alt=""
                  aria-hidden="true"
                  draggable={false}
                />
                <span>
                  <h3>{name}</h3>
                  <p>{description}</p>
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
  selectedCardTypeId,
  cardTypeHref,
  cardTypeTextureBatch = null,
}: {
  section: EnchiridionSection;
  framed: boolean;
  selectedLipsanonId: LipsanonId | null;
  lipsanonHref?: (lipsanonId: LipsanonId) => string;
  selectedCardId: string | null;
  cardHref?: (cardId: string) => string;
  selectedCardTypeId: EnchiridionCardType | null;
  cardTypeHref?: (cardType: EnchiridionCardType) => string;
  cardTypeTextureBatch?: string | null;
}): ReactElement {
  if (section === 'terrain') return <TerrainSection framed={framed} />;
  if (section === 'cards') return <CardCodex framed={framed} selectedCardId={selectedCardId} cardHref={cardHref} />;
  if (section === 'card-types') {
    return (
      <CardTypesSection
        framed={framed}
        textureBatch={cardTypeTextureBatch}
        selectedCardTypeId={selectedCardTypeId}
        cardTypeHref={cardTypeHref}
      />
    );
  }
  if (section === 'lipsana') return <LipsanaCodex framed={framed} selectedLipsanonId={selectedLipsanonId} lipsanonHref={lipsanonHref} />;
  if (section === 'abilities') return <AbilitiesSection framed={framed} />;
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
  selectedCardTypeId = null,
  cardTypeHref,
  showSectionRail = true,
  sceneInstanceKey = `enchiridion/${section ?? 'root'}`,
  framed = true,
  cardTypeTextureBatch = null,
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
  /** The route-addressed property for the card-types section; see CardTypesSection. */
  selectedCardTypeId?: EnchiridionCardType | null;
  /** When present, property selection in the card-types section navigates to this address. */
  cardTypeHref?: (cardType: EnchiridionCardType) => string;
  showSectionRail?: boolean;
  sceneInstanceKey?: string;
  framed?: boolean;
  /** Exact private PixelLab batch mounted only for an explicit Card Types review URL. */
  cardTypeTextureBatch?: string | null;
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
            selectedCardTypeId={selectedCardTypeId}
            cardTypeHref={cardTypeHref}
            cardTypeTextureBatch={cardTypeTextureBatch}
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
  return (
    <ApparatusRailColumn className="enchiridion-section-rail" aria-label="Enchiridion sections">
      {ENCHIRIDION_SECTIONS.map((candidate, index) => (
        <ApparatusRailTab
          key={candidate}
          label={ENCHIRIDION_SECTION_LABEL[candidate]}
          to={sectionHref(candidate)}
          index={index}
          active={section === candidate}
          iconSrc={SECTION_ICON_SRC[candidate]}
          markCanvas={candidate === 'ataraxia' ? 'bleed' : 'inset'}
        />
      ))}
    </ApparatusRailColumn>
  );
}
