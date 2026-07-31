import { useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { gameplayTerrainForFamily } from '../core/tileSockets';
import { runCardName } from '../run/cardNames';
import { cardSceneOverride, cardScenesStoreRevision, subscribeCardScenes } from '../run/cardSceneOverrides';
import { PIECE_BUNDLE_BY_ID, PIECE_BUNDLE_DECK, bundleLabel, type PieceBundle } from '../run/model';
import { NavButton } from './shared/NavButton';
import { runCardScenePlan, RunCardScene, RUN_CARD_SCENE_CAPTURE } from './RunCardScene';
import { useSyncExternalStore } from 'react';

// The Card Scenes surfaces (ADR-0263): the Catalog lists every deck card's live
// vignette and opens the real Level Editor in card-scene mode for composing —
// full placement interface, Save to the owner's scene document. The `cardscene`
// Viewer keeps only the fixed capture stage: the exact export raster (the card's
// authored frame) that `npm run shot` targets for the img2img seeds.

const CARD_VARIANTS = ['source', 'guide', 'live'] as const;
export type CardSceneVariant = (typeof CARD_VARIANTS)[number];

function deckBundle(cardId?: string): PieceBundle {
  return (cardId ? PIECE_BUNDLE_BY_ID[cardId] : undefined) ?? PIECE_BUNDLE_DECK[0];
}

/** The Level Editor's card-scene composing mode for one card. */
export function cardSceneEditorHref(cardId: string): string {
  return `/editor/level?cardScene=${encodeURIComponent(cardId)}`;
}

export function CardSceneCatalog({
  search,
  selected,
  onSelect,
  onOpen,
}: {
  search: string;
  selected?: string;
  onSelect: (cardId: string) => void;
  /** Secondary open — the capture-stage viewer (double-click). */
  onOpen: (cardId: string) => void;
}): ReactElement {
  useSyncExternalStore(subscribeCardScenes, cardScenesStoreRevision);
  const query = search.trim().toLowerCase();
  const entries = PIECE_BUNDLE_DECK.map((bundle) => {
    const plan = runCardScenePlan(bundle);
    return {
      bundle,
      name: runCardName(bundle),
      label: bundleLabel(bundle),
      terrain: gameplayTerrainForFamily(plan.familyId) ?? plan.familyId,
      authored: plan.authored,
    };
  });
  const visible = entries.filter((entry) => !query
    || `${entry.bundle.id} ${entry.name} ${entry.label} ${entry.terrain} ${entry.bundle.value}${entry.authored ? ' authored' : ' generated'}`.toLowerCase().includes(query));
  return (
    <div className="tileset-studio-grid pages-grid" aria-label="Run card scenes">
      {visible.map((entry) => (
        <button
          key={entry.bundle.id}
          type="button"
          className={`tileset-studio-card card-scene-card ${entry.bundle.id === selected ? 'is-selected' : ''}`.trim()}
          onClick={() => onSelect(entry.bundle.id)}
          onDoubleClick={() => onOpen(entry.bundle.id)}
          aria-pressed={entry.bundle.id === selected}
          title={`${entry.name} — ${entry.label} — ${entry.bundle.value} gold${entry.authored ? ' — authored scene' : ''}`}
        >
          <span className="tileset-studio-card-image card-scene-card-image">
            <RunCardScene bundle={entry.bundle} className="card-scene-card-scene" />
          </span>
          <span className="tileset-studio-card-meta">
            <span className="tileset-studio-card-text">
              <strong>{entry.name}</strong>
              <em>{entry.label} · {entry.bundle.value}g · {entry.terrain}{entry.authored ? ' · authored' : ''}</em>
            </span>
          </span>
        </button>
      ))}
      {visible.length === 0 ? <p className="tileset-studio-empty">No card matches.</p> : null}
    </div>
  );
}

const CARD_SCENE_STAGE_CSS = `
.card-scene-lab-main { display: grid; align-content: start; gap: 12px; padding: 12px; overflow: auto; }
.card-scene-lab-stagebox { position: relative; border: 1px solid rgba(140, 170, 200, .35); inline-size: ${RUN_CARD_SCENE_CAPTURE.width}px; block-size: ${RUN_CARD_SCENE_CAPTURE.height}px; overflow: hidden; }
.card-scene-lab-stagebox .run-card-scene-viewport { position: absolute; inset: 0; }
.card-scene-lab-meta { display: grid; gap: 2px; }
.card-scene-lab-meta code { user-select: all; overflow-wrap: anywhere; font-size: 11px; opacity: .8; }
.card-scene-lab-status { font-size: 12px; opacity: .85; }
`;

/**
 * The `cardscene` Viewer: the fixed export stage rendering one card's authored frame
 * at the capture raster. Composing happens in the Level Editor's card-scene mode.
 */
export function CardSceneLab({
  cardId,
  onCardId,
  variant,
  onVariant,
  header,
}: {
  cardId?: string;
  onCardId: (cardId: string) => void;
  variant: CardSceneVariant;
  onVariant: (variant: CardSceneVariant) => void;
  header?: ReactNode;
}): ReactElement {
  useSyncExternalStore(subscribeCardScenes, cardScenesStoreRevision);
  const bundle = deckBundle(cardId);
  const sceneId = bundle.id;
  const saved = cardSceneOverride(sceneId);
  const [stageReady, setStageReady] = useState(false);
  const stageKey = `${sceneId}:${variant}:${cardScenesStoreRevision()}`;
  const terrain = useMemo(() => {
    const plan = runCardScenePlan(bundle);
    return gameplayTerrainForFamily(plan.familyId) ?? plan.familyId;
  }, [bundle, saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const captureUrl = `${window.location.origin}/studio?mode=viewer&vk=cardscene&card=${sceneId}${variant !== 'source' ? `&cardVariant=${variant}` : ''}`;

  return (
    <>
      <style>{CARD_SCENE_STAGE_CSS}</style>
      <section className="al-lab-main card-scene-lab-main" aria-label="Card scene capture stage">
        <div
          className="card-scene-lab-stagebox run-card-capture-stage"
          data-testid="run-card-capture-stage"
          data-stage-ready={stageReady ? 'true' : undefined}
        >
          <RunCardScene
            key={stageKey}
            bundle={bundle}
            variant={variant}
            onLayerFirstFrame={() => setStageReady(true)}
          />
        </div>
        <div className="card-scene-lab-meta">
          <strong>{runCardName(bundle)}</strong>
          <span>{bundleLabel(bundle)} · {bundle.value} gold · {terrain} · {saved ? 'authored scene' : 'generated scene'}</span>
          <code title="npm run shot capture URL for this exact scene state">{captureUrl}</code>
        </div>
      </section>

      <aside className="tileset-view-controls card-scene-lab-controls" aria-label="Card scene capture controls">
        <section className="tileset-inspector-section">
          <h2>Capture Stage</h2>
          <div className="tileset-control-stack">
            {header}
            <label className="tileset-category-select">
              <span>Card</span>
              <select value={sceneId} onChange={(event) => onCardId(event.target.value)} aria-label="Card">
                {PIECE_BUNDLE_DECK.map((deckEntry) => (
                  <option key={deckEntry.id} value={deckEntry.id}>
                    {runCardName(deckEntry)} ({deckEntry.id})
                  </option>
                ))}
              </select>
            </label>
            <label className="tileset-category-select">
              <span>Variant</span>
              <select value={variant} onChange={(event) => onVariant(event.target.value as CardSceneVariant)} aria-label="Stage variant">
                <option value="source">Art seed (no units)</option>
                <option value="guide">Art seed with units</option>
                <option value="live">Live card composition</option>
              </select>
            </label>
            <p className="card-scene-lab-status">
              The stage renders the card&apos;s saved viewing pane at the export raster
              ({RUN_CARD_SCENE_CAPTURE.width}×{RUN_CARD_SCENE_CAPTURE.height}).
            </p>
            <NavButton className="tileset-view-action" to={cardSceneEditorHref(sceneId)}>
              Compose in the Scene Editor
            </NavButton>
          </div>
        </section>
      </aside>
    </>
  );
}
