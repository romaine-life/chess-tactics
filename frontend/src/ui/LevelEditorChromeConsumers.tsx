import { type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { KitScroll } from './KitScroll';
import { NavButton } from './shared/NavButton';
import { HouseSelect } from './shared/HouseSelect';
import { ChromeDivider, OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import type { LevelEditorLayerKey } from './levelEditorRoute';
import { chromeUnitClassNames } from './chromeUnitRegistry';

export type LevelEditorToolKey = 'select' | 'brush' | 'erase' | 'move';

export type LevelEditorLayerOption = {
  id: LevelEditorLayerKey;
  label: string;
  disabled?: boolean;
};

export function adjacentLevelEditorLayer(
  layer: LevelEditorLayerKey,
  layerOptions: readonly LevelEditorLayerOption[],
  direction: -1 | 1,
): LevelEditorLayerKey | null {
  const enabled = layerOptions.filter((option) => !option.disabled);
  if (enabled.length === 0) return null;
  const currentIndex = enabled.findIndex((option) => option.id === layer);
  const anchor = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0;
  return enabled[(anchor + direction + enabled.length) % enabled.length]?.id ?? null;
}

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
  extraActions,
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
  extraActions?: ReactNode;
  className?: string;
  scrollClassName?: string;
  style?: CSSProperties;
  inert?: boolean;
  ariaBusy?: boolean;
  children: ReactNode;
}): ReactElement {
  const scrollClass = `le-hud-scroll ${scrollClassName}`.trim();
  const playTitle = playBoardEnabled
    ? "Play this exact board against the AI now - no save (a Test Board; set a CPU-delay floor in the game's Controls tab). Back returns you here."
    : 'Add a player and an enemy piece (clear the playability issues in the Status layer) to live-test this board.';
  const layerStepDisabled = inert || ariaBusy || layerOptions.filter((option) => !option.disabled).length <= 1;
  const stepLayer = (direction: -1 | 1): void => {
    const nextLayer = adjacentLevelEditorLayer(layer, layerOptions, direction);
    if (nextLayer && nextLayer !== layer) onLayerChange(nextLayer);
  };
  const playAction = playBoardEnabled && playBoardHref ? (
    <NavButton className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'le-play-board')} data-chrome-unit="inner-text-button" data-testid="le-test" to={playBoardHref} title={playTitle}>▶ Play test</NavButton>
  ) : (
    <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'le-play-board')} data-testid="le-test" disabled title={playTitle}>▶ Play test</button>
  );

  return (
    <OuterChromeBox
      chromeConsumer="level-editor-controls"
      titled
      className={`skirmish-hud ${className}`.trim()}
      style={style}
      aria-label="Editor controls"
      inert={inert || undefined}
      aria-busy={ariaBusy || undefined}
    >
      <OuterChromeHeader title="Controls">
          <div className="le-layer-picker-row">
            <button
              type="button"
              data-chrome-unit="inner-chevron-key"
              className={chromeUnitClassNames('inner-chevron-key', 'settings-chrome-button', 'settings-chrome-button-neutral', 'le-layer-stepper-button')}
              disabled={layerStepDisabled}
              aria-label="Previous editor layer"
              title="Previous editor layer"
              onClick={() => stepLayer(-1)}
            >
              <span><span className="stepper-glyph stepper-chevron stepper-chevron-left" aria-hidden="true" /></span>
            </button>
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
            <button
              type="button"
              data-chrome-unit="inner-chevron-key"
              className={chromeUnitClassNames('inner-chevron-key', 'settings-chrome-button', 'settings-chrome-button-neutral', 'le-layer-stepper-button')}
              disabled={layerStepDisabled}
              aria-label="Next editor layer"
              title="Next editor layer"
              onClick={() => stepLayer(1)}
            >
              <span><span className="stepper-glyph stepper-chevron stepper-chevron-right" aria-hidden="true" /></span>
            </button>
          </div>
      </OuterChromeHeader>

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
          {extraActions ? <div className="le-action-primary-row">{playAction}{extraActions}</div> : playAction}
        </section>

        <div className="le-control-divider-host" aria-hidden="true">
          <ChromeDivider role="outer" />
        </div>

        <KitScroll className={scrollClass}>
          {children}
        </KitScroll>
    </OuterChromeBox>
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
  return (
    <OuterChromeBox as="div" chromeConsumer="events-overlay" className={`le-events-overlay ${className}`.trim()} style={style} role="dialog" aria-label="Level events editor">
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
    </OuterChromeBox>
  );
}
