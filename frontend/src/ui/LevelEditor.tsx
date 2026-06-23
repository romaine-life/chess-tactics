import { useEffect, useState, type ReactElement } from 'react';
import { EditorBoard } from '../render/EditorBoard';
import { useEditor, type EditorTool } from '../editor/store';
import { validateLevel, type TerrainType } from '../core/level';
import type { PieceType, Side } from '../core/types';
import { PLAYABLE_PIECE_TYPES } from '../core/pieces';
import { saveLevel, loadLevel, listLevels, type LevelSummary } from '../net/levels';
import { fetchMe, goSignIn, isUnauthorized, signInHref, type AuthUser } from '../net/auth';

const ASSET_ROOT = '/assets/ui/level-editor';
const TERRAINS: TerrainType[] = ['grass', 'water', 'stone', 'road', 'bridge', 'cliff', 'rock'];
const SWATCH: Record<TerrainType, string> = { grass: '#356a42', water: '#2f5d86', stone: '#6b6f76', road: '#a9905f', bridge: '#7a5a36', cliff: '#3a3f46', rock: '#595e66' };
const UNITS: PieceType[] = [...PLAYABLE_PIECE_TYPES];
const SIDES: Side[] = ['player', 'enemy'];
const EDITOR_TABS: { key: string; id: EditorTool; label: string; icon: string; disabled?: boolean }[] = [
  { key: 'board', id: 'terrain', label: 'Board', icon: 'grid' },
  { key: 'tiles', id: 'terrain', label: 'Tiles', icon: 'brush' },
  { key: 'pieces', id: 'unit', label: 'Pieces', icon: 'zone' },
  { key: 'zones', id: 'erase', label: 'Zones', icon: 'eyedropper' },
  { key: 'templates', id: 'erase', label: 'Templates', icon: 'download', disabled: true },
];
const TOOLS: { id: EditorTool; label: string; icon: string }[] = [
  { id: 'terrain', label: 'Board', icon: 'grid' },
  { id: 'unit', label: 'Pieces', icon: 'zone' },
  { id: 'elevation', label: 'Height', icon: 'height-up' },
  { id: 'erase', label: 'Erase', icon: 'eraser' },
];
const LAYERS: { id: string; label: string; tool: EditorTool; locked?: boolean }[] = [
  { id: 'units', label: 'Units', tool: 'unit' },
  { id: 'zones', label: 'Zones', tool: 'erase', locked: true },
  { id: 'decals', label: 'Decals', tool: 'erase', locked: true },
  { id: 'terrain', label: 'Terrain', tool: 'terrain' },
];

function iconSrc(name: string, active = false): string {
  return `${ASSET_ROOT}/icons/${name}${active ? '-active' : ''}.png`;
}

