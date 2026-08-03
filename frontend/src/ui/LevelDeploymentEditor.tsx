import type { ReactElement } from 'react';
import type { ConditionSide, LevelEvents, Roster, ZoneType } from '../core/level';
import { PIECE_LABEL, PLAYABLE_PIECE_TYPES, type PlayablePieceType } from '../core/pieces';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { authoredDeploymentForSide, replaceSideDeployment, rosterSize } from './levelDeployment';
import { InnerChromeBox } from './shared/ChromeBox';
import { Stepper } from './shared/Stepper';
import { Toggle } from './shared/Toggle';
import { ChromeButton } from './shared/ChromeButton';

export interface DeploymentZoneOption {
  id: string;
  label: string;
  type: ZoneType;
  /** Player Deployment zone only: piece types automatic placement will not put here (ADR-0366). */
  excludedPieceTypes: readonly PlayablePieceType[];
  paintedTiles: number;
  usableTileKeys: string[];
}

/**
 * The piece types an author can break off the general Player Deployment pool: each owns a
 * dedicated zone type, and each can be barred from the general zone (ADR-0366).
 */
const BREAKABLE = [
  { pieceType: 'pawn', label: 'Pawn', zoneType: 'player-pawn-spawn' },
  { pieceType: 'king', label: 'King', zoneType: 'player-king-spawn' },
] as const satisfies ReadonlyArray<{ pieceType: PlayablePieceType; label: string; zoneType: ZoneType }>;
export type BreakablePieceType = typeof BREAKABLE[number]['pieceType'];

/** Why an author would break this type off the general pool, in the author's own terms. */
const BREAKOUT_REASON: Record<BreakablePieceType, string> = {
  pawn: 'A pawn cannot change column, so squares whose column is a dead end are wasted on one.',
  king: 'The King starts where you paint for it — a keep, a back rank, a corner — instead of wherever the roll lands it.',
};

function patchedRoster(roster: Roster, type: PlayablePieceType, delta: number): Roster {
  const count = Math.max(0, (roster[type] ?? 0) + delta);
  const next = { ...roster };
  if (count === 0) delete next[type];
  else next[type] = count;
  return next;
}

function sideZoneType(side: ConditionSide): ZoneType {
  return side === 'player' ? 'player-spawn' : 'enemy-spawn';
}

