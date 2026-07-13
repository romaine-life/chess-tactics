import { type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { KitScroll } from './KitScroll';
import { NavButton } from './shared/NavButton';
import { HouseSelect } from './shared/HouseSelect';
import type { LevelEditorLayerKey } from './levelEditorRoute';
import { chromeUnitClassNames } from './chromeUnitRegistry';

export type LevelEditorToolKey = 'select' | 'brush' | 'erase' | 'move';

export type LevelEditorLayerOption = {
  id: LevelEditorLayerKey;
  label: string;
  disabled?: boolean;
};

export function LevelEditorControlsPanel({
  layer,
  layerOptions,
  onLayerChange,
  tool,
  onToolChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  playBoardHref,
  playBoardEnabled = Boolean(playBoardHref),
  className = '',
  scrollClassName = '',
  style,
  inert = false,
  ariaBusy = false,
  children,
}: {
  layer: LevelEditorLayerKey;
  layerOptions: readonly LevelEditorLayerOption[];
  onLayerChange: (layer: LevelEditorLayerKey) => void;
  tool: LevelEditorToolKey | null;
  onToolChange: (tool: LevelEditorToolKey) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  playBoardHref?: string;
  playBoardEnabled?: boolean;
  className?: string;
  scrollClassName?: string;
  style?: CSSProperties;
  inert?: boolean;
  ariaBusy?: boolean;
  children: ReactNode;
}): ReactElement {
  const rootClassName = chromeUnitClassNames('outer-panel', 'skirmish-hud', 'le-outer-panel', className);
  const scrollClass = `le-hud-scroll ${scrollClassName}`.trim();
  const playTitle = playBoardEnabled
    ? "Play this exact board against the AI now - no save (a Test Board; set a CPU-delay floor in the game's Controls tab). Back returns you here."
    : 'Add a player and an enemy piece (clear the playability issues in the Status layer) to live-test this board.';

  return (
    <aside
      data-chrome-unit="outer-panel"
      data-chrome-consumer="level-editor-controls"
      className={rootClassName}
      style={style}
      aria-label="Editor controls"
      inert={inert || undefined}
      aria-busy={ariaBusy || undefined}
    >
      <span className="le-outer-panel-fill" aria-hidden="true" />
      <div className="le-outer-panel-content le-outer-panel-content--titled">
        <section className="skirmish-card le-layer-card">
          <h2 className="kit-panel-title"><span className="kit-panel-title-text">Layer</span></h2>
          <HouseSelect
            ariaLabel="Editor layer"
            value={layer}
            disabled={inert || ariaBusy}
            options={layerOptions.map((option) => ({
              value: option.id,
              label: option.label,
              disabled: option.disabled,
            }))}
            onChange={onLayerChange}
          />
        </section>

        <section className="skirmish-card le-actions-dock" aria-label="Editor actions">
          <h2>Actions</h2>
          <div className="le-seg le-seg-icons le-action-toolbar" role="toolbar" aria-label="Editor tools and history">
            <button type="button" data-chrome-unit="inner-select-tool" className={chromeUnitClassNames('inner-select-tool', 'le-seg-btn', tool === 'select' && 'active')} onClick={() => onToolChange('select')} title="Select" aria-label="Select"><span className="le-ico ic-eyedropper" aria-hidden="true" /></button>
            <button type="button" data-chrome-unit="inner-brush-tool" className={chromeUnitClassNames('inner-brush-tool', 'le-seg-btn', tool === 'brush' && 'active')} onClick={() => onToolChange('brush')} title="Brush" aria-label="Brush"><span className="le-ico ic-brush" aria-hidden="true" /></button>
            <button type="button" data-chrome-unit="inner-erase-tool" className={chromeUnitClassNames('inner-erase-tool', 'le-seg-btn', tool === 'erase' && 'active')} onClick={() => onToolChange('erase')} title="Erase" aria-label="Erase"><span className="le-ico ic-eraser" aria-hidden="true" /></button>
            <button type="button" data-chrome-unit="inner-move-tool" className={chromeUnitClassNames('inner-move-tool', 'le-seg-btn', tool === 'move' && 'active')} onClick={() => onToolChange('move')} title="Move - drag a placed unit or prop to a new cell." aria-label="Move"><span className="le-ico ic-move" aria-hidden="true" /></button>
            <span className="le-action-toolbar-divider" aria-hidden="true" />
            <button
              type="button"
              data-chrome-unit="inner-undo-key"
              className={chromeUnitClassNames('inner-undo-key', 'le-seg-btn', 'le-icon-btn')}
              onClick={onUndo}
              disabled={!canUndo}
              aria-label="Undo"
              title={canUndo ? 'Undo the last board edit.' : 'Nothing to undo.'}
            ><span className="le-ico ic-undo" aria-hidden="true" /></button>
            <button
              type="button"
              data-chrome-unit="inner-redo-key"
              className={chromeUnitClassNames('inner-redo-key', 'le-seg-btn', 'le-icon-btn')}
              onClick={onRedo}
              disabled={!canRedo}
              aria-label="Redo"
              title={canRedo ? 'Redo the last undone edit.' : 'Nothing to redo.'}
            ><span className="le-ico ic-redo" aria-hidden="true" /></button>
          </div>
          {playBoardEnabled && playBoardHref ? (
            <NavButton className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'le-play-board')} data-chrome-unit="inner-text-button" data-testid="le-test" to={playBoardHref} title={playTitle}>▶ Play test</NavButton>
          ) : (
            <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'le-play-board')} data-testid="le-test" disabled title={playTitle}>▶ Play test</button>
          )}
        </section>

        <div className="le-control-divider-host" aria-hidden="true">
          <div className="kit-divider" />
        </div>

        <KitScroll className={scrollClass}>
          {children}
        </KitScroll>
      </div>
    </aside>
  );
}

export function LevelEditorEventsOverlay({
  tab,
  onTabChange,
  onDone,
  victoryContent,
  otherContent,
  className = '',
  style,
}: {
  tab: 'victory' | 'other';
  onTabChange: (tab: 'victory' | 'other') => void;
  onDone: () => void;
  victoryContent: ReactNode;
  otherContent: ReactNode;
  className?: string;
  style?: CSSProperties;
}): ReactElement {
  const rootClassName = chromeUnitClassNames('outer-panel', 'le-events-overlay', 'le-outer-panel', className);
  return (
    <div data-chrome-unit="outer-panel" data-chrome-consumer="events-overlay" className={rootClassName} style={style} role="dialog" aria-label="Level events editor">
      <span className="le-outer-panel-fill" aria-hidden="true" />
      <div className="le-outer-panel-content">
        <div className="le-events-head">
          <h2>Events</h2>
          <div className="le-events-head-actions">
            <div className="le-seg le-events-tabs" role="tablist" aria-label="Event editor sections">
              <button type="button" data-chrome-unit="inner-text-button" role="tab" aria-selected={tab === 'victory'} className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', tab === 'victory' && 'active')} onClick={() => onTabChange('victory')}>Victory rules</button>
              <button type="button" data-chrome-unit="inner-text-button" role="tab" aria-selected={tab === 'other'} className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', tab === 'other' && 'active')} onClick={() => onTabChange('other')}>Other events</button>
            </div>
            <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'le-events-done')} onClick={onDone}>Done</button>
          </div>
        </div>
        {tab === 'victory' ? victoryContent : otherContent}
      </div>
    </div>
  );
}
