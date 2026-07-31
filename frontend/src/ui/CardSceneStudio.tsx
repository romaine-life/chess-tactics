import {
  currentDoodadAssets,
  encodeBoard,
  structureArtDirections,
  STRUCTURE_ART_ASSETS,
} from '@chess-tactics/board-render';
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';
import { PROP_DEFS } from '../core/props';
import { gameplayTerrainForFamily } from '../core/tileSockets';
import { runCardName } from '../run/cardNames';
import {
  cardSceneOverride,
  cardScenesStoreRevision,
  currentCardScenes,
  subscribeCardScenes,
  type CardSceneLandmarkOverride,
  type CardSceneOverride,
} from '../run/cardSceneOverrides';
import { saveLiveCardScenes } from '../net/cardScenes';
import { PIECE_BUNDLE_BY_ID, PIECE_BUNDLE_DECK, bundleLabel, type PieceBundle } from '../run/model';
import { NavButton } from './shared/NavButton';
import {
  runCardScenePlan,
  RunCardScene,
  RUN_CARD_SCENE_CAPTURE,
  RUN_CARD_SCENE_COLS,
  RUN_CARD_SCENE_ROWS,
} from './RunCardScene';

// The Card Scenes instrument (ADR-0029/0057/0058/0071): the Catalog lists every deck
// card's live vignette; the Lab composes one scene — landmark, doodads, props, cover,
// re-deal — over the generated baseline and saves the owner's override document.
// Reset previews the pure generated scene (the authoritative baseline); Save persists.

const CARD_VARIANTS = ['source', 'guide', 'live'] as const;
export type CardSceneVariant = (typeof CARD_VARIANTS)[number];

const TACTICAL_CELLS: string[] = [];
for (let y = 0; y < RUN_CARD_SCENE_ROWS; y += 1) {
  for (let x = 0; x < RUN_CARD_SCENE_COLS; x += 1) TACTICAL_CELLS.push(`${x},${y}`);
}

function deckBundle(cardId?: string): PieceBundle {
  return (cardId ? PIECE_BUNDLE_BY_ID[cardId] : undefined) ?? PIECE_BUNDLE_DECK[0];
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
  onOpen: (cardId: string) => void;
}): ReactElement {
  const query = search.trim().toLowerCase();
  const entries = useMemo(() => PIECE_BUNDLE_DECK.map((bundle) => {
    const plan = runCardScenePlan(bundle);
    return {
      bundle,
      name: runCardName(bundle),
      label: bundleLabel(bundle),
      terrain: gameplayTerrainForFamily(plan.familyId) ?? plan.familyId,
    };
  }), []);
  const visible = entries.filter((entry) => !query
    || `${entry.bundle.id} ${entry.name} ${entry.label} ${entry.terrain} ${entry.bundle.value}`.toLowerCase().includes(query));
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
          title={`${entry.name} — ${entry.label} — ${entry.bundle.value} gold`}
        >
          <span className="tileset-studio-card-image card-scene-card-image">
            <RunCardScene bundle={entry.bundle} className="card-scene-card-scene" />
          </span>
          <span className="tileset-studio-card-meta">
            <span className="tileset-studio-card-text">
              <strong>{entry.name}</strong>
              <em>{entry.label} · {entry.bundle.value}g · {entry.terrain}</em>
            </span>
          </span>
        </button>
      ))}
      {visible.length === 0 ? <p className="tileset-studio-empty">No card matches.</p> : null}
    </div>
  );
}

const landmarkChoices = (): string[] => STRUCTURE_ART_ASSETS
  .filter((asset) => asset.kind === 'landmark' && structureArtDirections(asset.id).length > 0)
  .map((asset) => asset.id)
  .sort((left, right) => left.localeCompare(right));

type SaveState =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'saved'; revision: number }
  | { phase: 'error'; message: string };

