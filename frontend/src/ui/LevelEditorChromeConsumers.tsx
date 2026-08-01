import { useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { KitScroll } from './KitScroll';
import { NavButton } from './shared/NavButton';
import { HouseSelect } from './shared/HouseSelect';
import { ChromeDivider, ShellControlsPanel, ShellWorkspace } from './shared/ChromeBox';
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
  toolsDisabled = false,
  onToolChange,
  eraseLabel = 'Erase',
  eraseDisabled: eraseActionDisabled = false,
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
  /** Whether this destination has no board-tool interaction at all. A null tool only means none appears active. */
  toolsDisabled?: boolean;
  tool: LevelEditorToolKey | null;
  onToolChange: (tool: LevelEditorToolKey) => void;
  /** Artwork uses this registered slot as an immediate delete-selected action, not an erase mode. */
  eraseLabel?: string;
  eraseDisabled?: boolean;
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
  const eraseDisabled = toolsDisabled || eraseActionDisabled;
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
    <ShellControlsPanel
      className={className}
      style={style}
      aria-label="Editor controls"
      inert={inert || undefined}
      aria-busy={ariaBusy || undefined}
      titleContent={(
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
      )}
    >

        <section className="skirmish-card le-actions-dock" aria-label="Editor actions">
          <h2>Actions</h2>
          <div className="le-seg le-seg-icons le-action-toolbar" role="toolbar" aria-label="Editor tools and history">
            <button type="button" data-chrome-unit="inner-select-tool" className={chromeUnitClassNames('inner-select-tool', 'le-seg-btn', tool === 'select' && 'active')} disabled={toolsDisabled} onClick={() => onToolChange('select')} title={toolsDisabled ? 'Board tools are unavailable in this workspace.' : 'Select'} aria-label="Select"><span className="le-ico ic-eyedropper" aria-hidden="true" /></button>
            <button type="button" data-chrome-unit="inner-brush-tool" className={chromeUnitClassNames('inner-brush-tool', 'le-seg-btn', tool === 'brush' && 'active')} disabled={toolsDisabled} onClick={() => onToolChange('brush')} title={toolsDisabled ? 'Board tools are unavailable in this workspace.' : 'Brush'} aria-label="Brush"><span className="le-ico ic-brush" aria-hidden="true" /></button>
            <button type="button" data-chrome-unit="inner-erase-tool" className={chromeUnitClassNames('inner-erase-tool', 'le-seg-btn', tool === 'erase' && 'active')} disabled={eraseDisabled} onClick={() => onToolChange('erase')} title={toolsDisabled ? 'Board tools are unavailable in this workspace.' : eraseLabel} aria-label={eraseLabel}><span className="le-ico ic-eraser" aria-hidden="true" /></button>
            <button type="button" data-chrome-unit="inner-move-tool" className={chromeUnitClassNames('inner-move-tool', 'le-seg-btn', tool === 'move' && 'active')} disabled={toolsDisabled} onClick={() => onToolChange('move')} title={toolsDisabled ? 'Board tools are unavailable in this workspace.' : 'Move - drag a placed unit or prop to a new cell.'} aria-label="Move"><span className="le-ico ic-move" aria-hidden="true" /></button>
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
    </ShellControlsPanel>
  );
}

export function LevelEditorEventsWorkspace({
  tab,
  onTabChange,
  onDone,
  victoryContent,
  deploymentContent,
  otherContent,
}: {
  tab: 'victory' | 'deployment' | 'other';
  onTabChange: (tab: 'victory' | 'deployment' | 'other') => void;
  onDone: () => void;
  victoryContent: ReactNode;
  deploymentContent: ReactNode;
  otherContent: ReactNode;
}): ReactElement {
  const initialFocusRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    initialFocusRef.current?.focus();
  }, []);

  return (
    <ShellWorkspace
      className="le-events-workspace"
      bodyClassName="le-events-workspace-content"
      data-testid="level-events-workspace"
      aria-labelledby="level-events-workspace-title"
    >
      <div className="le-events-head">
        <h2 id="level-events-workspace-title">Events</h2>
        <div className="le-events-head-actions">
          <div className="le-seg le-events-tabs" role="tablist" aria-label="Event editor sections">
            <button ref={tab === 'victory' ? initialFocusRef : undefined} type="button" data-chrome-unit="inner-text-button" role="tab" aria-selected={tab === 'victory'} className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', tab === 'victory' && 'active')} onClick={() => onTabChange('victory')}>Victory rules</button>
            <button ref={tab === 'deployment' ? initialFocusRef : undefined} type="button" data-chrome-unit="inner-text-button" role="tab" aria-selected={tab === 'deployment'} className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', tab === 'deployment' && 'active')} onClick={() => onTabChange('deployment')}>Deployment</button>
            <button ref={tab === 'other' ? initialFocusRef : undefined} type="button" data-chrome-unit="inner-text-button" role="tab" aria-selected={tab === 'other'} className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', tab === 'other' && 'active')} onClick={() => onTabChange('other')}>Other events</button>
          </div>
          <button type="button" data-chrome-unit="inner-text-button" className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'le-events-done')} onClick={onDone}>Done</button>
        </div>
      </div>
      {tab === 'victory' ? victoryContent : tab === 'deployment' ? deploymentContent : otherContent}
    </ShellWorkspace>
  );
}
