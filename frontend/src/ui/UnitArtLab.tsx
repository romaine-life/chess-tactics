import { useMemo, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { edgeTiles, muralTiles, tileAssets, tileFamilies, type TileAsset } from '../art/tileset';
import { UNIT_PALETTE_LABELS, UNIT_PALETTES, type UnitPalette } from '../core/pieces';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard, boardLabCellPosition } from '../render/BoardLabBoard';
import { ViewPane } from './shared/ViewPane';
import { FacingCompass } from './studioBoard';
import {
  MISSING_DIRECTION_SPRITE,
  familyLabels,
  hasDirectionSprite,
  rookDirections,
  unitAssets,
  type Direction,
  type UnitAsset,
} from './unitCatalog';
import { UnitStudioControls } from './UnitStudioControls';
import type { UnitArtPreview } from './UnitRecaptureEditor';
import { unitDeliveryRasterForAsset, useUnitSizeDraft } from './unitSizeTuning';

const UNIT_ART_GROUNDS = ['grass', 'stone', 'water'] as const;
type UnitArtGround = (typeof UNIT_ART_GROUNDS)[number];

const FORMATION: Array<{ x: number; y: number; palette: UnitPalette }> = [
  { x: 2, y: 1, palette: 'navy-blue' },
  { x: 5, y: 1, palette: 'crimson' },
  { x: 1, y: 3, palette: 'golden' },
  { x: 4, y: 3, palette: 'emerald' },
  { x: 2, y: 5, palette: 'black' },
  { x: 5, y: 5, palette: 'white' },
];

type UnitSeatStyle = CSSProperties & {
  '--unit-anchor-x': string;
  '--unit-anchor-y': string;
};

const cap = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

