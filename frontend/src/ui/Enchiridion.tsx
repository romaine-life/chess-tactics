import { useCallback, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { legalMoves } from '../core/rules';
import { createBlankLevel } from '../core/level';
import { levelToEditorBoard, unitsForGamePieces } from '../core/levelBoard';
import { PIECE_LABEL, PLAYABLE_PIECE_TYPES, type PlayablePieceType } from '../core/pieces';
import type { BoardSize, Piece } from '../core/types';
import {
  currentLiveMediaCatalog,
  liveMediaForSlot,
  liveMediaSlotsWithPrefix,
  resolvedLiveMediaUrl,
} from '@chess-tactics/board-render';
import { PredrawnMoveHighlightPaint } from '../render/PredrawnMoveHighlightPaint';
import { runCardArtSlot, runCardFlavor, runCardName } from '../run/cardNames';
import {
  AGMINATE_DISPLAY_NAME,
  ATARAXIA_BY_TIER,
  ATARAXIA_TIERS,
  CACOCHYMIC_DISPLAY_NAME,
  RUN_CARD_BY_ID,
  RUN_CARD_DECK,
  RUN_CARD_TYPE_REFERENCE,
  RUN_RELICS,
  cardContentsLabel,
  type AtaraxiaTier,
  type PurchasablePieceType,
  type RunCardType,
  type RunCoreCard,
  type RunRelicId,
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
import {
  RUN_CARD_FRAME_SLOT,
  RUN_CARD_CONCINNOUS_FRAME_SLOT,
  RUN_CARD_HIERATIC_FRAME_SLOT,
  RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  RUN_CARD_TACTICAL_FRAME_SLOT,
  RunCardFace,
  runCardPropertyIconUrl,
  type RunCardFaceContent,
} from './RunCardFace';
import { runUnitStateIconUrl, type RunUnitState } from './shared/RunAbilityIcon';
import { runCardFrameGeometryForSlot } from './runCardFrameGeometry';
import { StaticReadOnlyBoardView } from './shared/BoardViewFraming';
import { AlphaBoundIcon } from './shared/AlphaBoundIcon';
import {
  loadRunRelicStatistics,
  RUN_RELIC_STATISTICS_EVENT,
  type RunRelicStatistics,
} from '../run/relicStatistics';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ENCHIRIDION_SECTIONS, enchiridionSectionHref, type EnchiridionSection } from './enchiridionRoute';
import { installedUiMedia } from './installedUiMedia';
import { RunRelicIcon } from './RunRelics';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { InnerChromeBox, OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { HouseSelect, type HouseSelectOption } from './shared/HouseSelect';
import { NavButton } from './shared/NavButton';
import { ChromeButton } from './shared/ChromeButton';
import { PieceTypeIcon } from './shared/PieceTypeIcon';
import { RunCardCostCoin } from './shared/RunCardCostCoin';
import { KitScroll } from './KitScroll';
import { EnchiridionContentSceneSlot } from './shell/AuthoredSceneSlot';
import { fetchAdminLiveMediaCatalog } from '../net/liveMediaAdmin';
import {
  acceptedCardTypeTextureUrls,
  cardTypeTextureUrls,
  hasCompleteCardTypeTextureSet,
  type CardTypeTextureUrls,
} from './cardTypeTextureReview';

const SECTION_LABEL: Record<EnchiridionSection, string> = {
  units: 'Units',
  terrain: 'Terrain',
  cards: 'Cards',
  'card-types': 'Card Types',
  relics: 'Relics',
  abilities: 'Abilities',
  ataraxia: 'Ataraxia',
};

/**
 * Every section's mark, resolved to installed media. These are the same kit icons the
 * rail used to name as Skirmish-HUD glyph classes; as classes they painted a CSS
 * background under the HUD's sizing rules instead of the rail's, so Terrain (the one
 * section already on installed media) sat a third larger than its five neighbours.
 */
const SECTION_ICON_SRC: Record<EnchiridionSection, string> = {
  units: installedUiMedia('ui-kit-icons-unit-studio-png'),
  terrain: installedUiMedia('ui-kit-icons-tileset-studio-png'),
  cards: installedUiMedia('ui-kit-icons-players-png'),
  'card-types': installedUiMedia('ui-kit-icons-game-power-png'),
  relics: installedUiMedia('ui-kit-icons-info-png'),
  abilities: installedUiMedia('ui-kit-icons-game-defend-png'),
  ataraxia: installedUiMedia('ui-kit-icons-game-objective-png'),
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

function ReferenceSectionFrame({
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
      <InnerChromeBox className="enchiridion-rule-exceptions">
        <h3>Path exceptions</h3>
        <p><strong>Knights</strong> jump over gaps, fences, and intervening obstacles. Only the landing square must be legal.</p>
        <p><strong>Bishops</strong> inspect the diagonal they actually travel. Obstacles on neighboring non-diagonal tiles are ignored; a blocker on the diagonal itself still ends the path.</p>
      </InnerChromeBox>
    </ReferenceSectionFrame>
  );
}

function statisticFor(statistics: RunRelicStatistics, relicId: RunRelicId) {
  return statistics[relicId] ?? { timesPicked: 0, battlesWonWhileHeld: 0 };
}

type RelicBrowseMode = 'rows' | 'grouped';

// One reference entry control in two transports (ADR-0256): a host that gives records
// addresses (relics, cards) renders a NavButton whose route is the record's address
// (ADR-0052 — the route is kept updated, never a hoverable link); a host with ephemeral
// reference selection (the Battle-hosted Strategikon) keeps a plain selection button.
function ReferenceTrigger({ to, onSelect, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  to?: string;
  onSelect: () => void;
}): ReactElement {
  if (to) return <NavButton to={to} {...props}>{children}</NavButton>;
  return <button type="button" onClick={onSelect} {...props}>{children}</button>;
}

export function RelicCodex({
  relicIds = RUN_RELICS.map((relic) => relic.id),
  title = 'Relics',
  showStatistics = true,
  framed = true,
  selectedRelicId = null,
  relicHref,
}: {
  relicIds?: readonly RunRelicId[];
  title?: string;
  showStatistics?: boolean;
  framed?: boolean;
  /** The route-addressed relic; read only when relicHref makes selection navigational. */
  selectedRelicId?: RunRelicId | null;
  /** When present, relic selection navigates to this address instead of setting local state. */
  relicHref?: (relicId: RunRelicId) => string;
}): ReactElement {
  const [localSelectedId, setLocalSelectedId] = useState<RunRelicId>(relicIds[0] ?? RUN_RELICS[0].id);
  // Routed hosts derive the selection from the address every render; an unknown or
  // absent relic address falls back to the first visible relic without rewriting the URL.
  const selectedId = relicHref ? (selectedRelicId ?? relicIds[0] ?? RUN_RELICS[0].id) : localSelectedId;
  const [browseMode, setBrowseMode] = useState<RelicBrowseMode>('rows');
  const [statistics, setStatistics] = useState<RunRelicStatistics>({});
  const [statisticsStatus, setStatisticsStatus] = useState<'loading' | 'account' | 'browser'>('loading');
  const browsePanelId = useId();
  const visibleRelics = RUN_RELICS.filter((relic) => relicIds.includes(relic.id));
  const selected = RUN_RELICS.find((relic) => relic.id === selectedId)
    ?? visibleRelics[0]
    ?? RUN_RELICS[0];

  useEffect(() => {
    if (relicHref) return;
    if (!relicIds.includes(localSelectedId) && relicIds[0]) setLocalSelectedId(relicIds[0]);
  }, [relicHref, relicIds, localSelectedId]);

  useEffect(() => {
    if (!showStatistics) return undefined;
    let active = true;
    const refresh = () => {
      void loadRunRelicStatistics().then((result) => {
        if (!active) return;
        setStatistics(result.statistics);
        setStatisticsStatus(result.accountBacked ? 'account' : 'browser');
      });
    };
    refresh();
    window.addEventListener(RUN_RELIC_STATISTICS_EVENT, refresh);
    return () => {
      active = false;
      window.removeEventListener(RUN_RELIC_STATISTICS_EVENT, refresh);
    };
  }, [showStatistics]);

  const selectedStatistic = statisticFor(statistics, selected.id);
  return (
    <ReferenceSectionFrame
      chromeConsumer="enchiridion-relics"
      className="enchiridion-relic-panel"
      framed={framed}
      title={title}
    >
      {relicIds.length ? (
        <div className="enchiridion-relic-layout">
          <div className="enchiridion-relic-browser">
            <div className="le-seg enchiridion-relic-view-tabs" role="tablist" aria-label="Relic browsing layout">
              <ChromeButton unit="inner-text-button"
                data-testid="relic-view-rows"
                role="tab"
                aria-controls={browsePanelId}
                aria-selected={browseMode === 'rows'}
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', browseMode === 'rows' && 'active')}
                onClick={() => setBrowseMode('rows')}
              >
                Rows
              </ChromeButton>
              <ChromeButton unit="inner-text-button"
                data-testid="relic-view-grouped"
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
              className={`enchiridion-relic-browse-panel is-${browseMode}`}
              role="tabpanel"
              aria-label={`${browseMode === 'rows' ? 'Rows' : 'Grouped'} relic view`}
            >
              {browseMode === 'rows' ? (
                <ul className="enchiridion-relic-rows" aria-label={title}>
                  {visibleRelics.map((relic) => (
                    <li key={relic.id}>
                      <ReferenceTrigger
                        to={relicHref?.(relic.id)}
                        onSelect={() => setLocalSelectedId(relic.id)}
                        data-chrome-unit="inner-list-row"
                        className={chromeUnitClassNames(
                          'inner-list-row',
                          'enchiridion-relic-row',
                          selected.id === relic.id && 'is-active',
                        )}
                        aria-label={`${relic.name}. ${relic.description}`}
                        aria-pressed={selected.id === relic.id}
                      >
                        <RunRelicIcon relicId={relic.id} className="enchiridion-relic-row-icon" />
                        <span className="enchiridion-relic-row-name">{relic.name}</span>
                      </ReferenceTrigger>
                    </li>
                  ))}
                </ul>
              ) : (
                <InnerChromeBox className="enchiridion-relic-group">
                  <ul className="enchiridion-relic-group-grid" aria-label={title}>
                    {visibleRelics.map((relic) => (
                      <li key={relic.id}>
                        <ReferenceTrigger
                          to={relicHref?.(relic.id)}
                          onSelect={() => setLocalSelectedId(relic.id)}
                          className={`enchiridion-relic-grouped-trigger${selected.id === relic.id ? ' is-active' : ''}`}
                          aria-label={`${relic.name}. ${relic.description}`}
                          aria-pressed={selected.id === relic.id}
                        >
                          <RunRelicIcon relicId={relic.id} />
                        </ReferenceTrigger>
                      </li>
                    ))}
                  </ul>
                </InnerChromeBox>
              )}
            </div>
          </div>
          <InnerChromeBox className="enchiridion-relic-detail">
            <RunRelicIcon relicId={selected.id} />
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
          <h3>No relics held</h3>
          <p>This Lipsanotheca is presently, and perhaps suspiciously, empty.</p>
        </InnerChromeBox>
      )}
    </ReferenceSectionFrame>
  );
}

export type CardGoldFilter = 'all' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
export type CardUnitFilter = 'all' | PurchasablePieceType;

const CARD_GOLD_FILTER_OPTIONS: readonly HouseSelectOption<CardGoldFilter>[] = Object.freeze([
  { value: 'all', label: 'All' },
  ...Array.from({ length: 9 }, (_, index) => {
    const value = String(index + 1) as Exclude<CardGoldFilter, 'all'>;
    return {
      value,
      label: <RunCardCostCoin value={Number(value)} className="enchiridion-card-filter-gold-amount" />,
    };
  }),
]);

const CARD_UNIT_FILTER_OPTIONS: readonly HouseSelectOption<CardUnitFilter>[] = Object.freeze([
  { value: 'all', label: 'Any unit' },
  ...(['pawn', 'knight', 'bishop', 'rook', 'queen'] as const).map((value) => ({
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
  card: RunCoreCard,
  goldFilter: CardGoldFilter,
  unitFilter: CardUnitFilter,
): boolean {
  return (goldFilter === 'all' || card.value === Number(goldFilter))
    && (unitFilter === 'all' || card.pieces.includes(unitFilter));
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
    () => RUN_CARD_DECK.filter((card) => cardMatchesFilters(card, goldFilter, unitFilter)),
    [goldFilter, unitFilter],
  );
  const groups = useMemo(() => {
    const byValue = new Map<number, RunCoreCard[]>();
    for (const card of visibleCards) {
      byValue.set(card.value, [...(byValue.get(card.value) ?? []), card]);
    }
    return [...byValue.entries()].sort((left, right) => left[0] - right[0]);
  }, [visibleCards]);
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
      <p>Every card the Run can deal. The opening Shop and later Shops use this one deck; a card costs its gold value.</p>
      <div className="enchiridion-card-gallery-layout">
        <InnerChromeBox className="enchiridion-card-filters" aria-label="Card filters">
          <div className="enchiridion-card-filter">
            <span>Gold</span>
            <HouseSelect
              value={goldFilter}
              options={CARD_GOLD_FILTER_OPTIONS}
              onChange={setGoldFilter}
              ariaLabel="Filter cards by gold value"
              testId="enchiridion-card-gold-filter"
            />
          </div>
          <div className="enchiridion-card-filter">
            <span>Contains</span>
            <HouseSelect
              value={unitFilter}
              options={CARD_UNIT_FILTER_OPTIONS}
              onChange={setUnitFilter}
              ariaLabel="Filter cards by contained unit type"
              testId="enchiridion-card-unit-filter"
            />
          </div>
          <span className="enchiridion-card-filter-count" aria-live="polite">
            {visibleCards.length} {visibleCards.length === 1 ? 'card' : 'cards'}
          </span>
        </InnerChromeBox>
        <KitScroll className="enchiridion-card-gallery-scroll">
          <div
            ref={galleryRef}
            className="enchiridion-card-gallery-browser"
            role="list"
            aria-label="Filtered card deck by gold value"
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
                          className={`enchiridion-card-gallery-trigger${focused ? ' is-addressed' : ''}`}
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
                <p>No core card has both of the selected properties.</p>
              </InnerChromeBox>
            ) : null}
          </div>
        </KitScroll>
      </div>
    </ReferenceSectionFrame>
  );
}

type CardTypeReferenceDefinition = Readonly<{
  id: RunCardType;
  name: string;
  cost: number;
  description: string;
  provisional?: boolean;
  frameSlot?: string;
}>;

const CARD_TYPE_REFERENCES: readonly CardTypeReferenceDefinition[] = Object.freeze([
  {
    id: 'pestiferous',
    name: 'Pestiferous',
    cost: 1,
    description: `One public unit is ${CACOCHYMIC_DISPLAY_NAME} and receives the tier discount. A victorious Battle loses that unit, then marks one remaining unit; the empty card remains in the deck.`,
    frameSlot: RUN_CARD_PESTIFEROUS_FRAME_SLOT,
  },
  {
    id: 'concinnous',
    name: 'Concinnous',
    cost: 3,
    description: 'Skillfully and harmoniously arranged. One persisted contained unit becomes Positioned on purchase; its target may remain hidden until then.',
    frameSlot: RUN_CARD_CONCINNOUS_FRAME_SLOT,
  },
  {
    id: 'tactical',
    name: 'Tactical',
    cost: 4,
    description: 'One contained unit gains Discipline when purchased. The target is hidden on multi-unit offers; this one-unit Volunteer shows the state because its target is forced.',
    frameSlot: RUN_CARD_TACTICAL_FRAME_SLOT,
  },
  {
    id: 'hieratic',
    name: 'Hieratic',
    cost: 4,
    description: `Priestly, highly formal, and rigidly stylized. One contained unit gains ${AGMINATE_DISPLAY_NAME} when purchased and deploys into its role's formation seat rather than a rank. The target is hidden on multi-unit offers; this one-unit Volunteer shows the state because its target is forced.`,
    frameSlot: RUN_CARD_HIERATIC_FRAME_SLOT,
  },
]);

const VOLUNTEER_CARD = RUN_CARD_BY_ID.p;
const CARD_TYPE_TEXTURE_TILE_COUNT = 24;

function CardTypeReference({ definition }: { definition: CardTypeReferenceDefinition }): ReactElement {
  const frameSlot = definition.frameSlot ?? RUN_CARD_FRAME_SLOT;
  const frameMedia = liveMediaForSlot(frameSlot).media;
  const card = {
    name: runCardName(VOLUNTEER_CARD),
    cost: definition.cost,
    typeLine: 'Units',
    cardProperty: {
      id: definition.id,
      name: definition.name,
      effect: RUN_CARD_TYPE_REFERENCE[definition.id].effect,
    },
    grants: [{
      unit: 'pawn',
      count: 1,
      ...(definition.id === 'pestiferous' ? { plaguedIndices: [0] } : {}),
      ...(definition.id === 'tactical' ? { ability: 'discipline' as const } : {}),
      ...(definition.id === 'hieratic' ? { ability: 'marshalled' as const } : {}),
    }],
    properties: definition.id === 'concinnous'
      ? [{ name: 'Positioned', target: 'Pawn' }]
      : undefined,
    flavor: runCardFlavor(VOLUNTEER_CARD),
  } satisfies RunCardFaceContent;
  return (
    <div className="enchiridion-card-type-preview">
      <RunCardFace
        card={card}
        frameUrl={frameMedia.immutableUrl}
        artUrl={resolvedLiveMediaUrl(runCardArtSlot(VOLUNTEER_CARD))}
        frameGeometry={runCardFrameGeometryForSlot(frameSlot)}
      />
    </div>
  );
}

function CardTypesSection({ framed, textureBatch }: { framed: boolean; textureBatch: string | null }): ReactElement {
  const [selectedTypeId, setSelectedTypeId] = useState('pestiferous');
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
        <ul className="enchiridion-card-type-rows" aria-label="Card types">
          {CARD_TYPE_REFERENCES.map((definition) => (
            <li key={definition.id}>
              <ReferenceTrigger
                onSelect={() => setSelectedTypeId(definition.id)}
                data-chrome-unit="inner-list-row"
                data-testid={`enchiridion-card-type-${definition.id}`}
                className={chromeUnitClassNames(
                  'inner-list-row',
                  'enchiridion-card-type-row',
                  selected.id === definition.id && 'is-active',
                )}
                aria-label={`${definition.name}. ${definition.description}`}
                aria-pressed={selected.id === definition.id}
              >
                {displayedTextureUrls[definition.id] ? (
                  <span
                    aria-hidden="true"
                    className="enchiridion-card-type-row-material"
                    data-card-type-texture={definition.id}
                  >
                    {Array.from({ length: CARD_TYPE_TEXTURE_TILE_COUNT }, (_, index) => (
                      <img
                        alt=""
                        draggable={false}
                        key={index}
                        src={displayedTextureUrls[definition.id]}
                      />
                    ))}
                  </span>
                ) : null}
                <span className="enchiridion-card-type-row-identity">
                  <AlphaBoundIcon
                    className="enchiridion-card-type-row-icon"
                    src={runCardPropertyIconUrl(definition.id)}
                    draggable={false}
                  />
                  <span className="enchiridion-card-type-row-name">{definition.name}</span>
                </span>
                {definition.provisional ? <small>Provisional</small> : null}
              </ReferenceTrigger>
            </li>
          ))}
        </ul>
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
    state: 'discipline',
    name: 'Discipline',
    description: 'The unit may be deliberately placed on a legal square in the player deployment zone before the remainder of the army is deployed.',
  },
  {
    state: 'positioned',
    name: 'Positioned',
    description: 'The unit’s automatic deployment favors its piece-specific region: Pawns prefer the front row, the King and Bishops prefer the back row, and Rooks prefer outer back-row squares.',
  },
  {
    state: 'marshalled',
    name: AGMINATE_DISPLAY_NAME,
    description: 'The unit seeks its piece-specific station: the King prefers a board edge, Rooks favor their King-flank and corner formation, and Bishops prefer the opposite square color from another Bishop.',
  },
  {
    state: 'plagued',
    name: CACOCHYMIC_DISPLAY_NAME,
    description: 'The unit may be permanently lost after a Battle when its Pestiferous card resolves attrition. Its card-price contribution is discounted by 0 gold for a Pawn, 1 for a Knight or Bishop, 2 for a Rook, and 3 for a Queen.',
  },
]);

function AbilitiesSection({ framed }: { framed: boolean }): ReactElement {
  return (
    <ReferenceSectionFrame
      chromeConsumer="enchiridion-abilities"
      className="enchiridion-abilities-panel"
      framed={framed}
      title="Abilities"
    >
      <div className="enchiridion-ability-list">
        {UNIT_STATE_REFERENCES.map(({ state, name, description }) => (
          <InnerChromeBox className="enchiridion-ability-card" key={state}>
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
        ))}
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
/**
 * The carved-stone rung marks (ADR-0363), forged by `scripts/forge-ataraxia-numerals.mjs`
 * and installed as live media under one prefix. Read by PREFIX, not by required slot: an
 * installed art set is the enrichment, and the ladder must still render its rungs on a
 * deployment where the set has not been accepted yet. `liveMediaForSlot` would throw there
 * and take the whole section down for a mark.
 *
 * The slug rule matches the forge's: the baseline is `zero` because a bare `0.png` reads as
 * an index, every Roman rung is its own numeral lowercased.
 */
const ATARAXIA_NUMERAL_SLOT_PREFIX = 'ui/kit/numerals/stone/';

function ataraxiaNumeralSlot(numeral: string): string {
  return `${ATARAXIA_NUMERAL_SLOT_PREFIX}${numeral === '0' ? 'zero' : numeral.toLowerCase()}.png`;
}

function ataraxiaNumeralArtUrl(numeral: string): string | null {
  const slot = ataraxiaNumeralSlot(numeral);
  return liveMediaSlotsWithPrefix(ATARAXIA_NUMERAL_SLOT_PREFIX)
    .find((entry) => entry.slot === slot)?.media.immutableUrl ?? null;
}

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
  selectedRelicId,
  relicHref,
  selectedCardId,
  cardHref,
  cardTypeTextureBatch = null,
}: {
  section: EnchiridionSection;
  framed: boolean;
  selectedRelicId: RunRelicId | null;
  relicHref?: (relicId: RunRelicId) => string;
  selectedCardId: string | null;
  cardHref?: (cardId: string) => string;
  cardTypeTextureBatch?: string | null;
}): ReactElement {
  if (section === 'terrain') return <TerrainSection framed={framed} />;
  if (section === 'cards') return <CardCodex framed={framed} selectedCardId={selectedCardId} cardHref={cardHref} />;
  if (section === 'card-types') return <CardTypesSection framed={framed} textureBatch={cardTypeTextureBatch} />;
  if (section === 'relics') return <RelicCodex framed={framed} selectedRelicId={selectedRelicId} relicHref={relicHref} />;
  if (section === 'abilities') return <AbilitiesSection framed={framed} />;
  if (section === 'ataraxia') return <AtaraxiaSection framed={framed} />;
  return <UnitsSection framed={framed} />;
}

export function Enchiridion({
  section = 'units',
  sectionHref = enchiridionSectionHref,
  selectedRelicId = null,
  relicHref,
  selectedCardId = null,
  cardHref,
  showSectionRail = true,
  sceneInstanceKey = `enchiridion/${section}`,
  framed = true,
  cardTypeTextureBatch = null,
}: {
  section?: EnchiridionSection;
  sectionHref?: (section: EnchiridionSection) => string;
  /** The route-addressed relic for the relics section; see RelicCodex. */
  selectedRelicId?: RunRelicId | null;
  /** When present, relic selection in the relics section navigates to this address. */
  relicHref?: (relicId: RunRelicId) => string;
  /** The route-addressed gallery face for the cards section; see CardCodex. */
  selectedCardId?: string | null;
  /** When present, card focus in the cards section navigates to this address. */
  cardHref?: (cardId: string) => string;
  showSectionRail?: boolean;
  sceneInstanceKey?: string;
  framed?: boolean;
  /** Exact private PixelLab batch mounted only for an explicit Card Types review URL. */
  cardTypeTextureBatch?: string | null;
}): ReactElement {
  return (
    <div className={`enchiridion-workspace${showSectionRail ? ' has-section-rail' : ''}`}>
      {showSectionRail ? <EnchiridionSectionRail section={section} sectionHref={sectionHref} /> : null}
      <EnchiridionContentSceneSlot
        className="enchiridion-content"
        sceneInstance={sceneInstanceKey}
      >
        <EnchiridionReference
          section={section}
          framed={framed}
          selectedRelicId={selectedRelicId}
          relicHref={relicHref}
          selectedCardId={selectedCardId}
          cardHref={cardHref}
          cardTypeTextureBatch={cardTypeTextureBatch}
        />
      </EnchiridionContentSceneSlot>
    </div>
  );
}

export function EnchiridionSectionRail({
  section,
  sectionHref,
}: {
  section: EnchiridionSection;
  sectionHref: (section: EnchiridionSection) => string;
}): ReactElement {
  return (
    <ApparatusRailColumn className="enchiridion-section-rail" aria-label="Enchiridion sections">
      {ENCHIRIDION_SECTIONS.map((candidate, index) => (
        <ApparatusRailTab
          key={candidate}
          label={SECTION_LABEL[candidate]}
          to={sectionHref(candidate)}
          index={index}
          active={section === candidate}
          iconSrc={SECTION_ICON_SRC[candidate]}
        />
      ))}
    </ApparatusRailColumn>
  );
}