const CARD_SCENE_LAB_CSS = `
.card-scene-lab-main { display: grid; align-content: start; gap: 12px; padding: 12px; overflow: auto; }
.card-scene-lab-stagebox { position: relative; border: 1px solid rgba(140, 170, 200, .35); inline-size: ${RUN_CARD_SCENE_CAPTURE.width}px; block-size: ${RUN_CARD_SCENE_CAPTURE.height}px; overflow: hidden; }
.card-scene-lab-stagebox .run-card-scene-viewport { position: absolute; inset: 0; }
.card-scene-lab-meta { display: grid; gap: 2px; }
.card-scene-lab-meta code { user-select: all; overflow-wrap: anywhere; font-size: 11px; opacity: .8; }
.card-scene-cellgrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
.card-scene-cellgrid select { inline-size: 100%; }
.card-scene-cell { display: grid; gap: 2px; font-size: 11px; }
.card-scene-lab-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.card-scene-lab-status { font-size: 12px; opacity: .85; }
.card-scene-lab-status.is-error { color: #ff9d7a; opacity: 1; }
`;

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
  const bundle = deckBundle(cardId);
  const sceneId = bundle.id;
  useSyncExternalStore(subscribeCardScenes, cardScenesStoreRevision);
  const saved = cardSceneOverride(sceneId);

  // The unsaved draft: starts from the saved override (or the generated baseline) and
  // resets whenever the focused card changes.
  const [draftState, setDraftState] = useState<{ sceneId: string; draft: CardSceneOverride | null }>(
    () => ({ sceneId, draft: saved }),
  );
  const draft = draftState.sceneId === sceneId ? draftState.draft : saved;
  useEffect(() => {
    setDraftState((currentDraft) => (
      currentDraft.sceneId === sceneId ? currentDraft : { sceneId, draft: cardSceneOverride(sceneId) }
    ));
  }, [sceneId]);
  const setDraft = (next: CardSceneOverride | null): void => setDraftState({ sceneId, draft: next });
  const patchDraft = (patch: Partial<CardSceneOverride>): void => setDraft({ ...(draft ?? {}), ...patch });

  const [saveState, setSaveState] = useState<SaveState>({ phase: 'idle' });
  const [stageReady, setStageReady] = useState(false);
  useEffect(() => { setStageReady(false); }, [sceneId, variant, draft]);

  const plan = useMemo(() => runCardScenePlan(bundle, draft), [bundle, draft]);
  const generatedForChannels = useMemo(
    () => runCardScenePlan(bundle, { ...(draft ?? {}), landmark: undefined, doodads: undefined, props: undefined }),
    [bundle, draft],
  );
  const terrain = gameplayTerrainForFamily(plan.familyId) ?? plan.familyId;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);

  const doodadOptions = currentDoodadAssets()
    .filter((doodad) => doodad.terrains.includes(plan.familyId))
    .sort((left, right) => left.id.localeCompare(right.id));
  const propOptions = PROP_DEFS
    .filter((def) => def.terrains.includes(plan.familyId)
      && def.w <= RUN_CARD_SCENE_COLS && def.h <= RUN_CARD_SCENE_ROWS)
    .sort((left, right) => left.id.localeCompare(right.id));

  const effectiveLandmark: CardSceneLandmarkOverride | null = plan.board.floatingArtwork?.length
    ? {
        sourceArtId: plan.board.floatingArtwork[0].sourceArtId,
        direction: plan.board.floatingArtwork[0].direction,
        pixelX: plan.board.floatingArtwork[0].pixelX,
        pixelY: plan.board.floatingArtwork[0].pixelY,
        scale: plan.board.floatingArtwork[0].scale,
      }
    : null;
  const landmarkMode = draft?.landmark === undefined ? 'generated' : draft.landmark === null ? 'none' : 'custom';
  const setLandmarkMode = (mode: 'generated' | 'none' | 'custom'): void => {
    if (mode === 'generated') {
      const next = { ...(draft ?? {}) };
      delete next.landmark;
      setDraft(Object.keys(next).length ? next : null);
      return;
    }
    if (mode === 'none') { patchDraft({ landmark: null }); return; }
    const generated = generatedForChannels.board.floatingArtwork?.[0];
    const pool = landmarkChoices();
    const base: CardSceneLandmarkOverride = generated
      ? {
          sourceArtId: generated.sourceArtId,
          direction: generated.direction,
          pixelX: generated.pixelX,
          pixelY: generated.pixelY,
          scale: generated.scale,
        }
      : {
          sourceArtId: pool[0] ?? '',
          direction: pool[0] ? structureArtDirections(pool[0])[0] : 'south',
          pixelX: 0,
          pixelY: -30,
          scale: 0.4,
        };
    patchDraft({ landmark: base });
  };
  const patchLandmark = (patch: Partial<CardSceneLandmarkOverride>): void => {
    if (!draft?.landmark) return;
    patchDraft({ landmark: { ...draft.landmark, ...patch } });
  };

  const setPlacedCell = (channel: 'doodads' | 'props', key: 'doodadId' | 'propId', cell: string, id: string): void => {
    const effective = channel === 'doodads' ? plan.board.doodads : plan.board.props;
    const next: Record<string, { doodadId: string } & { propId: string }> = {};
    for (const [placedCell, placed] of Object.entries(effective)) {
      next[placedCell] = { ...(placed as { doodadId: string } & { propId: string }) };
    }
    if (id) next[cell] = { [key]: id } as { doodadId: string } & { propId: string };
    else delete next[cell];
    patchDraft({ [channel]: next } as Partial<CardSceneOverride>);
  };

  const save = async (): Promise<void> => {
    setSaveState({ phase: 'saving' });
    try {
      const document = currentCardScenes();
      const overrides = { ...(document?.data.overrides ?? {}) };
      if (draft === null || Object.keys(draft).length === 0) delete overrides[sceneId];
      else overrides[sceneId] = draft;
      const savedDocument = await saveLiveCardScenes({ overrides }, document?.revision ?? null);
      setDraftState({ sceneId, draft: savedDocument.data.overrides[sceneId] ?? null });
      setSaveState({ phase: 'saved', revision: savedDocument.revision });
    } catch (error) {
      setSaveState({
        phase: 'error',
        message: error instanceof Error && error.message.includes('409')
          ? 'Save conflict: the document changed elsewhere. Reload the Studio and re-apply.'
          : `Save failed: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  };

  const editorHref = `/editor/level?board=${encodeURIComponent(encodeBoard(plan.board))}`;
  const captureUrl = `${window.location.origin}/studio?mode=viewer&vk=cardscene&card=${sceneId}${variant !== 'source' ? `&cardVariant=${variant}` : ''}`;

  return (
    <>
      <style>{CARD_SCENE_LAB_CSS}</style>
      <section className="al-lab-main card-scene-lab-main" aria-label="Card scene stage">
        <div
          className="card-scene-lab-stagebox run-card-capture-stage"
          data-testid="run-card-capture-stage"
          data-stage-ready={stageReady ? 'true' : undefined}
        >
          <RunCardScene
            bundle={bundle}
            variant={variant}
            camera={RUN_CARD_SCENE_CAPTURE.camera}
            overrideDraft={draft}
            onLayerFirstFrame={() => setStageReady(true)}
          />
        </div>
        <div className="card-scene-lab-meta">
          <strong>{runCardName(bundle)}</strong>
          <span>{bundleLabel(bundle)} · {bundle.value} gold · {terrain} · deal #{draft?.salt ?? 0}{dirty ? ' · unsaved changes' : saved ? ' · saved override' : ' · generated'}</span>
          <code title="npm run shot capture URL for this exact scene state">{captureUrl}</code>
        </div>
      </section>

      <aside className="tileset-view-controls card-scene-lab-controls" aria-label="Card scene controls">
        <section className="tileset-inspector-section">
          <h2>Card Scene</h2>
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
            <div className="card-scene-lab-row">
              <button type="button" className="tileset-view-action" onClick={() => patchDraft({ salt: (draft?.salt ?? 0) + 1 })}>Re-deal scene</button>
              <button type="button" className="tileset-view-action" disabled={draft === null} onClick={() => setDraft(null)} title="Preview the authoritative generated baseline (ADR-0057). Save afterwards to persist.">Reset to generated</button>
            </div>

            <h3>Landmark</h3>
            <label className="tileset-category-select">
              <span>Mode</span>
              <select value={landmarkMode} onChange={(event) => setLandmarkMode(event.target.value as 'generated' | 'none' | 'custom')} aria-label="Landmark mode">
                <option value="generated">Generated</option>
                <option value="none">None</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {landmarkMode === 'custom' && draft?.landmark ? (
              <>
                <label className="tileset-category-select">
                  <span>Artwork</span>
                  <select
                    value={draft.landmark.sourceArtId}
                    onChange={(event) => {
                      const sourceArtId = event.target.value;
                      const directions = structureArtDirections(sourceArtId);
                      patchLandmark({
                        sourceArtId,
                        direction: directions.includes(draft.landmark!.direction) ? draft.landmark!.direction : directions[0],
                      });
                    }}
                    aria-label="Landmark artwork"
                  >
                    {landmarkChoices().map((id) => <option key={id} value={id}>{id}</option>)}
                  </select>
                </label>
                <label className="tileset-category-select">
                  <span>Facing</span>
                  <select
                    value={draft.landmark.direction}
                    onChange={(event) => patchLandmark({ direction: event.target.value as CardSceneLandmarkOverride['direction'] })}
                    aria-label="Landmark facing"
                  >
                    {structureArtDirections(draft.landmark.sourceArtId).map((direction) => (
                      <option key={direction} value={direction}>{direction}</option>
                    ))}
                  </select>
                </label>
                <label className="tileset-catalog-zoom">
                  <span>X {Math.round(draft.landmark.pixelX)}</span>
                  <input type="range" min={-160} max={160} step={1} value={draft.landmark.pixelX} onChange={(event) => patchLandmark({ pixelX: Number(event.target.value) })} />
                </label>
                <label className="tileset-catalog-zoom">
                  <span>Y {Math.round(draft.landmark.pixelY)}</span>
                  <input type="range" min={-90} max={140} step={1} value={draft.landmark.pixelY} onChange={(event) => patchLandmark({ pixelY: Number(event.target.value) })} />
                </label>
                <label className="tileset-catalog-zoom">
                  <span>Scale {draft.landmark.scale.toFixed(2)}</span>
                  <input type="range" min={0.05} max={2} step={0.01} value={draft.landmark.scale} onChange={(event) => patchLandmark({ scale: Number(event.target.value) })} />
                </label>
              </>
            ) : effectiveLandmark ? (
              <p className="card-scene-lab-status">{effectiveLandmark.sourceArtId} · {effectiveLandmark.direction} · ×{effectiveLandmark.scale.toFixed(2)}</p>
            ) : (
              <p className="card-scene-lab-status">No landmark in this scene.</p>
            )}

            <h3>Ground cover</h3>
            <label className="tileset-category-select">
              <span>Grass</span>
              <select
                value={draft?.cover ?? 'generated'}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'generated') {
                    const next = { ...(draft ?? {}) };
                    delete next.cover;
                    setDraft(Object.keys(next).length ? next : null);
                  } else {
                    patchDraft({ cover: value as CardSceneOverride['cover'] });
                  }
                }}
                aria-label="Ground cover"
              >
                <option value="generated">Generated</option>
                <option value="none">None</option>
                <option value="sparse">Sparse</option>
                <option value="filled">Filled</option>
              </select>
            </label>

            <h3>Doodads</h3>
            <div className="card-scene-cellgrid" aria-label="Doodads per tactical cell">
              {TACTICAL_CELLS.map((cell) => (
                <label className="card-scene-cell" key={`doodad-${cell}`}>
                  <span>{cell}</span>
                  <select
                    value={plan.board.doodads[cell]?.doodadId ?? ''}
                    onChange={(event) => setPlacedCell('doodads', 'doodadId', cell, event.target.value)}
                    aria-label={`Doodad at ${cell}`}
                    disabled={Boolean(plan.board.units[cell]) && !plan.board.doodads[cell]}
                  >
                    <option value="">{plan.board.units[cell] ? 'unit' : '—'}</option>
                    {doodadOptions.map((doodad) => <option key={doodad.id} value={doodad.id}>{doodad.id}</option>)}
                  </select>
                </label>
              ))}
            </div>

            <h3>Props</h3>
            <div className="card-scene-cellgrid" aria-label="Props per anchor cell">
              {TACTICAL_CELLS.map((cell) => (
                <label className="card-scene-cell" key={`prop-${cell}`}>
                  <span>{cell}</span>
                  <select
                    value={plan.board.props[cell]?.propId ?? ''}
                    onChange={(event) => setPlacedCell('props', 'propId', cell, event.target.value)}
                    aria-label={`Prop anchored at ${cell}`}
                    disabled={Boolean(plan.board.units[cell]) && !plan.board.props[cell]}
                  >
                    <option value="">{plan.board.units[cell] ? 'unit' : '—'}</option>
                    {propOptions.map((prop) => <option key={prop.id} value={prop.id}>{prop.id}</option>)}
                  </select>
                </label>
              ))}
            </div>

            <h3>Persist</h3>
            <div className="card-scene-lab-row">
              <button type="button" className="tileset-view-action" disabled={!dirty || saveState.phase === 'saving'} onClick={() => { void save(); }}>
                {saveState.phase === 'saving' ? 'Saving…' : 'Save scene'}
              </button>
              <button type="button" className="tileset-view-action" disabled={!dirty} onClick={() => setDraft(saved)} title="Discard unsaved changes back to the saved override.">Revert</button>
            </div>
            {saveState.phase === 'saved' ? <p className="card-scene-lab-status">Saved · document revision {saveState.revision}.</p> : null}
            {saveState.phase === 'error' ? <p className="card-scene-lab-status is-error" role="alert">{saveState.message}</p> : null}

            <h3>Hand-edit</h3>
            <NavButton className="tileset-view-action" to={editorHref}>
              Open this scene in the Level Editor
            </NavButton>
          </div>
        </section>
      </aside>
    </>
  );
}
