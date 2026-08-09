// @ts-nocheck — source-level regression guard for the Level Editor's Factions panel placement.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  LEVEL_EDITOR_ROUTE_LAYERS,
  isLevelEditorLayerKey,
  levelEditorRouteBrushKind,
  readLevelEditorRouteState,
} from './levelEditorRoute';

const source = readFileSync(new URL('./LevelEditor.tsx', import.meta.url), 'utf8');
const between = (open: string, close: string): string => {
  const start = source.indexOf(open);
  const end = source.indexOf(close, start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe('Factions layer route', () => {
  it('is an addressable panel of its own', () => {
    expect(LEVEL_EDITOR_ROUTE_LAYERS).toContain('factions');
    expect(isLevelEditorLayerKey('factions')).toBe(true);
    expect(readLevelEditorRouteState('?layer=factions')).toMatchObject({ layer: 'factions' });
  });

  it('opens on the pointer, not a brush', () => {
    expect(levelEditorRouteBrushKind('factions', undefined)).toBeNull();
    expect(source).toContain("|| layer === 'factions'");
    expect(source).toContain("&& nextLayer !== 'factions'");
    expect(source).toContain("{ id: 'factions', label: 'Factions' }");
  });
});

describe('Factions panel contents', () => {
  const factionsPanel = between("layer === 'factions' ?", "layer === 'camera' ?");
  const boardPanel = between("layer === 'board' ? (", "layer === 'factions' ?");

  it('owns the declaration, which Board > Level Settings no longer carries', () => {
    expect(factionsPanel).toContain('<h2>Declared Factions</h2>');
    expect(factionsPanel).toContain('FACTION_ROLES.map((role)');
    expect(factionsPanel).toContain('onClick={swapDeclaredFactions}');
    expect(factionsPanel).toContain('onClick={() => foldUndeclaredFaction(faction, role)}');
    expect(factionsPanel).toContain('{needsPlayerFaction ?');
    // Board keeps the rule readout and loses every faction control.
    expect(boardPanel).toContain('<h2>Level Settings</h2>');
    expect(boardPanel).not.toContain('Declared Factions');
    expect(boardPanel).not.toContain('declaredFactions[role]');
    expect(boardPanel).not.toContain('swapDeclaredFactions');
  });

  it('labels each control the way the unit brush labels its own facing', () => {
    // Two bare squares side by side named neither what they set nor which side they set it for.
    expect(factionsPanel).toContain('<span className="le-ctrllabel">Colour</span>');
    expect(factionsPanel).toContain('<span className="le-ctrllabel">Default facing</span>');
    expect(factionsPanel).not.toContain('le-faction-fields');
  });

  it('says which declared side the human actually commands', () => {
    // The question this panel exists to answer: a level that never declared has one READ off its
    // pixels, and the read can name the army the player fights (ADR-0538, ADR-0544).
    expect(factionsPanel).toContain('is the army the human commands in play. Every other piece fights it.');
  });

  it('sends a blocked save to the page that fixes it', () => {
    expect(source).toContain("setLayer(needsPlayerFaction && playability.ok ? 'factions' : 'status');");
    expect(source).toContain("setLayer('factions');");
    expect(source).not.toContain('Open Board > Level Settings');
  });
});

describe('the compass square explains itself', () => {
  it('carries a tooltip naming the setting and spelling out the current facing', () => {
    // "S" in a square is not a word. Both call sites describe the setting; the component always
    // appends the value, because the letter is the only thing on screen.
    expect(source).toContain('const tooltip = `${describe ?? label}. Currently facing ${value}.`;');
    expect(source).toMatch(/className=\{chromeUnitClassNames\('inner-tool-square', 'le-direction-trigger'\)\}\s*\n\s*aria-label=\{label\}\s*\n\s*title=\{tooltip\}/);
    expect(source).toContain('describe={`The way a newly painted ${factionRoleLabels[role]} unit stands`}');
    expect(source).toContain('describe={`The way a newly painted ${factionDisplayName(unitFaction)} unit stands`}');
  });
});
