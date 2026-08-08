import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { sectioUpcomingBattleIndex, type RunDocument } from '../run/model';
import { levelToEditorBoard } from '../core/levelBoard';
import { ChromeDivider, ChromeSurfaceFill, InnerChromeBox } from './shared/ChromeBox';
import { FramedReadOnlyBoardView } from './shared/BoardViewFraming';
import { LevelInfoCompact } from './LevelInfoCompact';
import { RunSceneViewport } from './RunWorkspace';
import { PaintedSurfaceBoundary } from './shell/PaintedSurfaceBoundary';

/**
 * The one title bar every box on this screen wears: a marble strip carrying the box's name and
 * the registered rule beneath it. One implementation so the three boxes cannot drift apart in
 * weight, treatment, or seam.
 */
function PreviewTitleBar({ id, children }: { id?: string; children: ReactNode }): ReactElement {
  return (
    <div className="run-battle-preview-titlebar">
      <ChromeSurfaceFill role="outer" className="run-battle-preview-titlebar-fill" />
      <header className="run-battle-preview-titlebar-head">
        <h2 id={id}>{children}</h2>
      </header>
      <ChromeDivider role="inner" className="run-battle-preview-titlebar-rule" />
    </div>
  );
}

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
          {/* The board box carries its own title bar, so the name belongs to the frame rather
              than floating above it. Both columns stretch to the one row, which is what makes
              their tops and bottoms agree; the pane FILLS the frame it is given (ADR-0201), so
              no surplus of the frame is left over to be painted as a band across the art. */}
          {/* The marble is painted by the TITLE STRIP, not by the frame. A frame-wide fill shows
              through anywhere the board does not cover — under a divider, in a row gap — which is
              the same bleeding band as an opaque padding. Bounding the paint to the strip means
              there is no such area: strip, then board, then border. */}
          <InnerChromeBox className="run-battle-preview-board-frame">
            <PreviewTitleBar id="run-battle-preview-title">{level.name}</PreviewTitleBar>
            <div className="ce-level-viewer run-battle-preview-board-view">
              <FramedReadOnlyBoardView
                board={board}
                viewKey={`${run.id}:${battleIndex}:${level.id}`}
                ariaLabel={`${level.name} upcoming Battle preview`}
                viewportMode="fill"
                showGrid
                onTerrainFirstFrame={() => setTerrainPainted(true)}
                onSceneFirstFrame={() => setScenePainted(true)}
                onFrameError={(value) => setFrameError(
                  value instanceof Error ? value : new Error(String(value)),
                )}
              />
            </div>
          </InnerChromeBox>

          <aside className="run-battle-preview-intelligence" aria-label="Upcoming Battle intelligence">
            <LevelInfoCompact
              level={level}
              showZones={false}
              // The marble the title bar and Controls rail are painted with: the installed
              // OUTER role material, borrowed under an inner frame (ADR-0433 borrowing rule).
              fillRole="outer"
              className="run-battle-preview-info"
              titleBar={(
                <PreviewTitleBar>Battle {battleIndex + 1} of {run.war.battles.length}</PreviewTitleBar>
              )}
            />
            <InnerChromeBox className="run-battle-preview-note" fillRole="outer">
              <PreviewTitleBar>Before deployment</PreviewTitleBar>
              <p>
                Fixed pieces appear on the map. The Forces ledger also counts setup forces whose
                exact squares are dealt when the Battle begins. Your Run army deploys after you
                leave the Sectio — {run.cards.length} formation
                {run.cards.length === 1 ? '' : 's'} deploy with you.
              </p>
            </InnerChromeBox>
          </aside>
        </div>
      </PaintedSurfaceBoundary>
    </RunSceneViewport>
  );
}
