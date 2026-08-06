// @ts-nocheck -- source-structure guard; node built-ins are outside the app tsconfig.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const picker = readFileSync(new URL('./PredrawnCornerPicker.tsx', import.meta.url), 'utf8');
const style = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

describe('pre-drawn grid calibration instrument', () => {
  it('separates coarse fitting from selectable shared-corner cell refinement', () => {
    expect(picker).toContain('>Coarse grid</ChromeButton>');
    expect(picker).toContain('>Local cells</ChromeButton>');
    expect(picker).toContain('data-testid={`predrawn-local-cell-${cell.column}-${cell.row}`}');
    expect(picker).toContain('data-testid={`predrawn-local-node-${handle.corner}`}');
    expect(picker).toContain('onFocus={() => setActiveControl(control)}');
    expect(picker).toContain('<polyline');
    expect(picker).toContain('A shared corner changes every highlighted neighboring tile.');
    expect(picker).toContain('Arrow keys move 1 source pixel; Shift moves 10.');
  });

  it('keeps the outside boundary coarse-only and explains the locked local handles', () => {
    expect(picker).toContain('predrawnLocalNodeIsBoundary');
    expect(picker).toContain("handle.locked ? 'is-locked' : ''");
    expect(picker).toContain('stays locked in Local cells. Use Coarse grid to move the boundary.');
    expect(picker).toContain('Outside-edge handles are locked; switch to Coarse grid');
    expect(style).toMatch(/\.predrawn-grid-local-node\.is-locked\s*\{/);
    expect(style).toContain('cursor: not-allowed');
  });

  it('offers explicit corner, tile, and all-local resets without silently rebasing local work', () => {
    expect(picker).toContain('>Reset corner</ChromeButton>');
    expect(picker).toContain('>Reset tile</ChromeButton>');
    expect(picker).toContain('>Clear all local</ChromeButton>');
    expect(picker).toContain('disabled={coarseRebaseLocked}');
    expect(picker).toContain('disabled={!complete || coarseRebaseLocked}');
    expect(picker).toContain('>Clear {meshOverrides.length} local</ChromeButton>');
    expect(picker).toContain('before changing grid dimensions, snapping, or resetting spacing.');
  });

  it('starts first-time fitting from the real game grid and scales it proportionally', () => {
    expect(picker).toContain('predrawnIdealGridSeed(');
    expect(picker).toContain('Started with the real game grid, centered and uniformly scaled.');
    expect(picker).toContain('aria-label="Uniform grid size"');
    expect(picker).toContain('data-testid="predrawn-grid-scale-down"');
    expect(picker).toContain('data-testid="predrawn-grid-scale-up"');
    expect(picker).toContain('scaleGridUniformly(0.98)');
    expect(picker).toContain('scaleGridUniformly(1.02)');
    expect(style).toMatch(/\.predrawn-grid-uniform-scale\s*\{/);
  });

  it('offers full-grid undo and redo with one history entry per completed drag', () => {
    const toolbar = picker.indexOf('<div className="predrawn-corner-picker-toolbar">');
    const calibrationBar = picker.indexOf('<div className={`predrawn-grid-calibration-bar is-${editMode}`}>');
    const undo = picker.indexOf('data-testid="predrawn-grid-undo"');
    const redo = picker.indexOf('data-testid="predrawn-grid-redo"');

    expect(picker).toContain('data-testid="predrawn-grid-undo"');
    expect(picker).toContain('data-testid="predrawn-grid-redo"');
    expect(undo).toBeGreaterThan(toolbar);
    expect(redo).toBeGreaterThan(undo);
    expect(redo).toBeLessThan(calibrationBar);
    expect(picker).toContain('>Undo</ChromeButton>');
    expect(picker).toContain('>Redo</ChromeButton>');
    expect(picker).toContain('aria-label="Grid edit history"');
    expect(picker).toContain('disabled={!gridHistory.undo.length}');
    expect(picker).toContain('disabled={!gridHistory.redo.length}');
    expect(picker).toContain("onClick={() => applyGridHistory('undo')}");
    expect(picker).toContain("onClick={() => applyGridHistory('redo')}");
    expect(picker).toContain('startGridSnapshot: currentGridSnapshot()');
    expect(picker).toContain('recordGridEdit(drag.startGridSnapshot)');
    expect(picker).toContain("beginDrag(event, { kind: 'corner', corner })");
    expect(picker).toContain("beginDrag(event, { kind: 'reference-corner', corner })");
    expect(picker).toContain("beginDrag(event, { kind: 'column', index })");
    expect(picker).toContain("beginDrag(event, { kind: 'row', index })");
    expect(picker).toContain("beginDrag(event, { kind: 'move' })");
    expect(picker).toContain('beginDrag(event, control)');
    expect(style).toMatch(/\.predrawn-grid-history\s*\{/);
  });

  it('snapshots every calibration axis and wires every mutation class into history', () => {
    expect(picker).toContain('points: pointsRef.current');
    expect(picker).toContain('boundaryPoints: boundaryPointsRef.current');
    expect(picker).toContain('gridColumns: gridColumnsRef.current');
    expect(picker).toContain('gridRows: gridRowsRef.current');
    expect(picker).toContain('columnGuides: columnGuidesRef.current');
    expect(picker).toContain('rowGuides: rowGuidesRef.current');
    expect(picker).toContain('meshOverrides: meshOverridesRef.current');

    for (const functionName of [
      'placeActiveCorner',
      'nudgeActiveControl',
      'reset',
      'resetSpacing',
      'snapToIdealGrid',
      'scaleGridUniformly',
      'pinBoundaryReference',
      'clearBoundaryReference',
      'changeGridColumns',
      'changeGridRows',
      'resetActiveLocalNode',
      'resetSelectedLocalCell',
      'resetAllLocalCells',
    ]) {
      const start = picker.indexOf(`const ${functionName} =`);
      expect(start, `${functionName} exists`).toBeGreaterThan(-1);
      const end = picker.indexOf('\n  };', start);
      const body = picker.slice(start, end);
      expect(body, `${functionName} captures a complete before-state`).toContain(
        'const before = currentGridSnapshot();',
      );
      expect(body, `${functionName} records one logical edit`).toContain('recordGridEdit(before);');
    }

    expect(picker).toContain('gridColumnsRef.current = next;');
    expect(picker).toContain('gridRowsRef.current = next;');
    expect(picker).toContain('applyGridSnapshot(stepped.target');
    expect(picker).toContain('clearGridHistory();');
    expect(picker).not.toContain('clearLocalMeshHistory');
  });

  it('normalizes opening mesh pixels and canonicalizes saved registration', () => {
    expect(picker).toContain('const normalizedMeshOverrides = meshOverridesFromRegistration(');
    expect(picker).toContain('meshOverridesRef.current = normalizedMeshOverrides');
    expect(picker).toContain('const canonical = normalizePredrawnBoardRegistration(pending)');
    expect(picker).toContain('onSaveRegistration(canonical)');
  });

  it('makes cells clickable and distinguishes selected, affected, and locked controls', () => {
    expect(style).toMatch(/\.predrawn-grid-cell-hits \.predrawn-grid-cell-hit\s*\{[^}]*pointer-events:\s*all/s);
    expect(style).toMatch(/\.predrawn-grid-cell-hits \.predrawn-grid-cell-hit\.is-selected\s*\{/);
    expect(style).toMatch(/\.predrawn-grid-cell-hits \.predrawn-grid-cell-hit\.is-affected\s*\{/);
    expect(style).toMatch(/\.predrawn-grid-local-node\.is-overridden::after\s*\{/);
  });

  it('uses tiny unlabeled shared-corner dots instead of misleading compass buttons', () => {
    const localNodeRule = style.match(/\.predrawn-grid-local-node\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(localNodeRule).toContain('height: 12px');
    expect(localNodeRule).toContain('width: 12px');
    expect(localNodeRule).toContain('min-height: 0');
    expect(localNodeRule).toContain('min-width: 0');
    expect(picker).toContain('Drag this shared corner.');
    expect(picker).not.toContain("CORNER_SHORT[handle.corner]");
    expect(picker).not.toContain('CORNER_LABEL[handle.corner]');
  });

  it('reserves secondary-button drag for panning from any grid or handle target', () => {
    expect(picker).toContain('if (event.button !== 2 || dragRef.current) return;');
    expect(picker).toContain('if (event.button !== 0) return;');
    expect(picker.match(/if \(event\.button !== 0\) return;/g)).toHaveLength(2);
    expect(picker).toContain('onPointerDownCapture={beginViewportPan}');
    expect(picker).toContain("viewport.addEventListener('wheel', zoomViewport, { passive: false });");
    expect(picker).toContain('viewport.scrollLeft = pan.startScrollLeft - (event.clientX - pan.startClientX);');
    expect(picker).toContain('viewport.scrollTop = pan.startScrollTop - (event.clientY - pan.startClientY);');
    expect(picker).toContain('onContextMenu={(event) => event.preventDefault()}');
    expect(picker).toContain('Mouse wheel zooms at the cursor. Right-drag anywhere on the artwork to pan.');
    expect(style).toMatch(/\.predrawn-corner-picker-overlay\.is-panning[\s\S]*cursor:\s*grabbing/);
  });
});
