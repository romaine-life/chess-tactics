// The selected-level preview column (the Editor's and Campaign screen's 4th column). ONE
// implementation, shared so a level looks identical wherever it's previewed (ADR-0059): a
// two-line head (name + ally/enemy forces), the board in a kit box floating on the world
// background (ADR-0067), the compact level info stacked beneath, and a caller-supplied actions
// block (Edit/Test in the editor, Play on the play screen).
import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { StudioReadOnlyBoard } from '../render/StudioReadOnlyBoard';
import { ViewPane } from './shared/ViewPane';
import { levelToEditorBoard } from '../core/levelBoard';
import { LevelInfoCompact } from './LevelInfoCompact';
import type { Level } from '../core/level';

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
  // The viewer is the LIVE board (pan/zoom) rendered through the SAME read-only renderer the
  // editor uses, inside the shared ViewPane — the pre-#409 framing: the whole board at a calm
  // 0.5x, floating on the night sky, not a baked crop zoomed into the board's center. Static
  // frame (no animation clock): a preview shouldn't run a per-frame loop while the screen is open.
  const [viewZoom, setViewZoom] = useState(0.5);
  const [viewPan, setViewPan] = useState({ x: 0, y: 0 });
  const allyCount = level.layers.units.filter((u) => u.side === 'player').length;
  const enemyCount = level.layers.units.filter((u) => u.side === 'enemy').length;

  return (
    <aside className={embedded ? 'menu-dest-col menu-dest-preview ce-preview-col' : 'ce-editor-preview-col ce-preview-col'} aria-label="Selected level">
      <div className="ce-selected-head">
        <h2>{title}</h2>
        <div className="ce-force-readout" aria-label="Level forces">
          <span className="ce-force ce-force-ally"><img src="/assets/ui/main-menu/profile-rook-blue.png" alt="" />Allies <strong>{allyCount}</strong></span>
          <span className="ce-force ce-force-enemy"><img src="/assets/ui/main-menu/profile-rook-red.png" alt="" />Enemies <strong>{enemyCount}</strong></span>
        </div>
      </div>
      {/* Map preview: the live board in a kit box, floating on the level's world (night-sky)
          background — no checkerboard, no letterbox padding (ADR-0067). The viewport stops at the
          panel's hand-tuned Fill box; the line frame overlays it (see .ce-level-viewer CSS). */}
      {board ? (
        <div className="ce-preview-frame">
          <div className="ce-level-viewer">
            <ViewPane
              kind="board"
              ariaLabel={`${level.name} board`}
              zoom={viewZoom}
              pan={viewPan}
              minZoom={0.2}
              maxZoom={2}
              onZoomChange={setViewZoom}
              onPanChange={setViewPan}
            >
              <div className="tileset-view-board-content is-board">
                <StudioReadOnlyBoard board={board} boardZoom={viewZoom} boardPan={viewPan} ariaLabel={`${level.name} board`} />
              </div>
            </ViewPane>
          </div>
        </div>
      ) : null}
      {/* Level info stacked UNDER the map: the derived facts — grid size, time, forces, terrain,
          zones, win rule — filling the column's lower half. */}
      <LevelInfoCompact level={level} />
      {actions}
    </aside>
  );
}
