import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { saveLiveCardScenes } from '../net/cardScenes';
import { runCardName } from '../run/cardNames';
import {
  cardSceneOverride,
  currentCardScenes,
  CARD_SCENE_FRAME_MAX_WIDTH,
  CARD_SCENE_FRAME_MIN_WIDTH,
  type CardSceneFrame,
  type CardSceneOverride,
} from '../run/cardSceneOverrides';
import { PIECE_BUNDLE_BY_ID, bundleLabel, type PieceBundle } from '../run/model';
import { chromeUnitClassNames } from './chromeUnitRegistry';
import { NavButton } from './shared/NavButton';
import { SliderRow } from './dressing/SliderRow';
import {
  cardSceneFrameHeight,
  defaultCardSceneFrame,
  runCardScenePlan,
} from './RunCardScene';
import { encodeBoard, type EditorBoard } from './boardCode';

// The Level Editor's card-scene composing mode (ADR-0262): the Studio Card Scenes
// catalog opens `/editor/level?cardScene=<card-id>`, which loads the card's authored
// or generated scene into the ordinary editor with the level-only layers disabled.
// This module owns the mode's rail panel (save/reset/frame) and the on-stage viewing
// pane overlay; the editor supplies board state and mounts both.

export const CARD_SCENE_RETURN_HREF = '/studio?cat=cardscenes';

/**
 * Layers that do not translate to a card scene (level semantics, sessions, units).
 * Generate stays available — the terrain generator composes scene fields; it is the
 * document-bound Level Artwork pipeline that has no card-scene meaning.
 */
export const CARD_SCENE_LOCKED_LAYERS: ReadonlySet<string> = new Set([
  'level-artwork',
  'unit',
  'zone',
  'rules',
  'status',
  'recovery',
]);

export function cardSceneBundleFor(cardSceneId: string | undefined): PieceBundle | null {
  return (cardSceneId && PIECE_BUNDLE_BY_ID[cardSceneId]) || null;
}

/** The board the editor opens with: the saved authored scene, else the generated one. */
export function cardSceneInitialBoard(bundle: PieceBundle): EditorBoard {
  return runCardScenePlan(bundle).board;
}

export function cardSceneSavedFrame(cardId: string): CardSceneFrame {
  return cardSceneOverride(cardId)?.frame ?? defaultCardSceneFrame();
}

/** Strip the derived channels the document must never persist. */
export function cardSceneBoardForSave(board: EditorBoard): EditorBoard {
  return { ...board, units: {} };
}

type SaveState =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'saved'; revision: number }
  | { phase: 'error'; message: string };

