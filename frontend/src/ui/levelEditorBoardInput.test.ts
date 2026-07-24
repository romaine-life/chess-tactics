// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const levelEditor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const levelEditorControls = readFileSync(new URL('./LevelEditorChromeConsumers.tsx', import.meta.url), 'utf8');
const viewPane = readFileSync(new URL('./shared/ViewPane.tsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

const editableBoardStart = levelEditor.indexOf('function StudioEditableBoard({');
const editableBoardEnd = levelEditor.indexOf('\n// ---------------------------------------------------------------------------', editableBoardStart);
const editableBoard = levelEditor.slice(editableBoardStart, editableBoardEnd);

describe('Level Editor board pointer contract', () => {
  it('reserves context menus for viewport panning instead of destructive shortcuts', () => {
    expect(editableBoardStart).toBeGreaterThanOrEqual(0);
    expect(editableBoardEnd).toBeGreaterThan(editableBoardStart);
    expect(editableBoard).not.toContain('onContextMenu=');
    expect(levelEditor.toLowerCase()).not.toContain('right-click');
    expect(levelEditor.toLowerCase()).not.toContain('right click');

    expect(viewPane.match(/onContextMenu=/g)).toHaveLength(1);
    expect(viewPane).toContain('onContextMenu={(event) => event.preventDefault()}');
  });

  it('lets only the primary button reach each editable hit target', () => {
    const lines = editableBoard.split('\n');
    const pointerDownLines = lines
      .map((line, index) => line.includes('onPointerDown={(event) => {') ? index : -1)
      .filter((index) => index >= 0);

    // Playable cells, scenic cells, wall faces, doodad bodies, prop bodies, and floating artwork.
    expect(pointerDownLines).toHaveLength(6);
    for (const lineIndex of pointerDownLines) {
      const handlerPrefix = lines.slice(lineIndex, lineIndex + 8).join('\n');
      expect(handlerPrefix).toMatch(
        /onPointerDown=\{\(event\) => \{[\s\S]*?if \(event\.button !== 0(?: \|\| !interactive)?\) return;[\s\S]*?event\.stopPropagation\(\);/,
      );
    }
  });

  it('keeps the registered erase slot configurable as the artwork delete-selected action', () => {
    const eraseButton = levelEditorControls.match(
      /<button\b[^>]*data-chrome-unit="inner-erase-tool"[\s\S]*?<\/button>/,
    )?.[0];

    expect(eraseButton).toBeDefined();
    expect(eraseButton).toContain("chromeUnitClassNames('inner-erase-tool'");
    expect(eraseButton).toContain("onClick={() => onToolChange('erase')}");
    expect(eraseButton).toContain('disabled={eraseDisabled}');
    expect(eraseButton).toContain('aria-label={eraseLabel}');
    expect(levelEditor).toContain("eraseLabel={brushKind === 'artwork' ? 'Delete selected artwork' : 'Erase'}");
    expect(levelEditor).toContain("if (brushKind === 'artwork' && nextTool === 'erase')");
    expect(levelEditor).toContain('if (selectedArtworkId) deleteArtwork(selectedArtworkId);');
  });

  it('reports the live shared viewport size for projection-aware editor actions', () => {
    expect(viewPane).toContain('onViewportSizeChange?: (size: ViewPaneViewportSize) => void;');
    expect(viewPane).toContain('const viewport = { width: stage.clientWidth, height: stage.clientHeight };');
    expect(viewPane).toContain('onViewportSizeChange?.(viewport);');
    expect(viewPane).toContain('const observer = new ResizeObserver(updateMinimum);');
  });

  it('centers an image-sized invisible hit target instead of inventing a placement diamond or tile seat', () => {
    const artworkHitStart = editableBoard.indexOf('key={`artwork-hit-${placement.id}`}');
    const artworkHitEnd = editableBoard.indexOf('onPointerDown={(event) => {', artworkHitStart);
    const artworkHit = editableBoard.slice(artworkHitStart, artworkHitEnd);
    expect(artworkHitStart).toBeGreaterThanOrEqual(0);
    expect(artworkHitEnd).toBeGreaterThan(artworkHitStart);
    expect(artworkHit).toContain('className={`tileset-doodad-hit le-floating-artwork-hit');
    expect(artworkHit).toContain('width: hitWidth');
    expect(artworkHit).toContain('height: hitHeight');
    expect(editableBoard).toContain('sourceSprite.w * sourceScale');
    expect(editableBoard).toContain('sourceSprite.h * sourceScale');
    expect(artworkHit).toContain("background: 'transparent'");
    expect(artworkHit).toContain("transform: 'translate(-50%, -50%)'");
    expect(artworkHit).toContain('left: placement.pixelX');
    expect(artworkHit).toContain('top: placement.pixelY');
    expect(artworkHit).toContain('zIndex: 1_100_000 + index');
    expect(artworkHit).not.toContain('clipPath');
    expect(levelEditor).not.toContain('le-scenic-artwork-contact');
    expect(levelEditor).not.toContain('le-scenic-artwork-hit');
  });

  it('places artwork through a viewport-sized free-placement surface, never a tile painter', () => {
    const freeSurfaceStart = levelEditor.indexOf('className="le-artwork-free-placement-surface"');
    const freeSurfaceEnd = levelEditor.indexOf('/>', freeSurfaceStart);
    const freeSurface = levelEditor.slice(freeSurfaceStart, freeSurfaceEnd);

    expect(freeSurfaceStart).toBeGreaterThanOrEqual(0);
    expect(freeSurface).toContain('data-testid="artwork-free-placement-surface"');
    expect(freeSurface).toContain('event.clientX - (rect.left + rect.width / 2) - viewPan.x');
    expect(freeSurface).toContain('/ viewZoom - artworkBoardOrigin.originLeft');
    expect(freeSurface).toContain('event.clientY - (rect.top + rect.height / 2) - viewPan.y');
    expect(freeSurface).toContain('/ viewZoom - artworkBoardOrigin.originTop');
    expect(levelEditor).toContain("if (brushKind === 'artwork') return;");
    expect(editableBoard).not.toContain('exactScenePixelAtPointer');
    expect(editableBoard).not.toContain('artworkBrush ?');
  });

  it('removes tile selection, zone, and tactical chrome while artwork owns the viewport', () => {
    expect(editableBoard).toContain(
      'const isSelected = !artworkEditing && selectedCell?.x === x && selectedCell?.y === y;',
    );
    expect(editableBoard).toContain('const tacticalState = !artworkEditing && tacticalPreview ? [');
    expect(editableBoard).toContain('{!artworkEditing && placedZones[key] ?');
  });

  it('locks controls to an explicit artwork selection and separates Select from Move', () => {
    expect(levelEditor).toMatch(/const toolForLayer[\s\S]*?\|\| layer === 'artwork'[\s\S]*?\? 'select' : 'brush';/);
    expect(levelEditor).toContain("const disarming = artworkBrushId === asset.id && tool === 'brush';");
    expect(levelEditor).toContain("setTool(disarming ? 'select' : 'brush');");
    expect(levelEditor).toContain("{ value: '', label: 'None' }");
    expect(levelEditor).toContain('ariaLabel="Selected artwork"');
    expect(levelEditor).toContain("value={selectedArtworkId ?? ''}");
    expect(levelEditor).toContain('setSelectedArtworkId(id || null);');
    expect(editableBoard).toContain("const canSelect = artworkSelectionActive && tool === 'select';");
    expect(editableBoard).toContain("const canMove = tool === 'move' && selected;");
    expect(editableBoard).toContain("${canSelect ? ' is-selectable' : ''}");
    expect(editableBoard).toMatch(/if \(canSelect\) \{\s+onSelectArtwork\?\.\(placement\.id\);\s+return;\s+\}\s+event\.currentTarget\.setPointerCapture/);
    expect(levelEditor).toContain('const [artworkSelectionActive, setArtworkSelectionActive] = useState(false);');
    expect(levelEditor).toMatch(/if \(brushKind === 'artwork' && nextTool === 'select'\) \{[\s\S]*?if \(artworkSelectionActive\) \{[\s\S]*?setArtworkSelectionActive\(false\);[\s\S]*?setSelectedArtworkId\(null\);[\s\S]*?\} else \{[\s\S]*?setArtworkSelectionActive\(true\);[\s\S]*?setTool\('select'\);/);
    expect(levelEditor).toContain("tool === 'select' && !artworkSelectionActive");
    expect(styles).toContain('.le-floating-artwork-hit.is-selectable');
    expect(styles).toContain('outline: 2px dashed');
    expect(styles).toContain('.le-floating-artwork-hit.is-selected');
    expect(styles).toContain('outline: 2px dotted');
  });

  it('gives both floating artwork pixel axes a slider and exact numeric value control', () => {
    expect(levelEditor).toContain('aria-label="Artwork X pixel position"');
    expect(levelEditor).toContain('aria-label="Artwork X pixel position value"');
    expect(levelEditor).toContain('aria-label="Artwork Y pixel position"');
    expect(levelEditor).toContain('aria-label="Artwork Y pixel position value"');
    expect(levelEditor).toContain('min={artworkXRange.min}');
    expect(levelEditor).toContain('max={artworkXRange.max}');
    expect(levelEditor).toContain('min={artworkYRange.min}');
    expect(levelEditor).toContain('max={artworkYRange.max}');
    expect(levelEditor).toContain('(event.clientX - artworkDrag.startClientX) / boardZoom');
    expect(levelEditor).toContain('(event.clientY - artworkDrag.startClientY) / boardZoom');
    expect(levelEditor).not.toContain('artworkPointWithinBoard');
    expect(levelEditor).not.toContain('le-artwork-nudge');
  });
});
