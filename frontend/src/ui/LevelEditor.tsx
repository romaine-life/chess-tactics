import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { EditorBoard } from '../render/EditorBoard';
import { useEditor, type EditorTool } from '../editor/store';
import { validateLevel, type TerrainType } from '../core/level';
import type { PieceType, Side } from '../core/types';
import { saveLevel, loadLevel, listLevels, type LevelSummary } from '../net/levels';
import { fetchMe, goSignIn, isUnauthorized, signInHref, type AuthUser } from '../net/auth';

const TERRAINS: TerrainType[] = ['grass', 'water', 'stone', 'road', 'bridge', 'cliff', 'rock'];
const SWATCH: Record<TerrainType, string> = { grass: '#356a42', water: '#2f5d86', stone: '#6b6f76', road: '#a9905f', bridge: '#7a5a36', cliff: '#3a3f46', rock: '#595e66' };
const UNITS: PieceType[] = ['pawn', 'knight', 'bishop', 'rook', 'queen'];
const SIDES: Side[] = ['player', 'enemy'];
const TOOLS: { id: EditorTool; label: string }[] = [
  { id: 'terrain', label: 'Terrain' }, { id: 'unit', label: 'Unit' }, { id: 'elevation', label: 'Raise' }, { id: 'erase', label: 'Erase' },
];

const panel: CSSProperties = { background: 'var(--ds-surface)', border: '1px solid var(--ds-line)', borderRadius: 'var(--ds-radius-md)', padding: '10px 12px' };
const eyebrow: CSSProperties = { fontSize: 'var(--ds-text-xs)', letterSpacing: '.08em', color: 'var(--ds-ink-3)', textTransform: 'uppercase', marginBottom: 6 };

function chip(active: boolean): CSSProperties {
  return {
    border: `1px solid ${active ? 'var(--ds-accent)' : 'var(--ds-line-2)'}`,
    background: active ? 'var(--ds-accent-soft)' : 'transparent',
    color: 'var(--ds-ink)', borderRadius: 'var(--ds-radius-sm)', padding: '5px 9px', cursor: 'pointer', fontSize: 'var(--ds-text-sm)',
  };
}

