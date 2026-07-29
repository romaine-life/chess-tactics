// The selected-level preview column (the Editor's and Campaign screen's 4th column). ONE
// implementation, shared so a level looks identical wherever it's previewed (ADR-0059): a
// two-line head (name + ally/enemy forces), the board in a kit box floating on the world
// background (ADR-0067) through the shared board-relative camera (ADR-0189), the compact level
// info stacked beneath, and a caller-supplied actions block.
import { useMemo, type ReactElement, type ReactNode } from 'react';
import { FramedReadOnlyBoardView } from './shared/BoardViewFraming';
import { levelToEditorBoard } from '../core/levelBoard';
import { LevelInfoCompact } from './LevelInfoCompact';
import type { Level } from '../core/level';
import { installedUiMedia } from './installedUiMedia';
import { InnerChromeBox } from './shared/ChromeBox';

export function LevelPreviewColumn({
  level,
  title,
  embedded = false,
  actions,
}: {
  level: Level;
  /** Heading over the preview — e.g. "Level 3: River Crossing". */
  title: string;
  /** True inside the persistent menu shell (a menu-dest column); false on the legacy standalone route. */
  embedded?: boolean;
  /** The verbs under the info (Edit/Test in the editor, Play on the play screen). Rendered as-is. */
  actions?: ReactNode;
}): ReactElement {
  // The board is derived the SAME way the list thumbnails and the editor derive theirs (prefers
  // boardCode, falls back to layers), so the preview, a row's thumbnail, and the editor all agree.
  const board = useMemo(() => levelToEditorBoard(level), [level]);
  const allyCount = level.layers.units.filter((u) => u.side === 'player').length;
  const enemyCount = level.layers.units.filter((u) => u.side === 'enemy').length;

  return (
    <aside className={embedded ? 'menu-dest-col menu-dest-preview ce-preview-col' : 'ce-editor-preview-col ce-preview-col'} aria-label="Selected level">
      <div className="ce-selected-head">
        <h2>{title}</h2>
        <div className="ce-force-readout" aria-label="Level forces">
          <span className="ce-force ce-force-ally"><img src={installedUiMedia('ui-main-menu-profile-rook-blue-png')} alt="" />Allies <strong>{allyCount}</strong></span>
          <span className="ce-force ce-force-enemy"><img src={installedUiMedia('ui-main-menu-profile-rook-red-png')} alt="" />Enemies <strong>{enemyCount}</strong></span>
        </div>
      </div>
      {/* The registered inner box owns chrome around a live preview with Play's exact pane shape.
          Opening composition and accepted-art safety remain independent (ADR-0067/0082/0202). */}
      {board ? (
        <InnerChromeBox className="ce-preview-frame">
          <div className="ce-level-viewer">
            <FramedReadOnlyBoardView
              board={board}
              viewKey={level.id}
              ariaLabel={`${level.name} board`}
            />
          </div>
        </InnerChromeBox>
      ) : null}
      {/* Level info stacked UNDER the map: the derived facts — grid size, time, forces, terrain,
          zones, win rule — filling the column's lower half. */}
      <LevelInfoCompact level={level} />
      {actions}
    </aside>
  );
}
