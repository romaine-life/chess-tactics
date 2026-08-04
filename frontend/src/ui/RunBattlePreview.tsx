import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { RunDocument } from '../run/model';
import { levelToEditorBoard } from '../core/levelBoard';
import { InnerChromeBox } from './shared/ChromeBox';
import { FramedReadOnlyBoardView } from './shared/BoardViewFraming';
import { LevelInfoCompact } from './LevelInfoCompact';
import { RunSceneViewport } from './RunWorkspace';
import { PaintedSurfaceBoundary } from './shell/PaintedSurfaceBoundary';

/**
 * Shop-only reconnaissance of the next canonical War Level. This is deliberately a read-only
 * Level projection: it neither prepares Deployment nor resolves the Run army or enemy setup
 * squares ahead of the transition that owns them.
 */
export function RunBattlePreview({ run }: { run: RunDocument }): ReactElement {
  const level = run.war.battles[run.battleIndex].level;
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
        surface={`run-battle-preview:${run.id}:${run.battleIndex}`}
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
              Upcoming Battle · {run.battleIndex + 1} of {run.war.battles.length}
            </span>
            <h2 id="run-battle-preview-title">{level.name}</h2>
            <p>Drag to pan · scroll to zoom</p>
          </header>

          <InnerChromeBox className="run-battle-preview-board-frame">
            <div className="ce-level-viewer run-battle-preview-board-view">
              <FramedReadOnlyBoardView
                board={board}
                viewKey={`${run.id}:${run.battleIndex}:${level.id}`}
                ariaLabel={`${level.name} upcoming Battle preview`}
                onTerrainFirstFrame={() => setTerrainPainted(true)}
                onSceneFirstFrame={() => setScenePainted(true)}
                onFrameError={(value) => setFrameError(
                  value instanceof Error ? value : new Error(String(value)),
                )}
              />
            </div>
          </InnerChromeBox>

          <aside className="run-battle-preview-intelligence" aria-label="Upcoming Battle intelligence">
            <LevelInfoCompact level={level} />
            <InnerChromeBox className="run-battle-preview-note">
              <h3>Before deployment</h3>
              <p>
                Fixed pieces appear on the map. The Forces ledger also counts setup forces whose
                exact squares are dealt when the Battle begins. Your Run army deploys after you
                leave the Shop.
              </p>
            </InnerChromeBox>
          </aside>
        </div>
      </PaintedSurfaceBoundary>
    </RunSceneViewport>
  );
}
