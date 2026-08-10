// The selected-level preview column (the Editor's and Campaign screen's 4th column). ONE
// implementation, shared so a level looks identical wherever it is previewed (ADR-0059).
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { FramedReadOnlyBoardView } from './shared/BoardViewFraming';
import { levelToEditorBoard } from '../core/levelBoard';
import { boardPalettes, LevelInfoCompact, levelBattleDealLine } from './LevelInfoCompact';
import type { Level } from '../core/level';
import { InnerChromeBox } from './shared/ChromeBox';
import { PieceTypeIcon } from './shared/PieceTypeIcon';
import { STRATEGIKON_CARD_MARK_CLASS, useStrategikonCardsIcon } from './strategikonNavigation';
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
  // What the player brings to a WAR BATTLE is the deal, not a roster: their army arrives from
  // their own collection as cards, so an ally unit count there is a 0 that means nothing. The
  // headline number is how many cards the Battle deals. A Campaign or standalone level fields
  // real allies on the map, and keeps counting them.
  const dealLine = levelBattleDealLine(level);
  // The colours each side wears on the very board beside this line, read from the projection the
  // renderer consumes — so the mark and the piece standing on the map are the same sprite.
  const palettes = boardPalettes(level);
  const cardsIconSrc = useStrategikonCardsIcon();
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
          {/* Small marks and small numerals over the night sky had nothing behind them to read
              against — whatever board art the backdrop was showing WAS their background. They sit
              on the same installed marble as the facts box below instead (ADR-0433), so the line
              has a settled surface of its own. Each side's mark is the piece the player actually
              meets on the board, in that side's own palette — not a glyph cut out of a mockup —
              and the card back is the one the player deals with. */}
          <InnerChromeBox className="ce-force-readout-box" fillRole="outer">
            <div className="ce-force-readout" aria-label="Level forces">
              {dealLine !== null ? (
                <span className="ce-force ce-force-cards"><img className={`ce-force-card ${STRATEGIKON_CARD_MARK_CLASS}`} src={cardsIconSrc} alt="" draggable={false} />Cards <strong>{dealLine}</strong></span>
              ) : (
                <span className="ce-force ce-force-ally"><PieceTypeIcon type="rook" palette={palettes.player} className="ce-force-unit" />Allies <strong>{allyCount}</strong></span>
              )}
              <span className="ce-force ce-force-enemy"><PieceTypeIcon type="rook" palette={palettes.enemy} className="ce-force-unit" />Enemies <strong>{enemyCount}</strong></span>
            </div>
          </InnerChromeBox>
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
        {/* The facts box is a structural box, so it wears the installed marble borrowed from
            the outer role (ADR-0433) — the same material the Editor's rows and the Run's
            Battle-preview boxes are painted with. The board frame above deliberately does NOT:
            the level art floats on the night sky there (ADR-0032/0067), and painting a surface
            behind it would put a slab of stone around the board. */}
        <LevelInfoCompact level={level} fillRole="outer" />
        {actions}
      </aside>
    </PaintedSurfaceBoundary>
  );
}
