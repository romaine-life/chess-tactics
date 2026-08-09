import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_DECLARED_FACTIONS,
  resolveDeclaredFactions,
  undeclaredPaintedFactions,
} from './pieces';
import { decodeBoard, encodeBoard, type EditorBoard } from '../ui/boardCode';

const levelEditor = readFileSync(new URL('../ui/LevelEditor.tsx', import.meta.url), 'utf8');

const unit = (faction: string): { unitId: string; direction: string; faction: string } =>
  ({ unitId: 'pawn', direction: 'north', faction });

const board = (over: Partial<EditorBoard> = {}): EditorBoard => ({
  cols: 6,
  rows: 5,
  cells: {},
  units: {},
  doodads: {},
  cover: {},
  props: {},
  features: {},
  featureCuts: {},
  featureExits: {},
  ...over,
});

describe('declared factions', () => {
  it('gives every level two resolved factions, defaulting a blank board to the classic pairing', () => {
    expect(resolveDeclaredFactions({})).toEqual(DEFAULT_DECLARED_FACTIONS);
    expect(resolveDeclaredFactions({})).toEqual({ player: 'white', enemy: 'black' });
  });

  it('prefers the authored declaration over anything painted', () => {
    expect(resolveDeclaredFactions({
      playerFaction: 'emerald',
      enemyFaction: 'golden',
      units: { '0,0': unit('crimson'), '1,0': unit('navy-blue') },
    })).toEqual({ player: 'emerald', enemy: 'golden' });
  });

  it('reads an undeclared legacy board off its painted colours instead of claiming a side for it', () => {
    // The classic legacy pairing: navy-blue player, crimson enemy, nothing authored.
    expect(resolveDeclaredFactions({
      units: { '0,0': unit('navy-blue'), '0,1': unit('crimson') },
    })).toEqual({ player: 'navy-blue', enemy: 'crimson' });
    // Half-authored: the declared player stands, the enemy comes off the board.
    expect(resolveDeclaredFactions({
      playerFaction: 'white',
      units: { '0,0': unit('white'), '0,1': unit('emerald') },
    })).toEqual({ player: 'white', enemy: 'emerald' });
  });

  it('never resolves both roles to one colour', () => {
    // A declaration naming the same colour twice would fold two sides into one, and every unit
    // would read as the player's. The enemy half is refused and re-resolved instead.
    expect(resolveDeclaredFactions({ playerFaction: 'white', enemyFaction: 'white' }).enemy).not.toBe('white');
    expect(resolveDeclaredFactions({ playerFaction: 'black' })).toEqual({ player: 'black', enemy: 'white' });
    expect(resolveDeclaredFactions({ playerFaction: 'white', units: { '0,0': unit('white') } }))
      .toEqual({ player: 'white', enemy: 'black' });
  });

  it('ignores a declaration that is not a real palette', () => {
    expect(resolveDeclaredFactions({ playerFaction: 'chartreuse', enemyFaction: '' }))
      .toEqual(DEFAULT_DECLARED_FACTIONS);
  });

  it('reports painted colours no faction declares, and only those', () => {
    const declared = { player: 'white', enemy: 'black' } as const;
    expect(undeclaredPaintedFactions({
      units: { '0,0': unit('white'), '0,1': unit('black'), '0,2': unit('golden'), '0,3': unit('golden') },
    }, declared)).toEqual(['golden']);
    expect(undeclaredPaintedFactions({ units: { '0,0': unit('white') } }, declared)).toEqual([]);
  });
});

describe('declared factions persist on the board code', () => {
  it('round-trips the enemy declaration so a board with no enemy pieces still knows its colour', () => {
    const code = encodeBoard(board({ playerFaction: 'emerald', enemyFaction: 'crimson' }));
    const decoded = decodeBoard(code);
    expect(decoded?.playerFaction).toBe('emerald');
    expect(decoded?.enemyFaction).toBe('crimson');
  });

  it('omits the key when nothing is declared, so a pre-declaration board encodes unchanged', () => {
    expect(encodeBoard(board())).toBe(encodeBoard(board({ enemyFaction: null })));
    expect(decodeBoard(encodeBoard(board()))?.enemyFaction).toBeUndefined();
  });
});

describe('the level editor paints only declared factions', () => {
  it('offers the unit brush a faction role, never the raw palette catalog', () => {
    // The brush's colour is a consequence of the declaration. A PaletteSelect here would put all six
    // palettes back on the units page, which is exactly what the declaration replaced.
    const paintFaction = levelEditor.slice(levelEditor.indexOf('<h2>Paint Faction</h2>'));
    const panel = paintFaction.slice(0, paintFaction.indexOf('<h2 className="le-card-subhead">Facing</h2>'));
    expect(panel).toContain('<HouseSelect<FactionRole>');
    expect(panel).toContain('onChange={(role) => setUnitFaction(declaredFactions[role])}');
    expect(panel).not.toContain('<PaletteSelect');
  });

  it('keeps the brush on a declared faction when the declaration moves under it', () => {
    expect(levelEditor).toContain('if (declaredFactionRole(unitFaction)) return;');
    expect(levelEditor).toContain('setUnitFaction(declaredFactions.player);');
  });

  it('names a faction by the role it plays, never by its colour', () => {
    // One naming function, so no surface can drift back to calling a faction "White". The colour
    // survives only as a qualifier beside a role, or alone for pieces no faction declares.
    expect(levelEditor).toContain('const factionDisplayName = (faction: UnitPalette): string => {');
    expect(levelEditor).toContain('return role ? factionRoleLabels[role] : `Undeclared · ${LE_FACTION_LABELS[faction]}`;');
    // The armed brush and its default facing.
    expect(levelEditor).toContain('`unit · ${factionDisplayName(unitFaction)}`');
    expect(levelEditor).toContain('label={`${factionDisplayName(unitFaction)} default facing`}');
    // The victory rules' "IF <faction>" dropdown.
    expect(levelEditor).toMatch(/victoryFactions = useMemo\(\(\): FactionOption\[\][\s\S]*?label: factionRoleLabels\[side\],/);
  });

  it('counts material for the factions the level fields, not for the palette catalog', () => {
    // Six rows for a two-faction level was the inferred model leaking: four of them named sides the
    // level does not field and cannot paint.
    const material = levelEditor.slice(levelEditor.indexOf('className="le-material-values"'));
    const list = material.slice(0, material.indexOf('</dl>'));
    expect(list).toContain('[...FACTION_ROLES.map((role) => declaredFactions[role]), ...undeclaredFactions]');
    expect(list).toContain('{factionDisplayName(faction)}');
    expect(list).not.toContain('UNIT_PALETTES.map');
  });

  it('declares both halves together so neither is left implicit', () => {
    expect(levelEditor).toContain("if (role === 'player' && !isUnitPalette(next.enemyFaction)) next.enemyFaction = declaredFactions.enemy;");
    expect(levelEditor).toContain("if (role === 'enemy' && !isUnitPalette(next.playerFaction)) next.playerFaction = declaredFactions.player;");
  });
});
