import { useEffect, useId, useMemo, useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { legalMoves } from '../core/rules';
import { PIECE_LABEL, PLAYABLE_PIECE_TYPES, paletteForSide, pieceSpritePath, type PlayablePieceType } from '../core/pieces';
import type { BoardSize, Piece } from '../core/types';
import { runCardName } from '../run/cardNames';
import { PIECE_BUNDLE_DECK, RUN_RELICS, bundleLabel, type PieceBundle, type RunRelicId } from '../run/model';
import { RunBundleCard } from './RunBundleCard';
import {
  loadRunRelicStatistics,
  RUN_RELIC_STATISTICS_EVENT,
  type RunRelicStatistics,
} from '../run/relicStatistics';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { ENCHIRIDION_SECTIONS, enchiridionSectionHref, type EnchiridionSection } from './enchiridionRoute';
import { RunRelicIcon } from './RunRelics';
import { ApparatusRailTab } from './shared/ApparatusRailTab';
import { InnerChromeBox, OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { NavButton } from './shared/NavButton';
import { sceneTransitionTargetAttributes } from './shell/sceneTransitionTarget';

const SECTION_LABEL: Record<EnchiridionSection, string> = {
  units: 'Units',
  terrain: 'Terrain',
  cards: 'Cards',
  relics: 'Relics',
  abilities: 'Abilities',
};

const SECTION_ICON: Record<EnchiridionSection, string> = {
  units: 'skirmish-tab-icon skirmish-tab-icon-unit',
  terrain: 'ic-grid',
  cards: 'skirmish-tab-icon skirmish-tab-icon-roster',
  relics: 'skirmish-tab-icon skirmish-tab-icon-log',
  abilities: 'skirmish-icon skirmish-icon-shield',
};

const UNIT_COPY: Record<PlayablePieceType, string> = {
  pawn: 'Moves one square forward; from its starting square it may move two. Captures one square diagonally forward.',
  knight: 'Jumps in an L: two squares along one axis and one along the other.',
  bishop: 'Slides any distance along a diagonal until its diagonal path is blocked.',
  rook: 'Slides any distance in a straight orthogonal line until its path is blocked.',
  queen: 'Slides any distance orthogonally or diagonally until its path is blocked.',
  king: 'Moves one square in any direction. Authored Battles may also permit specific castling moves.',
};

const MOVEMENT_SIZE: BoardSize = { cols: 7, rows: 7 };

function movementExample(type: PlayablePieceType): {
  piece: Piece;
  pieces: Piece[];
  moves: Set<string>;
  captures: Set<string>;
} {
  const piece: Piece = {
    id: `enchiridion-${type}`,
    side: 'player',
    type,
    x: 3,
    y: 3,
    alive: true,
    startX: 3,
    startY: 3,
    pawnForward: 'north',
    facing: 'north',
  };
  const targets: Piece[] = type === 'pawn'
    ? [
        { id: 'pawn-capture-left', side: 'enemy', type: 'pawn', x: 2, y: 2, alive: true, startY: 0 },
        { id: 'pawn-capture-right', side: 'enemy', type: 'pawn', x: 4, y: 2, alive: true, startY: 0 },
      ]
    : [];
  const pieces = [piece, ...targets];
  const legal = legalMoves(piece, pieces, MOVEMENT_SIZE);
  return {
    piece,
    pieces,
    moves: new Set(legal.map((move) => `${move.x},${move.y}`)),
    captures: new Set(legal.filter((move) => move.capture).map((move) => `${move.x},${move.y}`)),
  };
}

function MovementDiagram({ type }: { type: PlayablePieceType }): ReactElement {
  const example = useMemo(() => movementExample(type), [type]);
  const cells = [];
  for (let y = 0; y < MOVEMENT_SIZE.rows; y += 1) {
    for (let x = 0; x < MOVEMENT_SIZE.cols; x += 1) {
      const key = `${x},${y}`;
      const isPiece = x === example.piece.x && y === example.piece.y;
      const isMove = example.moves.has(key);
      const isCapture = example.captures.has(key);
      cells.push(
        <span
          className={`enchiridion-move-cell${isMove ? ' is-move' : ''}${isCapture ? ' is-capture' : ''}${isPiece ? ' is-piece' : ''}`}
          key={key}
          aria-hidden="true"
        >
          {isPiece ? (
            <img
              src={pieceSpritePath(type, paletteForSide('player'), 'north')}
              alt=""
              draggable={false}
            />
          ) : isCapture ? '×' : isMove ? '◆' : '·'}
        </span>,
      );
    }
  }
  return (
    <div className="enchiridion-movement-diagram" role="img" aria-label={`${PIECE_LABEL[type]} legal movement from the center of an open board`}>
      {cells}
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
      <p>Each diagram is generated by the same movement engine used in Battle. Diamonds are legal destinations; crosses are captures.</p>
      <div className="enchiridion-unit-grid">
        {PLAYABLE_PIECE_TYPES.map((type) => (
          <InnerChromeBox className="enchiridion-unit-card" key={type}>
            <div>
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
              <button
                type="button"
                data-chrome-unit="inner-text-button"
                data-testid="relic-view-rows"
                role="tab"
                aria-controls={browsePanelId}
                aria-selected={browseMode === 'rows'}
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', browseMode === 'rows' && 'active')}
                onClick={() => setBrowseMode('rows')}
              >
                Rows
              </button>
              <button
                type="button"
                data-chrome-unit="inner-text-button"
                data-testid="relic-view-grouped"
                role="tab"
                aria-controls={browsePanelId}
                aria-selected={browseMode === 'grouped'}
                className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', browseMode === 'grouped' && 'active')}
                onClick={() => setBrowseMode('grouped')}
              >
                Grouped
              </button>
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

// The full generated bundle deck, grouped by gold value: a browser of card records and
// one selected card rendered as the exact face the Run deals (ADR-0253's one-selection,
// one-description shape). A host that gives cards addresses routes selection like the
// relic records (ADR-0256); an ephemeral host keeps plain local selection.
export function CardCodex({
  framed = true,
  selectedCardId = null,
  cardHref,
}: {
  framed?: boolean;
  /** The route-addressed card; read only when cardHref makes selection navigational. */
  selectedCardId?: string | null;
  /** When present, card selection navigates to this address instead of setting local state. */
  cardHref?: (bundleId: string) => string;
}): ReactElement {
  const [localSelectedId, setLocalSelectedId] = useState<string>(PIECE_BUNDLE_DECK[0].id);
  const selectedId = cardHref ? (selectedCardId ?? PIECE_BUNDLE_DECK[0].id) : localSelectedId;
  const selected: PieceBundle = PIECE_BUNDLE_DECK.find((bundle) => bundle.id === selectedId)
    ?? PIECE_BUNDLE_DECK[0];
  const groups = useMemo(() => {
    const byValue = new Map<number, PieceBundle[]>();
    for (const bundle of PIECE_BUNDLE_DECK) {
      byValue.set(bundle.value, [...(byValue.get(bundle.value) ?? []), bundle]);
    }
    return [...byValue.entries()].sort((left, right) => left[0] - right[0]);
  }, []);
  return (
    <ReferenceSectionFrame
      chromeConsumer="enchiridion-cards"
      className="enchiridion-card-panel"
      framed={framed}
      title="Cards"
    >
      <p>Every piece bundle the Run can deal, drawn as its card. Opening drafts and shops deal from this one deck; in a shop, a card costs its gold value.</p>
      <div className="enchiridion-card-layout">
        <div className="enchiridion-card-browser" role="list" aria-label="The card deck by gold value">
          {groups.map(([value, bundles]) => (
            <section className="enchiridion-card-group" key={value}>
              <span className="skirmish-eyebrow">{value} gold</span>
              <ul className="enchiridion-card-rows">
                {bundles.map((bundle) => (
                  <li key={bundle.id}>
                    <ReferenceTrigger
                      to={cardHref?.(bundle.id)}
                      onSelect={() => setLocalSelectedId(bundle.id)}
                      data-chrome-unit="inner-list-row"
                      className={chromeUnitClassNames(
                        'inner-list-row',
                        'enchiridion-card-row',
                        selected.id === bundle.id && 'is-active',
                      )}
                      aria-label={`${runCardName(bundle)}. ${bundleLabel(bundle)}. Worth ${bundle.value} gold.`}
                      aria-pressed={selected.id === bundle.id}
                    >
                      <span className="enchiridion-card-row-name">{runCardName(bundle)}</span>
                      <small className="enchiridion-card-row-contents">{bundleLabel(bundle)}</small>
                    </ReferenceTrigger>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <div className="enchiridion-card-detail">
          <RunBundleCard bundle={selected} mode="reference" />
        </div>
      </div>
    </ReferenceSectionFrame>
  );
}

function AbilitiesSection({ framed }: { framed: boolean }): ReactElement {
  return (
    <ReferenceSectionFrame
      chromeConsumer="enchiridion-abilities"
      className="enchiridion-abilities-panel"
      framed={framed}
      title="Unit Abilities"
    >
      <div className="enchiridion-ability-list">
        <InnerChromeBox className="enchiridion-ability-card">
          <span className="skirmish-icon skirmish-icon-shield" aria-hidden="true" />
          <span>
            <h3>Discipline</h3>
            <p>The unit may be deliberately placed on a legal square in the player deployment zone before the remainder of the army is deployed.</p>
          </span>
        </InnerChromeBox>
        <InnerChromeBox className="enchiridion-ability-card">
          <span className="skirmish-icon skirmish-icon-move" aria-hidden="true" />
          <span>
            <h3>Positioned</h3>
            <p>The unit’s automatic deployment favors its specified legal region—such as a front row, back row, edge, or corner—before using the ordinary fallback layout.</p>
          </span>
        </InnerChromeBox>
      </div>
    </ReferenceSectionFrame>
  );
}

function EnchiridionContent({ section, framed, selectedRelicId, relicHref, selectedCardId, cardHref }: {
  section: EnchiridionSection;
  framed: boolean;
  selectedRelicId: RunRelicId | null;
  relicHref?: (relicId: RunRelicId) => string;
  selectedCardId: string | null;
  cardHref?: (bundleId: string) => string;
}): ReactElement {
  if (section === 'terrain') return <TerrainSection framed={framed} />;
  if (section === 'cards') return <CardCodex framed={framed} selectedCardId={selectedCardId} cardHref={cardHref} />;
  if (section === 'relics') return <RelicCodex framed={framed} selectedRelicId={selectedRelicId} relicHref={relicHref} />;
  if (section === 'abilities') return <AbilitiesSection framed={framed} />;
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
}: {
  section?: EnchiridionSection;
  sectionHref?: (section: EnchiridionSection) => string;
  /** The route-addressed relic for the relics section; see RelicCodex. */
  selectedRelicId?: RunRelicId | null;
  /** When present, relic selection in the relics section navigates to this address. */
  relicHref?: (relicId: RunRelicId) => string;
  /** The route-addressed card for the cards section; see CardCodex. */
  selectedCardId?: string | null;
  /** When present, card selection in the cards section navigates to this address. */
  cardHref?: (bundleId: string) => string;
  showSectionRail?: boolean;
  sceneInstanceKey?: string;
  framed?: boolean;
}): ReactElement {
  return (
    <div className={`enchiridion-workspace${showSectionRail ? ' has-section-rail' : ''}`}>
      {showSectionRail ? (
        <aside className="enchiridion-section-rail" aria-label="Enchiridion sections">
          {ENCHIRIDION_SECTIONS.map((candidate, index) => (
            <ApparatusRailTab
              key={candidate}
              label={SECTION_LABEL[candidate]}
              to={sectionHref(candidate)}
              index={index}
              active={section === candidate}
              iconClassName={SECTION_ICON[candidate]}
            />
          ))}
        </aside>
      ) : null}
      <main
        className="enchiridion-content"
        {...sceneTransitionTargetAttributes('enchiridion-shell')}
        data-scene-instance={sceneInstanceKey}
      >
        <EnchiridionContent
          section={section}
          framed={framed}
          selectedRelicId={selectedRelicId}
          relicHref={relicHref}
          selectedCardId={selectedCardId}
          cardHref={cardHref}
        />
      </main>
    </div>
  );
}