function negativeAnchor(value: string): string {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid live unit anchor: ${value}`);
  return `${-parsed}%`;
}

export function UnitArtLab({
  selectedUnit,
  direction,
  zoom,
  onDirection,
  onZoom,
  onSelectUnit,
  onCatalogChanged,
  header,
}: {
  selectedUnit: UnitAsset;
  direction: Direction;
  zoom: number;
  onDirection: (direction: Direction) => void;
  onZoom: (zoom: number) => void;
  onSelectUnit: (unitId: string) => void;
  onCatalogChanged: () => void;
  header?: ReactNode;
}): ReactElement {
  const [ground, setGround] = useState<UnitArtGround>('grass');
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [artPreview, setArtPreview] = useState<UnitArtPreview | null>(null);
  const sizes = useUnitSizeDraft();
  const deliveryRaster = unitDeliveryRasterForAsset(selectedUnit, sizes);
  const board = useMemo(
    () => solveSocketBoard({
      assets: tileAssets as readonly TileAsset[],
      terrainMap: Array.from({ length: 8 * 7 }, () => ground),
      seed: 4217,
      columns: 8,
      rows: 7,
      familyAssets: tileFamilies,
      edgeAssets: edgeTiles,
      muralEdges: muralTiles,
    }),
    [ground],
  );
  const production = unitAssets.filter((unit) => !unit.speculative);
  const candidates = unitAssets.filter((unit) => unit.speculative);
  const choices = [...production, ...candidates];
  const selectedIndex = choices.findIndex((unit) => unit.id === selectedUnit.id);
  const adjacentUnit = (step: -1 | 1): UnitAsset | undefined => {
    if (!choices.length) return undefined;
    const index = selectedIndex >= 0 ? selectedIndex : 0;
    return choices[(index + step + choices.length) % choices.length];
  };
  const previousUnit = adjacentUnit(-1);
  const nextUnit = adjacentUnit(1);
  const rotate = (): void => {
    const index = rookDirections.indexOf(direction);
    onDirection(rookDirections[(index + 1) % rookDirections.length] ?? 'south');
  };
  const spriteFor = (palette: UnitPalette): string => (
    artPreview?.sprites[palette]?.[direction]
    ?? (hasDirectionSprite(selectedUnit, direction)
      ? selectedUnit.sprite(palette, direction)
      : MISSING_DIRECTION_SPRITE)
  );

  return (
    <>
      <section className="al-lab-main unit-art-lab-main" aria-label={`${selectedUnit.label} board preview`}>
        <ViewPane
          kind="board"
          ariaLabel={`${selectedUnit.label} board preview`}
          zoom={zoom}
          pan={pan}
          minZoom={0.5}
          maxZoom={2}
          onZoomChange={onZoom}
          onPanChange={setPan}
        >
          <BoardLabBoard
            board={board}
            assetFrameSrc={(asset) => asset.src}
            boardZoom={zoom}
            boardPan={pan}
            className="unit-art-board-surface"
            ariaLabel={`${selectedUnit.label} board preview`}
          >
            {FORMATION.map(({ x, y, palette }) => {
              const { left, top } = boardLabCellPosition({ x, y });
              const style: UnitSeatStyle = {
                left,
                top,
                zIndex: x + y + 20000,
                '--unit-anchor-x': negativeAnchor(selectedUnit.unitAnchorX),
                '--unit-anchor-y': negativeAnchor(selectedUnit.unitAnchorY),
              };
              return (
                <span key={palette} className={`board-unit-seat is-${selectedUnit.family}`} style={style}>
                  <img
                    src={spriteFor(palette)}
                    alt={`${UNIT_PALETTE_LABELS[palette]} ${selectedUnit.label}`}
                    draggable={false}
                    style={{
                      width: `${artPreview?.width ?? deliveryRaster.width}px`,
                      height: `${artPreview?.height ?? deliveryRaster.height}px`,
                    }}
                  />
                </span>
              );
            })}
          </BoardLabBoard>
        </ViewPane>
      </section>

      <aside className="tileset-view-controls" aria-label="Unit art controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <div className="tileset-category-select unit-art-select" title="Which unit art is being edited.">
              <span>Unit</span>
              <span className="unit-art-select-row">
                <button
                  type="button"
                  aria-label="Previous unit"
                  title={previousUnit ? `Previous unit: ${previousUnit.label}` : 'Previous unit'}
                  disabled={choices.length < 2}
                  onClick={() => previousUnit && onSelectUnit(previousUnit.id)}
                >
                  &lt;
                </button>
                <select value={selectedUnit.id} onChange={(event) => onSelectUnit(event.target.value)} aria-label="Unit art">
                  <optgroup label="Production">
                    {production.map((unit) => <option key={unit.id} value={unit.id}>{familyLabels[unit.family]}</option>)}
                  </optgroup>
                  {candidates.length ? (
                    <optgroup label="Candidates">
                      {candidates.map((unit) => <option key={unit.id} value={unit.id}>{familyLabels[unit.family]} - {unit.label}</option>)}
                    </optgroup>
                  ) : null}
                </select>
                <button
                  type="button"
                  aria-label="Next unit"
                  title={nextUnit ? `Next unit: ${nextUnit.label}` : 'Next unit'}
                  disabled={choices.length < 2}
                  onClick={() => nextUnit && onSelectUnit(nextUnit.id)}
                >
                  &gt;
                </button>
              </span>
            </div>
            <label className="tileset-category-select" title="Board surface behind the unit preview.">
              <span>Ground</span>
              <select value={ground} onChange={(event) => setGround(event.target.value as UnitArtGround)} aria-label="Preview ground">
                {UNIT_ART_GROUNDS.map((value) => <option key={value} value={value}>{cap(value)}</option>)}
              </select>
            </label>
            <div className="tileset-catalog-facing">
              <span>Facing</span>
              <FacingCompass direction={direction} onSelect={onDirection} onRotate={rotate} />
            </div>
            <UnitStudioControls
              selectedUnit={selectedUnit}
              onSelectUnit={onSelectUnit}
              onCatalogChanged={onCatalogChanged}
              onArtPreview={setArtPreview}
            />
          </div>
        </section>
      </aside>
    </>
  );
}
