// The selected-level preview column (the Editor's and Campaign screen's 4th column). ONE
// implementation, shared so a level looks identical wherever it is previewed (ADR-0059).
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { FramedReadOnlyBoardView } from './shared/BoardViewFraming';
import { levelToEditorBoard } from '../core/levelBoard';
import { LevelInfoCompact } from './LevelInfoCompact';
import type { Level } from '../core/level';
import { installedUiMedia } from './installedUiMedia';
import { InnerChromeBox } from './shared/ChromeBox';
import { PaintedSurfaceBoundary } from './shell/PaintedSurfaceBoundary';

export function LevelPreviewColumn({
  level,
  title,
  embedded = false,
  actions,
  onPaintedChange,
}: {
  level: Level;
  title: string;
  embedded?: boolean;
  actions?: ReactNode;
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
      <aside className={embedded ? 'menu-dest-col menu-dest-preview ce-preview-col' : 'ce-editor-preview-col ce-preview-col'} aria-label="Selected level">
        <div className="ce-selected-head">
          <h2>{title}</h2>
          <div className="ce-force-readout" aria-label="Level forces">
            <span className="ce-force ce-force-ally"><img src={installedUiMedia('ui-main-menu-profile-rook-blue-png')} alt="" />Allies <strong>{allyCount}</strong></span>
            <span className="ce-force ce-force-enemy"><img src={installedUiMedia('ui-main-menu-profile-rook-red-png')} alt="" />Enemies <strong>{enemyCount}</strong></span>
          </div>
        </div>
        {board ? (
          <InnerChromeBox className="ce-preview-frame">
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
          </InnerChromeBox>
        ) : null}
        <LevelInfoCompact level={level} />
        {actions}
      </aside>
    </PaintedSurfaceBoundary>
  );
}
