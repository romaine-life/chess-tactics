// @ts-nocheck - source-structure guard; vitest runs this through esbuild.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const controls = readFileSync(new URL('./LevelEditorChromeConsumers.tsx', import.meta.url), 'utf8');

describe('Level Editor Test action', () => {
  it('routes one current-board Test verb through the canonical controls panel', () => {
    const panelStart = src.indexOf('<LevelEditorControlsPanel');
    const panelEnd = src.indexOf('</LevelEditorControlsPanel>', panelStart);
    const panel = src.slice(panelStart, panelEnd);
    const statusStart = src.indexOf('<div className="le-board-actions le-status-actions">');
    const statusEnd = src.indexOf('</div>', statusStart);
    const statusActions = src.slice(statusStart, statusEnd);

    expect(panelStart).toBeGreaterThan(-1);
    expect(panel).toContain('playBoardHref={testHref}');
    expect(controls).toContain('data-testid="le-test"');
    expect(controls).toContain('no save');
    expect(statusActions).not.toContain('data-testid="le-test"');
    expect(src).not.toContain('const canTest');
    expect(`${src}\n${controls}`).not.toContain('data-testid="le-play-board"');
  });
});
