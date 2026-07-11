// @ts-nocheck - source-structure guard; vitest runs this through esbuild.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');

describe('Level Editor Test action', () => {
  it('uses one current-board Test verb instead of a saved-only Status action', () => {
    const dockStart = src.indexOf('<section className="skirmish-card le-actions-dock"');
    const dockEnd = src.indexOf('</section>', dockStart);
    const dock = src.slice(dockStart, dockEnd);
    const statusStart = src.indexOf('<div className="le-board-actions le-status-actions">');
    const statusEnd = src.indexOf('</div>', statusStart);
    const statusActions = src.slice(statusStart, statusEnd);

    expect(dockStart).toBeGreaterThan(-1);
    expect(dock).toContain('data-testid="le-test"');
    expect(dock).toContain('to={testHref}');
    expect(dock).toContain('No save is required');
    expect(statusActions).not.toContain('data-testid="le-test"');
    expect(src).not.toContain('const canTest');
    expect(src).not.toContain('data-testid="le-play-board"');
  });
});
