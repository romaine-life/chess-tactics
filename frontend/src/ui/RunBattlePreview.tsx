import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { sectioUpcomingBattleIndex, type RunDocument } from '../run/model';
import { levelToEditorBoard } from '../core/levelBoard';
import { InnerChromeBox } from './shared/ChromeBox';
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
  const board = useMemo(() => levelToEditorBoard(level), [level]);
  const signature = useMemo(() => JSON.stringify(level), [level]);
  const [terrainPainted, setTerrainPainted] = useState(false);
  const [scenePainted, setScenePainted] = useState(false);
  const [frameError, setFrameError] = useState<Error | null>(null);

  useEffect(() => {
    setTerrainPainted(false);
    setScenePainted(false);
    setFrameError(null);
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
        <div className="run-battle-preview-layout">
          <header className="run-battle-preview-head">
            <span className="skirmish-eyebrow">
              Upcoming Battle · {battleIndex + 1} of {run.war.battles.length}
            </span>
            <h2 id="run-battle-preview-title">{level.name}</h2>
            <p>Drag to pan · scroll to zoom</p>
          </header>

          {/* The frame HUGS the canonical 4:3 drawable window rather than stretching to the
              column, so the level art meets the chrome on all four sides. A stretched frame
              seats a centred 4:3 pane inside itself and paints the surplus as a flat opaque
              band across the artwork (ADR-0192/ADR-0259). */}
          <div className="run-battle-preview-board-seat">
            <InnerChromeBox className="run-battle-preview-board-frame">
              <div className="ce-level-viewer run-battle-preview-board-view">
                <FramedReadOnlyBoardView
                  board={board}
                  viewKey={`${run.id}:${battleIndex}:${level.id}`}
                  ariaLabel={`${level.name} upcoming Battle preview`}
                  onTerrainFirstFrame={() => setTerrainPainted(true)}
                  onSceneFirstFrame={() => setScenePainted(true)}
                  onFrameError={(value) => setFrameError(
                    value instanceof Error ? value : new Error(String(value)),
                  )}
                />
              </div>
            </InnerChromeBox>
          </div>

          <aside className="run-battle-preview-intelligence" aria-label="Upcoming Battle intelligence">
            <LevelInfoCompact level={level} />
            <InnerChromeBox className="run-battle-preview-note">
              <h3>Before deployment</h3>
              <p>
                Fixed pieces appear on the map. The Forces ledger also counts setup forces whose
                exact squares are dealt when the Battle begins. Your Run army deploys after you
                leave the Sectio.
              </p>
            </InnerChromeBox>
          </aside>
        </div>
      </PaintedSurfaceBoundary>
    </RunSceneViewport>
  );
}
