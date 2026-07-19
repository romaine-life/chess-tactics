// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const levelEditor = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const levelEditorControls = readFileSync(new URL('./LevelEditorChromeConsumers.tsx', import.meta.url), 'utf8');
const viewPane = readFileSync(new URL('./shared/ViewPane.tsx', import.meta.url), 'utf8');

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

    // Playable cells, scenic cells, wall faces, doodad bodies, and prop bodies.
    expect(pointerDownLines).toHaveLength(5);
    for (const lineIndex of pointerDownLines) {
      const handlerPrefix = lines.slice(lineIndex, lineIndex + 8).join('\n');
      expect(handlerPrefix).toMatch(
        /onPointerDown=\{\(event\) => \{[\s\S]*?if \(event\.button !== 0\) return;[\s\S]*?event\.stopPropagation\(\);/,
      );
    }
  });

  it('keeps erasing as an explicit registered toolbar tool', () => {
    const eraseButton = levelEditorControls.match(
      /<button\b[^>]*data-chrome-unit="inner-erase-tool"[\s\S]*?<\/button>/,
    )?.[0];

    expect(eraseButton).toBeDefined();
    expect(eraseButton).toContain("chromeUnitClassNames('inner-erase-tool'");
    expect(eraseButton).toContain("onClick={() => onToolChange('erase')}");
    expect(eraseButton).toContain('aria-label="Erase"');
  });

  it('reports the live shared viewport size for projection-aware editor actions', () => {
    expect(viewPane).toContain('onViewportSizeChange?: (size: ViewPaneViewportSize) => void;');
    expect(viewPane).toContain('const viewport = { width: stage.clientWidth, height: stage.clientHeight };');
    expect(viewPane).toContain('onViewportSizeChange?.(viewport);');
    expect(viewPane).toContain('const observer = new ResizeObserver(updateMinimum);');
  });
});