function DeploymentSideCard({
  side,
  events,
  zones,
  fixedCount,
  runArmy,
  onEventsChange,
  onCreateZone,
  onEditZone,
  onDedicatedZoneChange,
}: {
  side: ConditionSide;
  events: LevelEvents;
  zones: readonly DeploymentZoneOption[];
  fixedCount: number;
  runArmy: boolean;
  onEventsChange: (events: LevelEvents) => void;
  onCreateZone: (side: ConditionSide) => void;
  onEditZone: (zoneId: string) => void;
  onDedicatedZoneChange: (pieceType: BreakablePieceType, on: boolean) => void;
}): ReactElement {
  const deployment = authoredDeploymentForSide(events, side);
  const expectedType = sideZoneType(side);
  const eligibleZones = zones.filter((zone) => zone.type === expectedType || deployment.zoneIds.includes(zone.id));
  const deploymentZone = eligibleZones.find((zone) => deployment.zoneIds.includes(zone.id) && zone.type === expectedType)
    ?? eligibleZones.find((zone) => zone.type === expectedType)
    ?? eligibleZones[0];
  const deploymentZoneIds = deploymentZone ? [deploymentZone.id] : [];
  const dedicatedZones = Object.fromEntries(BREAKABLE.map(({ pieceType, zoneType }) => [
    pieceType,
    side === 'player' ? zones.find((zone) => zone.type === zoneType) : undefined,
  ])) as Record<BreakablePieceType, DeploymentZoneOption | undefined>;
  // What an automatically placed unit of a broken-off type can actually use: the Player Deployment
  // zone unless it bars that type, plus every square of that type's dedicated zone.
  const eligibleSquares = Object.fromEntries(BREAKABLE.map(({ pieceType }) => [
    pieceType,
    new Set([
      ...(deploymentZone && !deploymentZone.excludedPieceTypes.includes(pieceType) ? deploymentZone.usableTileKeys : []),
      ...(dedicatedZones[pieceType]?.usableTileKeys ?? []),
    ]),
  ])) as Record<BreakablePieceType, Set<string>>;
  const title = side === 'player' ? 'Player force' : 'Enemy force';
  const sideLabel = side === 'player' ? 'Player' : 'Enemy';
  const fixedLabel = side === 'player'
    ? runArmy ? 'Fixed Battle allies' : 'Fixed player pieces'
    : 'Fixed enemy anchors';

  const setDeployment = (roster: Roster, zoneIds = deploymentZoneIds): void => {
    onEventsChange(replaceSideDeployment(events, side, { roster, zoneIds }));
  };
  const setEnabled = (enabled: boolean): void => {
    if (!enabled) {
      onEventsChange(replaceSideDeployment(events, side, null));
      return;
    }
    setDeployment({ pawn: 1 });
  };

  return (
    <InnerChromeBox className={`le-deployment-card is-${side}`} role="region" aria-labelledby={`le-${side}-deployment-title`}>
      <div className="le-deployment-card-head">
        <div>
          <h3 id={`le-${side}-deployment-title`}>{title}</h3>
          <p>{fixedLabel}: <strong>{fixedCount}</strong></p>
        </div>
        {runArmy ? (
          <span className="le-deployment-source is-run">Run army</span>
        ) : (
          <Toggle
            checked={deployment.enabled}
            label={`Toggle randomized ${side} force`}
            onChange={setEnabled}
          />
        )}
      </div>

      {runArmy ? (
        <>
          <div className="le-deployment-status is-active">
            <strong>Persistent Run army</strong>
            <span>Every army unit deploys through the authored Player starting zone. The active Run supplies its roster and seeded choices.</span>
          </div>
          <div className="le-deployment-zone-head">
            <div>
              <h4>Player starting zone</h4>
              <span>The Run army may start on any usable painted square in this zone.</span>
            </div>
            <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={() => deploymentZone ? onEditZone(deploymentZone.id) : onCreateZone(side)}>{deploymentZone ? 'Edit squares' : 'Create player starting zone'}</ChromeButton>
          </div>
          {deploymentZone ? (
            <div className="le-deployment-zones">
              <div data-chrome-unit="inner-list-row" className={chromeUnitClassNames('inner-list-row', 'le-deployment-zone-row', 'is-selected')}>
                <span><strong>{deploymentZone.label}</strong><small>{deploymentZone.paintedTiles} painted · {deploymentZone.usableTileKeys.length} usable</small></span>
                <span className="le-md-item-out">Used automatically</span>
              </div>
            </div>
          ) : (
            <p className="le-board-warning">No Player starting zone exists. Create and paint one before saving this War Battle.</p>
          )}

          {deploymentZone ? BREAKABLE.map(({ pieceType, label }) => {
            const zone = dedicatedZones[pieceType];
            const on = deploymentZone.excludedPieceTypes.includes(pieceType);
            const squares = eligibleSquares[pieceType].size;
            return (
              <div className="le-deployment-breakout" key={pieceType}>
                <div className="le-deployment-zone-head">
                  <div>
                    <h4>{label} starting zone</h4>
                    <span>{on
                      ? `The ${label} leaves the shared zone and starts only on squares painted here.`
                      : `The ${label} starts in the shared Player starting zone.`}</span>
                  </div>
                  <div className="le-deployment-breakout-controls">
                    {on ? (
                      <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={() => zone && onEditZone(zone.id)}>Edit squares</ChromeButton>
                    ) : null}
                    <Toggle
                      checked={on}
                      label={`Give the ${label} its own starting zone`}
                      onChange={(checked) => onDedicatedZoneChange(pieceType, checked)}
                    />
                  </div>
                </div>
                {on && zone ? (
                  <div className="le-deployment-zones">
                    <div data-chrome-unit="inner-list-row" className={chromeUnitClassNames('inner-list-row', 'le-deployment-zone-row', 'is-selected')}>
                      <span><strong>{zone.label}</strong><small>{zone.paintedTiles} painted · {zone.usableTileKeys.length} usable</small></span>
                      <span className="le-md-item-out">{label}s only</span>
                    </div>
                  </div>
                ) : null}
                {on && squares === 0 ? (
                  <p className="le-board-warning">{pieceType === 'king'
                    ? 'No square accepts the King. Paint this zone — a War Battle cannot be saved while the Run has nowhere to put its King.'
                    : 'No square accepts a pawn. Paint this zone, or every pawn in the Run army sits the Battle out in reserve.'}</p>
                ) : on ? (
                  <p className="le-deployment-zone-help">{squares} square{squares === 1 ? '' : 's'} currently accept{squares === 1 ? 's' : ''} the {label}. {BREAKOUT_REASON[pieceType]}</p>
                ) : null}
              </div>
            );
          }) : null}

          <p className="le-deployment-zone-help">
            The King takes its square first. Every other unit then follows in random order, one at a time, each taking what is still open to it — a pawn that finds its squares gone does not deploy and stays in reserve.
          </p>
        </>
      ) : deployment.enabled ? (
        <>
          <div className="le-deployment-status is-active">
            <strong>{rosterSize(deployment.roster)} randomized unit{rosterSize(deployment.roster) === 1 ? '' : 's'}</strong>
            <span>Fixed pieces remain anchored; the roster below fills the starting zone around them.</span>
          </div>
          {deployment.eventCount > 1 ? <p className="le-board-warning">This side had {deployment.eventCount} setup events. The next change consolidates them into one deployment.</p> : null}
          <div className="le-deployment-roster" aria-label={`${title} randomized roster`}>
            <h4>Randomized roster</h4>
            {PLAYABLE_PIECE_TYPES.map((type) => (
              <div className="le-ctrlrow le-roster-row" key={type}>
                <span className="le-ctrllabel">{PIECE_LABEL[type]}</span>
                <div className="le-roster-stepper">
                  <Stepper
                    value={deployment.roster[type] ?? 0}
                    suffix=""
                    decreaseLabel={`One fewer randomized ${PIECE_LABEL[type]}`}
                    increaseLabel={`One more randomized ${PIECE_LABEL[type]}`}
                    onDecrease={() => setDeployment(patchedRoster(deployment.roster, type, -1))}
                    onIncrease={() => setDeployment(patchedRoster(deployment.roster, type, 1))}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="le-deployment-zone-head">
            <div>
              <h4>{sideLabel} starting zone</h4>
              <span>{deploymentZone ? `${deploymentZone.usableTileKeys.length} usable squares for ${rosterSize(deployment.roster)} randomized units` : `No zone for ${rosterSize(deployment.roster)} randomized units`}</span>
            </div>
            <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={() => deploymentZone ? onEditZone(deploymentZone.id) : onCreateZone(side)}>{deploymentZone ? 'Edit squares' : `Create ${side === 'player' ? 'player' : 'enemy'} starting zone`}</ChromeButton>
          </div>
          <p className="le-deployment-zone-help">
            Randomized {side === 'player' ? 'player' : 'enemy'} units may start on any usable square painted in this zone. Its painted shape may be connected or split across the board.
          </p>
          {deploymentZone ? (
            <div className="le-deployment-zones">
              <div data-chrome-unit="inner-list-row" className={chromeUnitClassNames('inner-list-row', 'le-deployment-zone-row', 'is-selected')}>
                <span><strong>{deploymentZone.label}</strong><small>{deploymentZone.paintedTiles} painted · {deploymentZone.usableTileKeys.length} usable</small></span>
                <span className="le-md-item-out">Used automatically</span>
              </div>
            </div>
          ) : (
            <p className="le-board-warning">No {sideLabel} starting zone exists. Create and paint one, or turn randomized deployment off.</p>
          )}
        </>
      ) : (
        <>
          <div className="le-deployment-status">
            <strong>No randomized units</strong>
            <span>This side uses only its fixed painted pieces.</span>
          </div>
          <div className="le-deployment-zone-head">
            <div>
              <h4>{deploymentZone ? `Saved ${side === 'player' ? 'player' : 'enemy'} starting zone` : `No ${side === 'player' ? 'player' : 'enemy'} starting zone`}</h4>
              <span>{deploymentZone ? 'Kept for later; it does not place any units while randomization is off.' : 'A starting zone is not needed while randomization is off.'}</span>
            </div>
            {deploymentZone ? <ChromeButton unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')} onClick={() => onEditZone(deploymentZone.id)}>Edit squares</ChromeButton> : null}
          </div>
          {deploymentZone ? (
            <div className="le-deployment-zones">
              <div data-chrome-unit="inner-list-row" className={chromeUnitClassNames('inner-list-row', 'le-deployment-zone-row')}>
                <span><strong>{deploymentZone.label}</strong><small>{deploymentZone.paintedTiles} painted · {deploymentZone.usableTileKeys.length} usable</small></span>
                <span className="le-md-item-out">Not used</span>
              </div>
            </div>
          ) : null}
        </>
      )}
    </InnerChromeBox>
  );
}

export function LevelDeploymentEditor({
  events,
  zones,
  fixedPlayerCount,
  fixedEnemyCount,
  isWarBattle,
  onEventsChange,
  onCreateZone,
  onEditZone,
  onDedicatedZoneChange,
}: {
  events: LevelEvents;
  zones: readonly DeploymentZoneOption[];
  fixedPlayerCount: number;
  fixedEnemyCount: number;
  isWarBattle: boolean;
  onEventsChange: (events: LevelEvents) => void;
  onCreateZone: (side: ConditionSide) => void;
  onEditZone: (zoneId: string) => void;
  onDedicatedZoneChange: (pieceType: BreakablePieceType, on: boolean) => void;
}): ReactElement {
  return (
    <div className="le-deployment-editor">
      <header className="le-deployment-intro">
        <h3>Initial forces</h3>
        <p>Fixed pieces stay exactly where they are painted. Each randomized roster deploys into its side's starting zone when the Battle is created.</p>
      </header>
      <div className="le-deployment-columns">
        <DeploymentSideCard
          side="player"
          events={events}
          zones={zones}
          fixedCount={fixedPlayerCount}
          runArmy={isWarBattle}
          onEventsChange={onEventsChange}
          onCreateZone={onCreateZone}
          onEditZone={onEditZone}
          onDedicatedZoneChange={onDedicatedZoneChange}
        />
        <DeploymentSideCard
          side="enemy"
          events={events}
          zones={zones}
          fixedCount={fixedEnemyCount}
          runArmy={false}
          onEventsChange={onEventsChange}
          onCreateZone={onCreateZone}
          onEditZone={onEditZone}
          onDedicatedZoneChange={onDedicatedZoneChange}
        />
      </div>
    </div>
  );
}