function ChromePanel({ title, className = '', testId, children }: { title: string; className?: string; testId?: string; children: React.ReactNode }): ReactElement {
  return (
    <section className={`le-panel ${className}`.trim()} data-testid={testId}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function IconButton({
  label,
  icon,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}): ReactElement {
  return (
    <button type="button" className={`le-icon-button ${active ? 'is-active' : ''}`.trim()} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      <img src={iconSrc(icon, active)} alt="" aria-hidden="true" />
    </button>
  );
}

function ActionButton({
  label,
  icon,
  primary = false,
  disabled = false,
  onClick,
}: {
  label: string;
  icon?: string;
  primary?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}): ReactElement {
  return (
    <button type="button" className={`le-action-button ${primary ? 'is-primary' : ''}`.trim()} disabled={disabled} onClick={onClick}>
      {icon ? <img src={iconSrc(icon, primary)} alt="" aria-hidden="true" /> : null}
      <span>{label}</span>
    </button>
  );
}

function ToolTab({ tool, active }: { tool: { id: EditorTool; label: string; icon: string; disabled?: boolean }; active: boolean }): ReactElement {
  return (
    <button type="button" data-testid={`tool-${tool.id}`} className={`le-tool-tab ${active ? 'is-active' : ''}`.trim()} disabled={tool.disabled} onClick={() => useEditor.getState().setTool(tool.id)}>
      <img src={iconSrc(tool.icon, active)} alt="" aria-hidden="true" />
      <span>{tool.label}</span>
    </button>
  );
}

export function LevelEditor(): ReactElement {
  const tool = useEditor((s) => s.tool);
  const terrainBrush = useEditor((s) => s.terrainBrush);
  const unitBrush = useEditor((s) => s.unitBrush);
  const level = useEditor((s) => s.level);
  const past = useEditor((s) => s.past);
  const future = useEditor((s) => s.future);
  const [status, setStatus] = useState('Ready');
  const [me, setMe] = useState<AuthUser | null>(null);
  const [savedLevels, setSavedLevels] = useState<LevelSummary[]>([]);

  useEffect(() => {
    const shell = document.querySelector('.shell');
    shell?.classList.add('level-editor-active');
    return () => shell?.classList.remove('level-editor-active');
  }, []);

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
    setStatus(res.ok ? `Valid - ${level.layers.units.length} units - ${level.board.cols} x ${level.board.rows}` : `Invalid: ${res.errors[0]}`);
  };

  const publish = async () => {
    const res = validateLevel(level);
    if (!res.ok) { setStatus(`Invalid: ${res.errors[0]}`); return; }
    try {
      const r = await saveLevel(level);
      setStatus(`Saved to server - rev ${r.revision}`);
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
      setStatus(`Loaded from server - ${loaded.layers.units.length} units`);
    } catch (e) {
      if (isUnauthorized(e)) { goSignIn(); return; }
      setStatus(`Load failed: ${(e as Error).message}`);
    }
  };

  const loadFromServer = () => loadById(level.id);

  return (
    <div className="level-editor-shell" data-testid="level-editor">
      <header className="le-topbar" aria-label="Level editor toolbar">
        <a className="le-brand" href="/">
          <img src="/assets/ui/main-menu/icon-scroll.png" alt="" aria-hidden="true" />
          <span>
            <small>Chess Tactics</small>
            <strong>Level Editor</strong>
          </span>
        </a>
        <nav className="le-tool-tabs" aria-label="Editor tools">
          {EDITOR_TABS.map((t) => <ToolTab key={t.key} tool={t} active={t.key === 'board' && tool === 'terrain' || t.id === tool && t.key !== 'tiles'} />)}
        </nav>
        <div className="le-history" aria-label="Edit history">
          <IconButton label="Undo" icon="undo" disabled={!past.length} onClick={() => useEditor.getState().undo()} />
          <IconButton label="Redo" icon="redo" disabled={!future.length} onClick={() => useEditor.getState().redo()} />
        </div>
        <div className="le-save-actions">
          <ActionButton label="Test" icon="play" onClick={save} />
          <ActionButton label="Save" icon="save" primary onClick={publish} />
          <a className="le-menu-link" href="/" aria-label="Main menu">
            <img src={iconSrc('menu')} alt="" aria-hidden="true" />
          </a>
        </div>
      </header>

      <main className="le-workspace">
        <aside className="le-left-rail" aria-label="Board controls">
          <ChromePanel title="Board Settings">
            <label className="le-field"><span>Size</span><select value={`${level.board.cols}x${level.board.rows}`} onChange={(e) => {
              const [cols, rows] = e.target.value.split('x').map(Number);
              useEditor.getState().newLevel(cols, rows);
            }}><option value="12x8">12 x 8</option><option value="10x10">10 x 10</option><option value="8x8">8 x 8</option></select></label>
            <label className="le-field"><span>Height</span><select value={level.board.heightLevels} onChange={() => undefined}><option>{level.board.heightLevels}</option></select></label>
            <label className="le-field"><span>Theme</span><select value="Grassland" onChange={() => undefined}><option>Grassland</option></select></label>
            <label className="le-check"><input type="checkbox" checked readOnly /> Isometric Grid</label>
          </ChromePanel>

          <ChromePanel title="Layers" className="le-layers-panel">
            {LAYERS.map((layer) => {
              const active = tool === layer.tool && (layer.id !== 'terrain' || Boolean(terrainBrush));
              return (
                <button key={layer.id} type="button" className={`le-layer-row ${active ? 'is-selected' : ''}`.trim()} onClick={() => useEditor.getState().setTool(layer.tool)}>
                  <img src={iconSrc('eye', active)} alt="" aria-hidden="true" />
                  <span>{layer.label}</span>
                  <img src={iconSrc(layer.locked ? 'lock' : 'grid', active)} alt="" aria-hidden="true" />
                </button>
              );
            })}
          </ChromePanel>

          <ChromePanel title="Map Preview" className="le-minimap-panel">
            <div className="le-minimap" aria-hidden="true">
              <span />
            </div>
          </ChromePanel>

          <ChromePanel title="Camera" className="le-camera-panel">
            <div className="le-camera-modes">
              <IconButton label="Day camera" icon="height-up" />
              <IconButton label="Night camera" icon="height-down" active />
            </div>
            <div className="le-camera-slider">
              <span />
              <i />
            </div>
          </ChromePanel>

          <ChromePanel title="Saved Levels" className="le-library-panel" testId="level-library">
            {me && !me.signed_in ? (
              <a href={signInHref()} data-testid="editor-sign-in" className="le-sign-in">Sign in to save and load</a>
            ) : (
              <>
                <div className="le-library-head">
                  <span>{savedLevels.length} saved</span>
                  <button type="button" data-testid="load" onClick={loadFromServer}>Load ID</button>
                  {me?.signed_in ? <button type="button" data-testid="refresh-levels" onClick={refreshLevels}>Refresh</button> : null}
                </div>
                <div className="le-library-list">
                  {savedLevels.length === 0 && <span className="le-muted">No saved levels yet.</span>}
                  {savedLevels.map((s) => (
                    <button key={s.id} type="button" data-testid={`level-row-${s.id}`} onClick={() => loadById(s.id)} className={s.id === level.id ? 'is-active' : ''}>
                      <span>{s.name || s.id}</span>
                      {s.cols && s.rows ? <small>{s.cols} x {s.rows}</small> : null}
                    </button>
                  ))}
                </div>
              </>
            )}
          </ChromePanel>
        </aside>

        <section className="le-board-stage" aria-label="Editable board">
          <div className="le-board-frame">
            <EditorBoard />
          </div>
        </section>

        <aside className="le-right-rail" aria-label="Palette controls">
          <ChromePanel title="Tile Palette" className="le-palette-panel">
            <div className="le-palette-grid">
              {TERRAINS.map((t) => (
                <button key={t} type="button" title={t} className={tool === 'terrain' && terrainBrush === t ? 'is-active' : ''} onClick={() => useEditor.getState().setTerrainBrush(t)}>
                  <i style={{ background: SWATCH[t] }} />
                  <span>{t}</span>
                </button>
              ))}
            </div>
          </ChromePanel>

          <ChromePanel title="Brush">
            <div className="le-brush-tools">
              {TOOLS.map((t) => <IconButton key={t.id} label={t.label} icon={t.icon === 'grid' ? 'brush' : t.icon} active={tool === t.id} onClick={() => useEditor.getState().setTool(t.id)} />)}
            </div>
            <label className="le-field"><span>Size</span><select value="1" onChange={() => undefined}><option>1</option></select></label>
            <label className="le-field"><span>Height</span><select value="Auto" onChange={() => undefined}><option>Auto</option></select></label>
            <label className="le-check"><input type="checkbox" checked readOnly /> Auto-Connect</label>
          </ChromePanel>

          <ChromePanel title="Zones" className="le-zones-panel">
            <div className="le-zone-tools">
              <IconButton label="Enemy threat" icon="zone" active={tool === 'erase'} onClick={() => useEditor.getState().setTool('erase')} />
              <IconButton label="Objective" icon="eyedropper" />
              <IconButton label="Ally shield" icon="download" />
              <IconButton label="Flag" icon="upload" />
              <IconButton label="Clear zone" icon="eraser" onClick={() => useEditor.getState().setTool('erase')} />
            </div>
            <label className="le-field"><span>Zone Type</span><select value="Enemy Threat" onChange={() => undefined}><option>Enemy Threat</option></select></label>
            <label className="le-field"><span>Layer</span><select value="Above Units" onChange={() => undefined}><option>Above Units</option></select></label>
            <label className="le-range"><span>Opacity</span><input type="range" min="0" max="100" value="60" readOnly /><b>60%</b></label>
          </ChromePanel>
        </aside>
      </main>

      <footer className="le-bottom-tray" aria-label="Asset tray">
        <div className="le-tray-assets">
          {[...UNITS.map((u) => ({ key: `player-${u}`, label: u, side: 'player' as Side, type: u })), ...UNITS.map((u) => ({ key: `enemy-${u}`, label: u, side: 'enemy' as Side, type: u }))].map((item) => (
            <button key={item.key} type="button" className={tool === 'unit' && unitBrush.type === item.type && unitBrush.side === item.side ? 'is-active' : ''} onClick={() => useEditor.getState().setUnitBrush(item.type, item.side)}>
              <img src={iconSrc(item.side === 'player' ? 'upload' : 'download', tool === 'unit' && unitBrush.type === item.type && unitBrush.side === item.side)} alt="" aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          ))}
          {TERRAINS.map((t) => (
            <button key={`tray-${t}`} type="button" className={tool === 'terrain' && terrainBrush === t ? 'is-active' : ''} onClick={() => useEditor.getState().setTerrainBrush(t)}>
              <i style={{ background: SWATCH[t] }} />
              <span>{t}</span>
            </button>
          ))}
        </div>
        <div className="le-tray-controls">
          <span>Snap</span>
          <IconButton label="Snap to grid" icon="grid" active />
          <span>Height</span>
          <IconButton label="Raise height" icon="height-up" onClick={() => useEditor.getState().setTool('elevation')} />
        </div>
      </footer>

      <div className="le-status" data-testid="editor-status">
        <span className="le-status-dot" />
        <span>{status}</span>
        <span>Board: {level.board.cols} x {level.board.rows} x {level.board.heightLevels}</span>
        <span>Tiles: {level.layers.terrain.length}</span>
        <span>Units: {level.layers.units.length}</span>
      </div>
    </div>
  );
}
