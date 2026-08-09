import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { runDeploymentDealCount, sectioUpcomingBattleIndex, type RunDocument } from '../run/model';
import {
  playerDeploymentCells,
  runDeploymentLevelUnits,
  shuffledDeploymentPreview,
} from '../run/deployment';
import { levelToEditorBoard, unitsForLevelUnits } from '../core/levelBoard';
import { ChromeDividedGridRow, DividedInnerChromeBox } from './shared/ChromeDividedGrid';
import { RunProgressIcon } from './shared/RunProgressIcon';
import { FramedReadOnlyBoardView } from './shared/BoardViewFraming';
import { LevelInfoCompact } from './LevelInfoCompact';
import { RunSceneViewport } from './RunWorkspace';
import { PaintedSurfaceBoundary } from './shell/PaintedSurfaceBoundary';

/**
 * Sectio-only reconnaissance of the next canonical War Level. This is deliberately a read-only
 * Level projection: it neither prepares Deployment nor resolves the Run army or enemy setup
 * squares ahead of the transition that owns them.
 */
export function RunBattlePreview({ run }: { run: RunDocument }): ReactElement {
  // Reconnaissance is of the Battle this Sectio leads INTO. `run.battleIndex` still names the
  // Battle just fought while the Sectio is open, so reading it directly previews the last map.
  const battleIndex = sectioUpcomingBattleIndex(run);
  const level = run.war.battles[battleIndex].level;
  // The canonical runtime answer, not a re-derivation: what Deployment will actually deal here.
  // A deck smaller than the deal is dealt whole, so the note never promises cards that do not exist.
  const dealt = Math.min(runDeploymentDealCount({ war: run.war, battleIndex }), run.cards.length);
  const authoredBoard = useMemo(() => levelToEditorBoard(level), [level]);
  const signature = useMemo(() => JSON.stringify(level), [level]);
  // One arrangement this Battle could open with, and never the one it will. Zero is the ground
  // the reconnaissance stands on: the authored map, with nothing of the player's on it. Every
  // press is a new imagining, so the number is the state and pressing again is the reshuffle.
  const [shuffle, setShuffle] = useState(0);
  const preview = useMemo(
    () => (shuffle > 0 ? shuffledDeploymentPreview({ run, level, battleIndex, shuffle }) : null),
    [battleIndex, level, run, shuffle],
  );
  // The Run's figures are laid over the authored board's own unit snapshot rather than into the
  // Level: a board built from `boardCode` reads its units from that code, so a level carrying
  // extra units would render without a single one of them.
  const board = useMemo(() => (preview
    ? {
      ...authoredBoard,
      units: {
        ...authoredBoard.units,
        ...unitsForLevelUnits(runDeploymentLevelUnits(run, level, preview.layout)),
      },
    }
    : authoredBoard), [authoredBoard, level, preview, run]);
  // How much of the player's collection this stage takes, and where it goes. Both are the
  // stage's own answer, and neither is visible anywhere else in the Sectio — the Forces ledger
  // counts the map's pieces, not the ones arriving from the Chartulary.
  const dealCount = runDeploymentDealCount({ war: run.war, battleIndex });
  // A stage can ask for more than the player is carrying — an early Run holds two cards against
  // a deal of three — so the sentence must not read a fraction off a smaller hand.
  const held = run.cards.length;
  const dealtLine = held <= dealCount
    ? `this stage deals up to ${dealCount}, so every card you hold comes with you`
    : `this stage deals ${dealCount} of the ${held} cards you hold`;
  // The same squares `resolveDeploymentCapacity` counts when it decides how many dealt cards fit,
  // so the band drawn here IS the band admission is measured against.
  const bandCells = useMemo(
    () => new Set(playerDeploymentCells(level).map((cell) => `${cell.x},${cell.y}`)),
    [level],
  );
  // Shown by default: the band is the answer to the first question a player asks of a map they
  // are about to fight on. The Zone row turns it off for an unobstructed look at the ground.
  const [bandShown, setBandShown] = useState(true);
  const [terrainPainted, setTerrainPainted] = useState(false);
  const [scenePainted, setScenePainted] = useState(false);
  const [frameError, setFrameError] = useState<Error | null>(null);

  useEffect(() => {
    setTerrainPainted(false);
    setScenePainted(false);
    setFrameError(null);
    // A different map is a different question, so the imagining does not carry over onto it.
    setShuffle(0);
  }, [signature]);

  const resetFrame = (): void => {
    setTerrainPainted(false);
    setScenePainted(false);
    setFrameError(null);
  };

  return (
    <RunSceneViewport
      scene={{
        view: 'battle-preview',
        className: 'run-battle-preview-workspace',
        contentClassName: 'run-battle-preview-content',
        // The pane IS this screen's surface, not a plate laid on it: it reaches the workspace
        // boundary on every side, the way the Strategikon's own sheet does.
        edgeAttached: true,
        testId: 'run-battle-preview-workspace',
        ariaLabelledBy: 'run-battle-preview-title',
      }}
    >
      <PaintedSurfaceBoundary
        surface={`run-battle-preview:${run.id}:${battleIndex}`}
        signature={signature}
        readyToCompose={terrainPainted && scenePainted}
        error={frameError}
        loadingLabel="Preparing upcoming Battle…"
        onRetry={resetFrame}
        className="run-battle-preview-surface"
      >
        {/* ONE pane, filled, with rails instead of gaps. Three separate boxes left strips of the
            page showing between them; this is a single divided box whose own grid draws every
            separation — the vertical rail at the column line runs the full height, through the
            header band AND between the board and the readout, and the horizontal rail under the
            header is one unbroken line across the whole pane. Junctions where they cross are the
            grid's, not hand-placed (ADR-0059: the divided grid is the primitive for this). */}
        <DividedInnerChromeBox
          className="run-battle-preview-pane"
          columns={['minmax(0, 1fr)', 'minmax(300px, 34%)']}
          framed={false}
          fillRole="outer"
          aria-label="Upcoming Battle reconnaissance"
        >
          <ChromeDividedGridRow className="run-battle-preview-headers">
            <header className="run-battle-preview-header">
              <h2 id="run-battle-preview-title">{level.name}</h2>
            </header>
            <header className="run-battle-preview-header">
              <h2>
                {/* The Run's own Battle mark, the same one the title bar carries — reconnaissance
                    of a Battle is named by the thing a Battle is named by. */}
                <RunProgressIcon variant="battle" className="run-battle-preview-battle-icon" />
                Battle {battleIndex + 1} of {run.war.battles.length}
              </h2>
            </header>
          </ChromeDividedGridRow>

          <ChromeDividedGridRow className="run-battle-preview-body">
            <div className="ce-level-viewer run-battle-preview-board-view">
              <FramedReadOnlyBoardView
                board={board}
                viewKey={`${run.id}:${battleIndex}:${level.id}`}
                ariaLabel={`${level.name} upcoming Battle preview`}
                viewportMode="fill"
                showGrid
                // Where the player's own force lands, drawn as the registered ZONE overlay in the
                // Player Deployment accent — the same tinted diamond with its own outline that the
                // Level Editor paints this very zone with. A move highlight would have been a
                // second language for a fact the board already has a drawing for, and reads as an
                // invented slab because it has no per-square edge.
                renderCellOverlay={bandShown
                  ? (cell) => bandCells.has(`${cell.x},${cell.y}`)
                    ? <span className="le-zone-cell le-zone-player" aria-hidden="true" />
                    : null
                  : undefined}
                onTerrainFirstFrame={() => setTerrainPainted(true)}
                onSceneFirstFrame={() => setScenePainted(true)}
                onFrameError={(value) => setFrameError(
                  value instanceof Error ? value : new Error(String(value)),
                )}
              />
            </div>

            {/* The readout takes no frame of its own — the pane's rail is already its left edge,
                and a box inside a bounded column would draw the same line twice. The note that
                used to be a third box is now this column's last section, so the column reads as
                one continuous ledger rather than two stacked plates. */}
            <aside className="run-battle-preview-intelligence" aria-label="Upcoming Battle intelligence">
              <LevelInfoCompact
                level={level}
                showZones={false}
                framed={false}
                className="run-battle-preview-info"
                deploymentBand={{ shown: bandShown, onToggle: () => setBandShown((shown) => !shown) }}
                deploymentPreview={{
                  shown: preview !== null,
                  placedUnitCount: preview?.placedUnitCount ?? 0,
                  placedCardCount: preview?.cards.filter((entry) => entry.placed).length ?? 0,
                  onShuffle: () => setShuffle((current) => current + 1),
                  onClear: () => setShuffle(0),
                }}
              />
              <section className="ce-li-zones-row run-battle-preview-note">
                <span className="ce-li-title">Before deployment</span>
                <p className="ce-li-zones">
                  Fixed pieces appear on the map. The Forces ledger also counts setup forces whose
                  exact squares are dealt when the Battle begins. Your own army arrives after you
                  leave the Sectio: {dealtLine}, onto the lit band.
                  {preview
                    ? ' What stands there now is one way that could fall, dealt fresh and seated at'
                      + ' random by the rules Deployment will use — not the hand you will be given.'
                      + ' Shuffle again for another.'
                    : ''}
                </p>
              </section>
            </aside>
          </ChromeDividedGridRow>
        </DividedInnerChromeBox>
      </PaintedSurfaceBoundary>
    </RunSceneViewport>
  );
}