export function LevelEditor() {
  const tool = useEditor((s) => s.tool);
  const terrainBrush = useEditor((s) => s.terrainBrush);
  const unitBrush = useEditor((s) => s.unitBrush);
  const level = useEditor((s) => s.level);
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);
  const [status, setStatus] = useState('');
  const [me, setMe] = useState<AuthUser | null>(null);
  const [savedLevels, setSavedLevels] = useState<LevelSummary[]>([]);

  const refreshLevels = async () => {
    try {
      setSavedLevels(await listLevels());
    } catch (e) {
      if (isUnauthorized(e)) setSavedLevels([]);
    }
  };

  useEffect(() => {
    let active = true;
    fetchMe().then((user) => {
      if (!active) return;
      setMe(user);
      if (user.signed_in) refreshLevels();
    });
    return () => { active = false; };
  }, []);

  const save = () => {
    const res = validateLevel(level);
    setStatus(res.ok ? `Valid · ${level.layers.units.length} units · ${level.board.cols}×${level.board.rows}` : `Invalid: ${res.errors[0]}`);
  };

  const publish = async () => {
    const res = validateLevel(level);
    if (!res.ok) { setStatus(`Invalid: ${res.errors[0]}`); return; }
    try {
      const r = await saveLevel(level);
      setStatus(`Saved to server · rev ${r.revision}`);
      refreshLevels();
    } catch (e) {
      if (isUnauthorized(e)) { goSignIn(); return; }
      setStatus(`Save failed: ${(e as Error).message}`);
    }
  };

  const loadById = async (id: string) => {
    try {
      const loaded = await loadLevel(id);
      useEditor.getState().setLevel(loaded);
      setStatus(`Loaded from server · ${loaded.layers.units.length} units`);
    } catch (e) {
      if (isUnauthorized(e)) { goSignIn(); return; }
      setStatus(`Load failed: ${(e as Error).message}`);
    }
  };

  const loadFromServer = () => loadById(level.id);

  return (
    <div data-testid="level-editor" style={{ display: 'flex', gap: 14, padding: 14, alignItems: 'flex-start', position: 'relative', zIndex: 5, pointerEvents: 'auto', color: 'var(--ds-ink-2)', fontFamily: 'var(--ds-font-sans)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ ...panel, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {TOOLS.map((t) => (
            <button key={t.id} type="button" data-testid={`tool-${t.id}`} style={chip(tool === t.id)} onClick={() => useEditor.getState().setTool(t.id)}>{t.label}</button>
          ))}
          <span style={{ flex: 1 }} />
          <button type="button" data-testid="undo" style={chip(false)} disabled={!past.length} onClick={() => useEditor.getState().undo()}>Undo</button>
          <button type="button" data-testid="redo" style={chip(false)} disabled={!future.length} onClick={() => useEditor.getState().redo()}>Redo</button>
          <button type="button" data-testid="save" style={chip(false)} onClick={save}>Save</button>
          <button type="button" data-testid="publish" style={chip(false)} onClick={publish}>Publish</button>
          <button type="button" data-testid="load" style={chip(false)} onClick={loadFromServer}>Load</button>
        </div>
        <EditorBoard />
        {status ? <div style={{ ...panel }} data-testid="editor-status">{status}</div> : null}
      </div>

      <aside style={{ width: 240, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={panel} data-testid="level-library">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={eyebrow}>My levels</span>
            {me?.signed_in ? <button type="button" data-testid="refresh-levels" style={chip(false)} onClick={refreshLevels}>Refresh</button> : null}
          </div>
          {me && !me.signed_in ? (
            <a href={signInHref()} data-testid="editor-sign-in" style={{ ...chip(false), display: 'inline-block', marginTop: 6, textDecoration: 'none' }}>Sign in to save &amp; load</a>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {savedLevels.length === 0 && <span style={{ color: 'var(--ds-ink-3)', fontSize: 'var(--ds-text-sm)' }}>No saved levels yet.</span>}
              {savedLevels.map((s) => (
                <button key={s.id} type="button" data-testid={`level-row-${s.id}`} onClick={() => loadById(s.id)}
                  style={{ ...chip(s.id === level.id), textAlign: 'left' }}>
                  {s.name || s.id}{s.cols && s.rows ? <span style={{ color: 'var(--ds-ink-3)' }}> · {s.cols}×{s.rows}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
        <div style={panel}>
          <div style={eyebrow}>Tile palette</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TERRAINS.map((t) => (
              <button key={t} type="button" title={t} onClick={() => useEditor.getState().setTerrainBrush(t)}
                style={{ ...chip(tool === 'terrain' && terrainBrush === t), padding: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <i style={{ width: 14, height: 14, background: SWATCH[t], display: 'inline-block', borderRadius: 2 }} />{t}
              </button>
            ))}
          </div>
        </div>
        <div style={panel}>
          <div style={eyebrow}>Units</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {SIDES.map((side) => (
              <div key={side} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--ds-text-xs)', color: side === 'player' ? '#6c9be6' : '#e08a7e', width: 46 }}>{side}</span>
                {UNITS.map((u) => (
                  <button key={u} type="button" onClick={() => useEditor.getState().setUnitBrush(u, side)}
                    style={chip(tool === 'unit' && unitBrush.type === u && unitBrush.side === side)}>{u[0].toUpperCase()}</button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div style={panel}>
          <div style={eyebrow}>Board</div>
          <div style={{ fontSize: 'var(--ds-text-sm)' }}>{level.board.cols} × {level.board.rows} · {level.layers.units.length} units</div>
          <button type="button" style={{ ...chip(false), marginTop: 8 }} onClick={() => useEditor.getState().newLevel(12, 8)}>New 12×8</button>
        </div>
      </aside>
    </div>
  );
}