export function CardSceneEditorPanel({
  bundle,
  board,
  frame,
  frameVisible,
  onFrame,
  onFrameVisible,
  onLoadBoard,
}: {
  bundle: PieceBundle;
  board: EditorBoard;
  frame: CardSceneFrame;
  frameVisible: boolean;
  onFrame: (frame: CardSceneFrame) => void;
  onFrameVisible: (visible: boolean) => void;
  /** Replace the whole editor board (Load generated / Re-deal / Delete). */
  onLoadBoard: (board: EditorBoard) => void;
}): ReactElement {
  const cardId = bundle.id;
  const [saveState, setSaveState] = useState<SaveState>({ phase: 'idle' });
  const saved = cardSceneOverride(cardId);
  const defaultFrame = defaultCardSceneFrame();

  const persist = async (override: CardSceneOverride | null): Promise<void> => {
    setSaveState({ phase: 'saving' });
    try {
      const document = currentCardScenes();
      const overrides = { ...(document?.data.overrides ?? {}) };
      if (override === null) delete overrides[cardId];
      else overrides[cardId] = override;
      const savedDocument = await saveLiveCardScenes({ overrides }, document?.revision ?? null);
      setSaveState({ phase: 'saved', revision: savedDocument.revision });
    } catch (error) {
      setSaveState({
        phase: 'error',
        message: `Save failed: ${error instanceof Error ? error.message : String(error)}. Sign in as the owner, then retry; a 409 means the document changed elsewhere — reload this page first.`,
      });
    }
  };

  const loadGenerated = (salt: number): void => {
    const plan = runCardScenePlan(bundle, salt === 0 ? null : { salt });
    onLoadBoard(plan.board);
  };

  return (
    <section className="skirmish-card le-card-scene-panel" data-testid="le-card-scene-panel">
      <h2>Card Scene</h2>
      <p className="le-board-note">
        <strong>{runCardName(bundle)}</strong> — {bundleLabel(bundle)} · {bundle.value} gold
        · {saved ? 'authored scene saved' : 'generated scene'}
      </p>
      <p className="le-board-note">
        Compose the card&apos;s battlefield. Units are the card&apos;s mustered formation —
        derived from the card, not editable here. The tactical stage stays 3×3.
      </p>
      <div className="le-inline-actions le-card-scene-actions">
        <button
          type="button"
          data-chrome-unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'active')}
          disabled={saveState.phase === 'saving'}
          data-testid="le-card-scene-save"
          onClick={() => {
            void persist({ board: encodeBoard(cardSceneBoardForSave(board)), frame });
          }}
        >
          {saveState.phase === 'saving' ? 'Saving…' : 'Save scene'}
        </button>
        <button
          type="button"
          data-chrome-unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          title="Load the authoritative generated baseline into the editor (unsaved until you Save)."
          onClick={() => { onFrame(defaultFrame); loadGenerated(0); }}
        >
          Load generated
        </button>
        <button
          type="button"
          data-chrome-unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          title="Load a differently-dealt generated scene into the editor."
          onClick={() => loadGenerated(1 + Math.floor(Math.random() * 1_000_000))}
        >
          Re-deal
        </button>
        <button
          type="button"
          data-chrome-unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', 'danger')}
          disabled={!saved || saveState.phase === 'saving'}
          title="Delete the saved authored scene; the card returns to its generated scene."
          onClick={() => { void persist(null).then(() => { onFrame(defaultFrame); loadGenerated(0); }); }}
        >
          Delete saved
        </button>
      </div>
      {saveState.phase === 'saved' ? (
        <p className="le-board-note" role="status">Saved · document revision {saveState.revision}. Every card surface now reads this scene.</p>
      ) : null}
      {saveState.phase === 'error' ? (
        <p className="le-board-note le-card-scene-error" role="alert">{saveState.message}</p>
      ) : null}

      <h3 className="le-settings-label">Card viewing pane</h3>
      <p className="le-board-note">
        The pane is what the final card shows. Drag it on the board; Width zooms the
        final shot (smaller pane = closer).
      </p>
      <div className="le-inline-actions">
        <button
          type="button"
          data-chrome-unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn', frameVisible && 'active')}
          aria-pressed={frameVisible}
          data-testid="le-card-scene-frame-toggle"
          onClick={() => onFrameVisible(!frameVisible)}
        >
          {frameVisible ? 'Hide pane' : 'Show pane'}
        </button>
      </div>
      <SliderRow label="Pane X" value={Math.round(frame.x)} set={(x) => onFrame({ ...frame, x })} min={-320} max={320} dflt={defaultFrame.x} />
      <SliderRow label="Pane Y" value={Math.round(frame.y)} set={(y) => onFrame({ ...frame, y })} min={-240} max={300} dflt={defaultFrame.y} />
      <SliderRow
        label="Pane width (zoom)"
        value={Math.round(frame.width)}
        set={(width) => onFrame({ ...frame, width })}
        min={CARD_SCENE_FRAME_MIN_WIDTH}
        max={CARD_SCENE_FRAME_MAX_WIDTH}
        nudge={4}
        dflt={defaultFrame.width}
      />

      <div className="le-inline-actions">
        <NavButton
          data-chrome-unit="inner-text-button"
          className={chromeUnitClassNames('inner-text-button', 'le-seg-btn')}
          to={CARD_SCENE_RETURN_HREF}
        >
          ‹ Back to Card Scenes
        </NavButton>
      </div>
    </section>
  );
}

/**
 * The viewing pane drawn in board-world space (a TileGrid child, so it pans and zooms
 * with the board). Dragging moves the pane centre; the rail sliders are the precise
 * controls.
 */
export function CardSceneFrameOverlay({
  frame,
  boardZoom,
  onFrame,
}: {
  frame: CardSceneFrame;
  boardZoom: number;
  onFrame: (frame: CardSceneFrame) => void;
}): ReactElement {
  const height = cardSceneFrameHeight(frame);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; frame: CardSceneFrame } | null>(null);
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, frame };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const zoom = boardZoom || 1;
    onFrame({
      ...drag.frame,
      x: drag.frame.x + (event.clientX - drag.startX) / zoom,
      y: drag.frame.y + (event.clientY - drag.startY) / zoom,
    });
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
  };
  return (
    <div
      className="le-card-scene-frame"
      data-testid="le-card-scene-frame"
      role="presentation"
      style={{
        left: `${frame.x - frame.width / 2}px`,
        top: `${frame.y - height / 2}px`,
        width: `${frame.width}px`,
        height: `${height}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      title="The final card's viewing pane — drag to place"
    >
      <span className="le-card-scene-frame-label">card pane</span>
    </div>
  );
}
