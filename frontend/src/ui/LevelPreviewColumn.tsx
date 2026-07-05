// The selected-level preview column (the Editor's and Campaign screen's 4th column). ONE
// implementation, shared so a level looks identical wherever it's previewed (ADR-0059): a
// two-line head (name + ally/enemy forces), the board in a kit box floating on the world
// background (ADR-0067), the compact level info stacked beneath, and a caller-supplied actions
// block (Edit/Test in the editor, Play on the play screen).
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { bakeBoardPaintedImage } from '../render/bakeBoardThumbnail';
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
  // Bake the board's dense SOLID region to an image (headroom + diamond corners cropped off), then
  // fill the box with it via object-fit:cover below. A solid crop cover-fitted covers the box with
  // board and can never show a transparent corner as sky — the skirmish fill, no pan/zoom math.
  // Async (awaits sprite decode); re-bakes + revokes the object URL on level change.
  const [boardImg, setBoardImg] = useState<string | null>(null);
  useEffect(() => {
    if (!board) { setBoardImg(null); return; }
    let cancelled = false;
    let created: string | null = null;
    setBoardImg(null);
    bakeBoardPaintedImage(board, { scale: 2 })
      .then((res) => {
        if (cancelled) { if (res) URL.revokeObjectURL(res.url); return; }
        if (res) { created = res.url; setBoardImg(res.url); }
      })
      .catch(() => {});
    return () => { cancelled = true; if (created) URL.revokeObjectURL(created); };
  }, [board]);
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
      {/* Map preview: the board in a kit box, floating on the level's world (night-sky) background —
          no checkerboard, no letterbox padding (ADR-0067). A baked still (no animation clock): a
          preview shouldn't run a per-frame loop while the screen is open. */}
      {board ? (
        <div className="ce-preview-frame">
          <div className="ce-level-viewer">
            {boardImg ? <img className="ce-level-viewer-board" src={boardImg} alt={`${level.name} board`} /> : null}
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
