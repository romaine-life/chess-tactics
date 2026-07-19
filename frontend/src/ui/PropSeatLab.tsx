import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { tileAssets, tileFamilies, type TileAsset } from '../art/tileset';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard, boardLabCellPosition } from '../render/BoardLabBoard';
import { PropSprite } from '../render/BoardStructure';
import { objectBaseZIndex } from '../render/sceneDepth';
import { TILE_TEMPLATE } from '../art/tileTemplate';
import { PROP_DEFS, propCells, currentSeats, applyPropSeats, type PropDef, type PropKind, type PropSeatEntry, type PropSeatMap, type StructurePart, type StructurePlacement, type StructureSourceRef } from '../core/props';
import { pieceSpritePath } from '../core/pieces';
import { ViewPane } from './shared/ViewPane';
import { SliderRow } from './dressing/SliderRow';
import { saveLiveSeats } from '../net/propSeats';
import { mapSaveError } from '../campaign/save';
import { currentDoodadAssets, type DoodadAsset } from './doodadCatalog';
import { STRUCTURE_ART_ASSETS, structureArtAsset, type StructureArtAsset } from '../core/structureArt';
import { terrainFamiliesForRole } from '../core/tileSockets';

// The prop-seat editor as an embedded Studio Viewer kind (docs/studio-control-architecture.md,
// ADR-0058): it renders into the shared studio shell — the board in `.al-lab-main`, EVERY
// control in the one `.tileset-view-controls` panel, the workspace tabs + kind selector in the
// `header` slot — exactly like NineSliceLab / PortraitLab. It is reached from the Props catalog
// category's Inspect affordance, never a standalone route. It tunes how a multi-cell prop
// (tree/house) SITS on its tiles through the real PropSprite path, then Saves the seat map LIVE to
// the DB (PUT /api/prop-seats/default, admin-gated, instant-live per ADR-0061). ADR-0085 makes
// that complete document the only PROP_DEFS authority.

type Seat = { anchorX: number; anchorY: number; scale: number; w?: number; h?: number; base?: string; label?: string };
type Seats = Record<string, Seat>;
export interface StructureEditorDraft {
  target: StructurePlacement;
  source?: StructureSourceRef;
  editId?: string;
  copyFrom?: { target: StructurePlacement; id: string };
}

type Family = string;
const previewFamilies = () => terrainFamiliesForRole('prop-seat-preview');
const defaultPreviewFamily = (): Family => {
  const family = terrainFamiliesForRole('prop-seat-preview-default')[0];
  if (!family) throw new Error('drawable catalog has no default prop-seat preview terrain');
  return family.id;
};
const COLS = 9;
const ROWS = 7;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const round2 = (n: number) => Math.round(n * 100) / 100;
const DEFAULT_DOODAD_SPRITE = { w: 96, h: 180, anchorX: 48, anchorY: 69, scale: 1 };
const slugify = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
const draftIdInput = (value: string): string => value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').slice(0, 80);
const parseTerrains = (value: string): string[] => value.split(',').map((part) => part.trim()).filter(Boolean);
const sourceKey = (source: StructureSourceRef): string => `${source.kind}:${source.id}`;

// The 8-direction nudge pad, row-major (null = the inert centre dot). vx/vy are SCREEN deltas
// (vx>0 = right, vy>0 = down); `nudge` maps them to anchor deltas. `deg` rotates one up-arrow.
const NUDGE_PAD: Array<{ key: string; name: string; vx: number; vy: number; deg: number } | null> = [
  { key: 'nw', name: 'up-left', vx: -1, vy: -1, deg: 315 },
  { key: 'n', name: 'up', vx: 0, vy: -1, deg: 0 },
  { key: 'ne', name: 'up-right', vx: 1, vy: -1, deg: 45 },
  { key: 'w', name: 'left', vx: -1, vy: 0, deg: 270 },
  null,
  { key: 'e', name: 'right', vx: 1, vy: 0, deg: 90 },
  { key: 'sw', name: 'down-left', vx: -1, vy: 1, deg: 225 },
  { key: 's', name: 'down', vx: 0, vy: 1, deg: 180 },
  { key: 'se', name: 'down-right', vx: 1, vy: 1, deg: 135 },
];

// One up-pointing arrow, drawn (not a font glyph) so every rotation is pixel-identical.
function DirArrow({ deg }: { deg: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ display: 'block', transform: `rotate(${deg}deg)` }}>
      <path d="M12 4 L19 13 L14.5 13 L14.5 20 L9.5 20 L9.5 13 L5 13 Z" fill="currentColor" />
    </svg>
  );
}

export function PropSeatLab({ propId, onPropId, header, draft, onDraftChange }: {
  propId: string; onPropId: (id: string) => void; header?: ReactNode; draft?: StructureEditorDraft | null; onDraftChange?: (draft: StructureEditorDraft | null) => void;
}): ReactElement {
  const activeId = PROP_DEFS.some((d) => d.id === propId) ? propId : PROP_DEFS[0].id;
  const selectedPropDef = PROP_DEFS.find((d) => d.id === activeId) as PropDef;
  const doodadSources = currentDoodadAssets();
  const sourceAsArt = (source: StructureSourceRef): StructureSourceRef => (
    source.kind === 'asset' || !structureArtAsset(source.id) ? source : { kind: 'asset', id: source.id }
  );
  const fallbackSource: StructureSourceRef = sourceAsArt(selectedPropDef.spriteParts?.[0]?.source ?? selectedPropDef.spriteSource ?? { kind: 'asset', id: STRUCTURE_ART_ASSETS[0].id });
  const sourceInfo = (source: StructureSourceRef): {
    label: string;
    terrains: string[];
    kind: PropKind;
    sprite: { w: number; h: number; anchorX: number; anchorY: number; scale?: number };
    art?: StructureArtAsset;
    prop?: PropDef;
    doodad?: DoodadAsset;
  } => {
    if (source.kind === 'asset') {
      const art = structureArtAsset(source.id) ?? structureArtAsset(STRUCTURE_ART_ASSETS[0].id)!;
      const kind: PropKind = art.propKind ?? (art.kind === 'tree' || art.kind === 'rock' ? art.kind : 'house');
      return { label: art.label, terrains: art.terrains, kind, sprite: art.sprite, art };
    }
    if (source.kind === 'prop') {
      const prop = PROP_DEFS.find((d) => d.id === source.id) ?? PROP_DEFS[0];
      return { label: prop.label, terrains: prop.terrains, kind: prop.kind, sprite: prop.sprite, prop };
    }
    const doodad = doodadSources.find((d) => d.id === source.id) ?? doodadSources[0];
    return { label: doodad.label, terrains: doodad.terrains, kind: 'house', sprite: doodad.sprite ?? DEFAULT_DOODAD_SPRITE, doodad };
  };
  const seatFromSource = (source: StructureSourceRef): Seat => {
    const info = sourceInfo(source);
    return {
      anchorX: info.sprite.anchorX,
      anchorY: info.sprite.anchorY,
      scale: info.sprite.scale ?? 1,
      w: info.prop?.w ?? info.art?.footprint?.w ?? 1,
      h: info.prop?.h ?? info.art?.footprint?.h ?? 1,
    };
  };
  const partFromSource = (source: StructureSourceRef): StructurePart => {
    const normalizedSource = sourceAsArt(source);
    const seat = seatFromSource(normalizedSource);
    return { source: normalizedSource, anchorX: seat.anchorX, anchorY: seat.anchorY, scale: seat.scale };
  };
  const footprintFromSource = (source: StructureSourceRef): { w: number; h: number } => {
    const seat = seatFromSource(source);
    return { w: seat.w ?? 1, h: seat.h ?? 1 };
  };
  const partsFromDoodad = (asset: DoodadAsset): StructurePart[] => (
    asset.parts?.length
      ? asset.parts.map((part) => ({ ...part, source: sourceAsArt(part.source) }))
      : [partFromSource(sourceAsArt(asset.source ?? { kind: 'asset', id: asset.id }))]
  );
  const partsFromProp = (def: PropDef): StructurePart[] => (
    def.spriteParts?.length
      ? def.spriteParts.map((part) => ({ ...part, source: sourceAsArt(part.source) }))
      : [{ source: sourceAsArt(def.spriteSource ?? { kind: 'asset', id: def.spriteId }), anchorX: def.sprite.anchorX, anchorY: def.sprite.anchorY, scale: def.sprite.scale }]
  );
  const draftSeed = (): {
    target: StructurePlacement;
    slots: StructurePart[];
    footprint: { w: number; h: number };
    name: string;
    id: string;
    terrains: string;
  } => {
    if (draft?.editId) {
      if (draft.target === 'doodad') {
        const asset = doodadSources.find((d) => d.id === draft.editId) ?? doodadSources[0];
        return { target: 'doodad', slots: partsFromDoodad(asset), footprint: { w: 1, h: 1 }, name: asset.label, id: asset.id, terrains: asset.terrains.join(', ') };
      }
      const def = PROP_DEFS.find((d) => d.id === draft.editId) ?? selectedPropDef;
      return { target: 'prop', slots: partsFromProp(def), footprint: { w: def.w, h: def.h }, name: def.label, id: def.id, terrains: def.terrains.join(', ') };
    }
    if (draft?.copyFrom) {
      if (draft.copyFrom.target === 'doodad') {
        const asset = doodadSources.find((d) => d.id === draft.copyFrom?.id) ?? doodadSources[0];
        return { target: draft.target, slots: partsFromDoodad(asset), footprint: { w: 1, h: 1 }, name: `${asset.label} copy`, id: '', terrains: asset.terrains.join(', ') };
      }
      const def = PROP_DEFS.find((d) => d.id === draft.copyFrom?.id) ?? selectedPropDef;
      return { target: draft.target, slots: partsFromProp(def), footprint: { w: def.w, h: def.h }, name: `${def.label} copy`, id: '', terrains: def.terrains.join(', ') };
    }
    const source = sourceAsArt(draft?.source ?? fallbackSource);
    const info = sourceInfo(source);
    return {
      target: draft?.target ?? 'prop',
      slots: [partFromSource(source)],
      footprint: footprintFromSource(source),
      name: `${info.label.replace(/\s+art$/i, '')} ${draft?.target ?? 'prop'}`,
      id: '',
      terrains: info.terrains.join(', '),
    };
  };
  const initialDraft = draftSeed();
  const initialDraftPart = initialDraft.slots[0] ?? partFromSource(fallbackSource);
  const [family, setFamily] = useState<Family>(defaultPreviewFamily);
  const [seed, setSeed] = useState(7);
  const [zoom, setZoom] = useState(1.4);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showGuides, setShowGuides] = useState(true);
  const [showUnit, setShowUnit] = useState(true);
  const [showSavedGhost, setShowSavedGhost] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Seat>>({});
  const [status, setStatus] = useState('');
  const [variantName, setVariantName] = useState('');
  const [renameText, setRenameText] = useState('');
  const [draftTarget, setDraftTarget] = useState<StructurePlacement>(initialDraft.target);
  const [draftSlots, setDraftSlots] = useState<StructurePart[]>(() => initialDraft.slots);
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);
  const [draftFootprint, setDraftFootprint] = useState(initialDraft.footprint);
  const [draftName, setDraftName] = useState(initialDraft.name);
  const [draftId, setDraftId] = useState(initialDraft.id);
  const [draftTerrains, setDraftTerrains] = useState(initialDraft.terrains);
  const drag = useRef<{ px: number; py: number; anchorX: number; anchorY: number } | null>(null);

  // The currently-saved complete DB map that PROP_DEFS is derived from. This is
  // the "saved" state to diff against and to re-publish untouched.
  const committedSeats = currentSeats() as Seats;
  const seats: Seats = { ...committedSeats, ...overrides };
  const draftMode = Boolean(draft);
  const editMode = Boolean(draft?.editId);
  const existingDef = selectedPropDef;
  const activeSlotIndex = Math.min(selectedSlotIndex, Math.max(0, draftSlots.length - 1));
  const activeDraftSlot = draftSlots[activeSlotIndex] ?? initialDraftPart;
  const draftSource = activeDraftSlot.source;
  const draftInfo = sourceInfo(draftSource);
  const draftSeat: Seat = { ...activeDraftSlot, w: draftFootprint.w, h: draftFootprint.h };
  const normalizedDraftId = editMode ? draftId : (slugify(draftId || draftName) || `new-${draftTarget}`);
  const draftDef: PropDef = {
    id: normalizedDraftId,
    label: draftName.trim() || `New ${draftTarget}`,
    kind: draftInfo.kind,
    w: draftTarget === 'doodad' ? 1 : draftFootprint.w,
    h: draftTarget === 'doodad' ? 1 : draftFootprint.h,
    blocking: draftTarget === 'prop',
    terrains: parseTerrains(draftTerrains),
    spriteId: draftSource.kind === 'prop' ? (draftInfo.prop?.spriteId ?? draftSource.id) : normalizedDraftId,
    spriteSource: draftSlots[0]?.source ?? draftSource,
    spriteParts: draftSlots,
    family: normalizedDraftId,
    sprite: { w: draftInfo.sprite.w, h: draftInfo.sprite.h, anchorX: draftSeat.anchorX, anchorY: draftSeat.anchorY, scale: draftSeat.scale },
  };
  const def = draftMode ? draftDef : existingDef;
  const liveSeat = draftMode ? draftSeat : seats[activeId];
  const committed = draftMode ? { ...seatFromSource(draftSource), ...draftFootprint } : committedSeats[activeId];
  // Base vs copy (the user's model): a base OWNS its sprite (spriteId === id) and can't be deleted;
  // a copy shares another prop's sprite (spriteId !== id) and is free to rename/delete. baseDef is
  // the sprite owner either way (itself for a base), so "make/rename a copy" always roots at the base.
  const isCopy = !draftMode && def.spriteId !== def.id;
  const baseDef = !draftMode ? (PROP_DEFS.find((d) => d.id === def.spriteId) ?? def) : def;
  // Live gameplay footprint — an override's w/h if set, else the committed def's cells.
  const liveW = draftMode && draftTarget === 'doodad' ? 1 : liveSeat.w ?? def.w;
  const liveH = draftMode && draftTarget === 'doodad' ? 1 : liveSeat.h ?? def.h;
  const sameSeat = (a: Seat | undefined, b: Seat | undefined) =>
    !!a && !!b && a.anchorX === b.anchorX && a.anchorY === b.anchorY && a.scale === b.scale && a.w === b.w && a.h === b.h;
  const dirty = draftMode || Object.keys(overrides).some((id) => !sameSeat(overrides[id], committedSeats[id]));

  useEffect(() => {
    if (!draft) return;
    const next = draftSeed();
    setDraftTarget(next.target);
    setDraftSlots(next.slots);
    setSelectedSlotIndex(0);
    setDraftFootprint(next.footprint);
    setDraftName(next.name);
    setDraftId(next.id);
    setDraftTerrains(next.terrains);
    setStatus('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.target, draft?.source?.kind, draft?.source?.id, draft?.editId, draft?.copyFrom?.target, draft?.copyFrom?.id]);

  // Drop an override once it matches committed again (after a Save's HMR, or an external edit),
  // so a lingering equal override can't pin a prop against the next change to the file.
  useEffect(() => {
    setOverrides((o) => {
      const settled = Object.keys(o).filter((id) => sameSeat(o[id], committedSeats[id]));
      if (!settled.length) return o;
      const next = { ...o };
      for (const id of settled) delete next[id];
      return next;
    });
  });

  // Keep the Rename field showing the selected copy's current name — and re-sync after a rename
  // lands (def.label changes) so it reflects the new name rather than a stale one.
  useEffect(() => { setRenameText(isCopy ? def.label : ''); }, [activeId, def.label, isCopy]);

  const board = useMemo(
    () => solveSocketBoard({
      assets: tileAssets,
      terrainMap: Array.from({ length: COLS * ROWS }, () => family),
      seed,
      columns: COLS,
      rows: ROWS,
      familyAssets: tileFamilies,
    }),
    [family, seed],
  );

  const setSeat = (patch: Partial<Seat>) => {
    setStatus('');
    if (draftMode) {
      if (patch.w != null || patch.h != null) {
        setDraftFootprint((cur) => ({ w: patch.w ?? cur.w, h: patch.h ?? cur.h }));
      }
      if (patch.anchorX != null || patch.anchorY != null || patch.scale != null) {
        setDraftSlots((cur) => cur.map((slot, index) => index === activeSlotIndex
          ? { ...slot, anchorX: patch.anchorX ?? slot.anchorX, anchorY: patch.anchorY ?? slot.anchorY, scale: patch.scale ?? slot.scale }
          : slot));
      }
      return;
    }
    setOverrides((o) => ({ ...o, [activeId]: { ...(o[activeId] ?? committedSeats[activeId]), ...patch } }));
  };

  const ax = Math.floor((COLS - liveW) / 2);
  const ay = Math.floor((ROWS - liveH) / 2);
  const base0 = boardLabCellPosition({ x: ax, y: ay });
  const groundLeft = base0.left + (((liveW - 1) - (liveH - 1)) / 2) * TILE_TEMPLATE.stepX;
  const groundTop = base0.top + (((liveW - 1) + (liveH - 1)) / 2) * TILE_TEMPLATE.stepY;

  // Visual-direction nudge (vx>0 right, vy>0 down). The anchor is where the frame TOUCHES the
  // ground point, so moving the sprite right/down pulls the anchor left/up — hence anchor -= v.
  const nudge = (vx: number, vy: number, step: number) => {
    setStatus('');
    if (draftMode) {
      setDraftSlots((cur) => cur.map((slot, index) => index === activeSlotIndex
        ? { ...slot, anchorX: slot.anchorX - vx * step, anchorY: slot.anchorY - vy * step }
        : slot));
      return;
    }
    setOverrides((o) => {
      const cur = o[activeId] ?? committedSeats[activeId];
      return { ...o, [activeId]: { ...cur, anchorX: cur.anchorX - vx * step, anchorY: cur.anchorY - vy * step } };
    });
  };
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = document.activeElement?.tagName;
      if (t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') return;
      const move: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
      };
      const dir = move[ev.key];
      if (!dir) return;
      ev.preventDefault();
      nudge(dir[0], dir[1], ev.shiftKey ? 10 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeId, activeSlotIndex, draftMode]);

  const onDragStart = (ev: React.PointerEvent<HTMLDivElement>) => {
    ev.preventDefault();
    ev.stopPropagation(); // don't let the ViewPane start a pan — this drag moves the prop
    ev.currentTarget.setPointerCapture(ev.pointerId);
    drag.current = { px: ev.clientX, py: ev.clientY, anchorX: liveSeat.anchorX, anchorY: liveSeat.anchorY };
  };
  const onDragMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = (ev.clientX - d.px) / zoom;
    const dy = (ev.clientY - d.py) / zoom;
    setSeat({ anchorX: Math.round(d.anchorX - dx / liveSeat.scale), anchorY: Math.round(d.anchorY - dy / liveSeat.scale) });
  };
  const onDragEnd = () => { drag.current = null; };

  const save = async () => {
    // Instant-live publish (ADR-0061): PUT the WHOLE live map to the DB — the
    // endpoint REPLACES the document, so we always send the full map (never just the edited entries)
    // or an omitted prop would vanish. Admin-gated; mapSaveError turns 401/403/503 into a message.
    if (draftMode || !dirty) return;
    setStatus('saving…');
    try {
      await saveLiveSeats(seats);
      applyPropSeats(seats as PropSeatMap);
      setOverrides({});
      setStatus('saved — live now');
    } catch (err) {
      const r = mapSaveError(err);
      setStatus(`error: ${'action' in r ? 'sign in required' : r.message} — use Copy JSON`);
    }
  };
  const saveDraft = async () => {
    if (!draftMode) return;
    const id = normalizedDraftId;
    if (!id) return;
    const primarySlot = draftSlots[0] ?? activeDraftSlot;
    const entry: PropSeatEntry = {
      placement: draftTarget,
      source: primarySlot.source,
      label: draftName.trim() || id,
      anchorX: primarySlot.anchorX,
      anchorY: primarySlot.anchorY,
      scale: primarySlot.scale,
      terrains: parseTerrains(draftTerrains),
      ...(draftSlots.length > 1 ? { parts: draftSlots } : {}),
      ...(draftTarget === 'prop' ? { kind: def.kind, w: liveW, h: liveH, blocking: true } : {}),
    };
    const next = { ...(seats as Record<string, PropSeatEntry>), [id]: entry };
    setStatus(`saving ${draftTarget}...`);
    try {
      await saveLiveSeats(next);
      applyPropSeats(next as PropSeatMap);
      setStatus(`${editMode ? 'saved' : 'created'} ${draftTarget} "${id}"`);
      if (draftTarget === 'prop') onPropId(id);
    } catch (err) {
      const r = mapSaveError(err);
      setStatus(`error: ${'action' in r ? 'sign in required' : r.message}`);
    }
  };
  const copy = async () => {
    await navigator.clipboard.writeText(`${JSON.stringify(seats, null, 2)}\n`);
    setStatus('copied live prop-seat document to clipboard');
  };

  // Build the sprite seat explicitly (NOT ...liveSeat — that also carries w/h/base/label, which
  // would clobber the sprite FRAME dims). Footprint rides on the def's w/h (liveW/liveH).
  const liveDef: PropDef = { ...def, w: liveW, h: liveH, sprite: { w: def.sprite.w, h: def.sprite.h, anchorX: liveSeat.anchorX, anchorY: liveSeat.anchorY, scale: liveSeat.scale } };
  const savedDef: PropDef = { ...def, sprite: { w: def.sprite.w, h: def.sprite.h, anchorX: committed.anchorX, anchorY: committed.anchorY, scale: committed.scale } };
  const frame = {
    left: groundLeft - liveSeat.anchorX * liveSeat.scale,
    top: groundTop - liveSeat.anchorY * liveSeat.scale,
    width: def.sprite.w * liveSeat.scale,
    height: def.sprite.h * liveSeat.scale,
  };
  const unitCell = { x: ax + liveW, y: ay + liveH - 1 };
  const unitPos = boardLabCellPosition(unitCell);

  // "Share base" size variants (ADR-0059): duplicate the CURRENT prop at its current seat as a new
  // pickable prop that reuses the base sprite. Writes a live seat entry with a `base`; props.ts
  // synthesizes the PROP_DEF. Base = def.spriteId, so this works even when a variant is selected.
  const saveVariant = async () => {
    const suffix = variantName.trim();
    const slug = suffix.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    if (!slug) return;
    const baseId = def.spriteId;
    const baseDef = PROP_DEFS.find((d) => d.id === baseId) ?? def;
    const variantId = `${baseId}-${slug}`;
    // Capture the current footprint only if it differs from the base, so a variant inherits the
    // base's cells by default but keeps a changed footprint if you set one.
    const footprint = (liveW !== baseDef.w || liveH !== baseDef.h) ? { w: liveW, h: liveH } : {};
    setStatus('saving variant…');
    // PUT the whole live map with the new variant added (the endpoint replaces, not merges). The
    // variant references `base: baseId`, which is present, so server-side base-integrity passes.
    const next: Seats = { ...seats, [variantId]: { base: baseId, label: `${baseDef.label} — ${suffix}`, anchorX: liveSeat.anchorX, anchorY: liveSeat.anchorY, scale: liveSeat.scale, ...footprint } };
    try {
      await saveLiveSeats(next);
      applyPropSeats(next as PropSeatMap);
      setStatus(`saved variant "${variantId}" — pick it from Prop after reload`); setVariantName('');
    } catch (err) {
      const r = mapSaveError(err);
      setStatus(`error: ${'action' in r ? 'sign in required' : r.message}`);
    }
  };

  // Rename a copy: change its display name only — id, sprite, seat and footprint are untouched (the
  // endpoint preserves base/w/h when they're omitted). Copies only; bases show no rename control.
  const renameCopy = async () => {
    const label = renameText.trim();
    if (!isCopy || !label || label === def.label) return;
    setStatus('renaming…');
    // PUT the whole live map with this copy's label changed; preserve its base + current seat/footprint
    // (the endpoint replaces the document, so an omitted field would be dropped).
    const cur = seats[activeId];
    const next: Seats = { ...seats, [activeId]: { ...cur, base: def.spriteId, label } };
    try {
      await saveLiveSeats(next);
      applyPropSeats(next as PropSeatMap);
      setStatus(`renamed to "${label}"`);
    } catch (err) {
      const r = mapSaveError(err);
      setStatus(`error: ${'action' in r ? 'sign in required' : r.message}`);
    }
  };

  // Delete a copy. Only copies are deletable — the base is safe both here (no button) and server-side
  // (validatePropSeatsData rejects any surviving variant orphaned by the delete). Switch back to the
  // base and drop the override.
  const deleteCopy = async () => {
    if (!isCopy) return;
    setStatus('deleting…');
    // Delete = PUT the whole live map MINUS this copy (the endpoint replaces the document). Server-side
    // base-integrity refuses to leave an orphan variant; required base seats have no delete button,
    // so only copies reach here.
    const removed = activeId;
    const next: Seats = { ...seats };
    delete next[removed];
    try {
      await saveLiveSeats(next);
      applyPropSeats(next as PropSeatMap);
      onPropId(def.spriteId); // fall back to the base prop
      setOverrides((o) => { const n = { ...o }; delete n[removed]; return n; });
      setStatus(`deleted "${removed}"`);
    } catch (err) {
      const r = mapSaveError(err);
      setStatus(`error: ${'action' in r ? 'sign in required' : r.message}`);
    }
  };

  const toggle = (on: boolean, set: (v: boolean) => void, label: string, title?: string) => (
    <button type="button" className={`ps-toggle ${on ? 'is-on' : ''}`} title={title} onClick={() => set(!on)}>{label}</button>
  );
  const sourceOptions: { key: string; source: StructureSourceRef; label: string }[] = [
    ...STRUCTURE_ART_ASSETS.map((asset) => ({ key: sourceKey({ kind: 'asset', id: asset.id }), source: { kind: 'asset' as const, id: asset.id }, label: `Structure art: ${asset.label}` })),
  ];
  if (!sourceOptions.some((item) => item.key === sourceKey(draftSource))) {
    sourceOptions.unshift({ key: sourceKey(draftSource), source: draftSource, label: `Legacy source: ${draftInfo.label}` });
  }
  const slotLabel = (part: StructurePart, index: number): string => `Slot ${index + 1} · ${sourceInfo(part.source).label}`;
  const addDraftSlot = () => {
    setStatus('');
    const source = draftSlots[activeSlotIndex] ?? activeDraftSlot;
    const next = { ...source, anchorX: source.anchorX - Math.round(28 / source.scale) };
    setDraftSlots((cur) => [...cur, next]);
    setSelectedSlotIndex(draftSlots.length);
  };
  const removeDraftSlot = () => {
    if (draftSlots.length <= 1) return;
    setStatus('');
    setDraftSlots((cur) => cur.filter((_, index) => index !== activeSlotIndex));
    setSelectedSlotIndex(Math.max(0, activeSlotIndex - 1));
  };
  const setDraftSourceFromKey = (key: string) => {
    const option = sourceOptions.find((item) => item.key === key);
    if (!option) return;
    const nextPart = partFromSource(option.source);
    const info = sourceInfo(nextPart.source);
    setDraftSlots((cur) => cur.map((slot, index) => index === activeSlotIndex ? nextPart : slot));
    if (draftSlots.length === 1 || activeSlotIndex === 0) setDraftFootprint(footprintFromSource(option.source));
    setDraftTerrains(info.terrains.join(', '));
    setStatus('');
  };

  // Anchor slider bounds — a generous per-frame window (negatives reachable, well past the frame),
  // derived from the frame dims so the thumb doesn't rescale mid-drag.
  const axMin = -Math.round(def.sprite.w * 0.5);
  const axMax = Math.round(def.sprite.w * 1.5);
  const ayMin = -Math.round(def.sprite.h * 0.5);
  const ayMax = Math.round(def.sprite.h * 1.5);

  return (
    <>
      <style>{PS_CSS}</style>
      <section className="al-lab-main ps-board-main" aria-label="Prop seat preview">
        <ViewPane kind="board" ariaLabel="Prop seat viewport" zoom={zoom} pan={pan} minZoom={0.5} maxZoom={3} onZoomChange={setZoom} onPanChange={setPan}>
          <BoardLabBoard board={board} assetFrameSrc={(a) => a.src} boardZoom={zoom} boardPan={pan} className="ps-board-surface" ariaLabel="Prop seat preview board">
            {showSavedGhost ? <div className="ps-ghost"><PropSprite prop={{ x: ax, y: ay, propId: activeId }} def={savedDef} /></div> : null}
            <PropSprite prop={{ x: ax, y: ay, propId: activeId }} def={liveDef} />
            {showUnit ? (
              <span className="board-unit-seat is-knight" style={{ left: unitPos.left, top: unitPos.top, zIndex: objectBaseZIndex(unitCell) }}>
                <img src={pieceSpritePath('knight')} alt="" draggable={false} />
              </span>
            ) : null}
            {showGuides ? (
              <>
                {propCells(ax, ay, liveDef).map((cell) => {
                  const p = boardLabCellPosition(cell);
                  return (
                    <svg key={`g-${cell.x}-${cell.y}`} className="ps-guide"
                      style={{ left: p.left - TILE_TEMPLATE.stepX, top: p.top - TILE_TEMPLATE.stepY }}
                      width={TILE_TEMPLATE.stepX * 2} height={TILE_TEMPLATE.stepY * 2}
                      viewBox={`0 0 ${TILE_TEMPLATE.stepX * 2} ${TILE_TEMPLATE.stepY * 2}`}>
                      <polygon points={`${TILE_TEMPLATE.stepX},0 ${TILE_TEMPLATE.stepX * 2},${TILE_TEMPLATE.stepY} ${TILE_TEMPLATE.stepX},${TILE_TEMPLATE.stepY * 2} 0,${TILE_TEMPLATE.stepY}`}
                        fill="rgba(111,210,255,0.08)" stroke="rgba(111,210,255,0.85)" strokeWidth="1" />
                    </svg>
                  );
                })}
                <div className="ps-cross" style={{ left: groundLeft, top: groundTop }} />
                <div className="ps-frame" style={frame} />
              </>
            ) : null}
            <div className="ps-drag" style={frame}
              onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}
              title="Drag to move the prop. Drag empty board to pan · wheel to zoom · arrow keys nudge (Shift = ×10)." />
          </BoardLabBoard>
        </ViewPane>
      </section>

      <aside className="tileset-view-controls" aria-label="Prop seat controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            {draftMode ? (
              <div className="ps-variant">
                <span className="ps-ctl-label">{editMode ? 'Edit structure' : 'New structure'}</span>
                <div className="ps-toggles">
                  {(['prop', 'doodad'] as StructurePlacement[]).map((target) => (
                    <button key={target} type="button" className={`ps-toggle ${draftTarget === target ? 'is-on' : ''}`} onClick={() => { setDraftTarget(target); setStatus(''); }}>
                      {target === 'prop' ? 'Prop / blocks' : 'Doodad / passable'}
                    </button>
                  ))}
                </div>
                <span className="ps-slot-row">
                  <label className="tileset-category-select" title="Which placed artwork slot the controls below edit.">
                    <span>Artwork slot</span>
                    <select value={activeSlotIndex} onChange={(e) => setSelectedSlotIndex(Number(e.target.value))} aria-label="Artwork slot">
                      {draftSlots.map((part, index) => <option key={`${sourceKey(part.source)}-${index}`} value={index}>{slotLabel(part, index)}</option>)}
                    </select>
                  </label>
                  <button type="button" className="ps-slot-button" onClick={addDraftSlot} title="Add another artwork slot" aria-label="Add artwork slot">+</button>
                  <button type="button" className="ps-slot-button ps-slot-remove" onClick={removeDraftSlot} disabled={draftSlots.length <= 1}
                    title={draftSlots.length <= 1 ? 'At least one artwork slot is required' : 'Remove selected artwork slot'} aria-label="Remove selected artwork slot">-</button>
                </span>
                <label className="tileset-category-select" title="The raw artwork asset this slot uses.">
                  <span>Source artwork</span>
                  <select value={sourceKey(draftSource)} onChange={(e) => setDraftSourceFromKey(e.target.value)} aria-label="Source art">
                    {sourceOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                  </select>
                </label>
                <label className="tileset-category-select">
                  <span>Name</span>
                  <input value={draftName} onChange={(e) => setDraftName(e.target.value)} placeholder={`New ${draftTarget}`} />
                </label>
                <label className="tileset-category-select">
                  <span>ID</span>
                  <input value={draftId} onChange={(e) => setDraftId(draftIdInput(e.target.value))} onBlur={() => setDraftId((value) => slugify(value))} placeholder={normalizedDraftId}
                    disabled={editMode} title={editMode ? 'Existing IDs stay fixed so placed boards keep their references.' : undefined} />
                </label>
                <label className="tileset-category-select">
                  <span>Terrain</span>
                  <input value={draftTerrains} onChange={(e) => setDraftTerrains(e.target.value)} placeholder="grass, dirt, stone" />
                </label>
              </div>
            ) : (
              <label className="tileset-category-select" title="Which prop's seat you're tuning.">
                <span>Prop</span>
                <select value={activeId} onChange={(e) => onPropId(e.target.value)} aria-label="Prop">
                  {PROP_DEFS.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                </select>
              </label>
            )}
            <label className="tileset-category-select" title="The ground family under the prop (preview only).">
              <span>Ground</span>
              <select value={family} onChange={(e) => setFamily(e.target.value as Family)} aria-label="Ground family">
                {previewFamilies().map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="tileset-catalog-zoom">
              <span>Zoom</span>
              <input type="range" min={0.6} max={3} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            </label>
            <div className="ps-toggles">
              {toggle(showGuides, setShowGuides, 'Guides', 'Footprint diamonds + the ground point')}
              {toggle(showUnit, setShowUnit, 'Unit', 'A reference knight beside the prop')}
              {toggle(showSavedGhost, setShowSavedGhost, 'Ghost', 'Overlay the saved seat for comparison')}
              <button type="button" className="ps-toggle" onClick={() => setSeed((s) => (s % 9999) + 1)} title="Re-roll the board tiles">↻ Re-roll</button>
            </div>

            <div className="ps-block">
              <span className="ps-ctl-label">Nudge <em>Shift = ×10</em></span>
              <div className="ps-pad">
                {NUDGE_PAD.map((d, i) => d
                  ? <button key={d.key} type="button" className="ps-pad-btn" title={`Nudge ${d.name} (Shift = ×10)`} aria-label={`nudge ${d.name}`}
                      onClick={(ev) => nudge(d.vx, d.vy, ev.shiftKey ? 10 : 1)}><DirArrow deg={d.deg} /></button>
                  : <span key={`c${i}`} className="ps-pad-center" aria-hidden="true" />)}
              </div>
            </div>

            {/* Anchors + scale use the shared SliderRow (ADR-0059): slider to drag, −/+ for single
                increments, ↺ to reset to the saved value. Negatives reach via the slider/steppers. */}
            <SliderRow label={`Anchor X · ${liveSeat.anchorX}`} value={liveSeat.anchorX} set={(v) => setSeat({ anchorX: Math.round(v) })}
              min={axMin} max={axMax} step={1} nudge={1} dflt={committed.anchorX} />
            <SliderRow label={`Anchor Y · ${liveSeat.anchorY}`} value={liveSeat.anchorY} set={(v) => setSeat({ anchorY: Math.round(v) })}
              min={ayMin} max={ayMax} step={1} nudge={1} dflt={committed.anchorY} />
            <SliderRow label={`Scale · ${liveSeat.scale.toFixed(2)}×`} value={liveSeat.scale} set={(v) => setSeat({ scale: round2(v) })}
              min={0.05} max={2} step={0.01} nudge={0.05} dflt={committed.scale} />

            {draftMode && draftTarget === 'doodad' ? null : (
              <>
                {/* Footprint — how many gameplay cells the prop occupies (placement + blocking rocks).
                    Separate from Scale (visual only); the guides + seat reflow as you change it. */}
                <span className="ps-ctl-label" style={{ marginTop: 6 }}>Footprint <em>{liveW} × {liveH} cells</em></span>
                <SliderRow label={`Width · ${liveW}`} value={liveW} set={(v) => setSeat({ w: Math.round(v) })}
                  min={1} max={6} step={1} nudge={1} dflt={def.w} />
                <SliderRow label={`Height · ${liveH}`} value={liveH} set={(v) => setSeat({ h: Math.round(v) })}
                  min={1} max={6} step={1} nudge={1} dflt={def.h} />
              </>
            )}

            <p className="ps-saved">{draftMode ? `draft: ${draftTarget} · slot ${activeSlotIndex + 1}/${draftSlots.length} from ${draftInfo.label}` : `saved: (${committed.anchorX}, ${committed.anchorY}) @ ${committed.scale.toFixed(2)}× · ${def.w}×${def.h} cells`}</p>
            <div className="ps-actions">
              {draftMode ? (
                <>
                  <button type="button" className="tileset-view-action ps-primary" onClick={saveDraft} disabled={!normalizedDraftId} title={editMode ? 'Save changes to this existing object' : 'Create this object from the selected source artwork'}>{editMode ? 'Save changes' : 'Save new'}</button>
                  <button type="button" className="tileset-view-action" onClick={() => onDraftChange?.(null)}>Cancel</button>
                  <button type="button" className="tileset-view-action" onClick={() => setSeat({ ...committed })} title="Reset the draft seat to the source art">Reset</button>
                </>
              ) : (
                <>
                  <button type="button" className="tileset-view-action ps-primary" onClick={save} disabled={!dirty} title="Publish these seats live (instant, no deploy)">Save live</button>
                  <button type="button" className="tileset-view-action" onClick={copy}>Copy JSON</button>
                  <button type="button" className="tileset-view-action" onClick={() => setSeat({ ...committed })} disabled={!dirty} title="Reset all three controls to the saved seat">Reset all</button>
                </>
              )}
            </div>
            {status ? <p className={`ps-status ${status.startsWith('error') ? 'is-error' : ''}`}>{status}</p> : null}
            {dirty && !status ? <p className="ps-status">unsaved changes</p> : null}

            {!draftMode ? <div className="ps-variant">
              {isCopy ? (
                <>
                  <span className="ps-ctl-label">Copy of {baseDef.label}</span>
                  <span className="ps-variant-row">
                    <input className="ps-variant-input" value={renameText} onChange={(e) => setRenameText(e.target.value)}
                      placeholder={def.label} aria-label="Rename this copy"
                      onKeyDown={(e) => { if (e.key === 'Enter') renameCopy(); }} />
                    <button type="button" className="tileset-view-action" disabled={!renameText.trim() || renameText.trim() === def.label}
                      onClick={renameCopy} title="Rename this copy — its sprite, seat and footprint stay">Rename</button>
                  </span>
                  <span className="ps-variant-row">
                    <button type="button" className="tileset-view-action ps-danger" onClick={deleteCopy}
                      title={`Delete this copy. ${baseDef.label} (the base) is unaffected.`}>Delete this copy</button>
                  </span>
                </>
              ) : (
                <p className="ps-variant-hint"><strong>{def.label}</strong> is a base prop — it owns the sprite and can’t be deleted, only tuned. Make a copy below to vary its size or footprint.</p>
              )}
              <span className="ps-ctl-label" style={{ marginTop: 4 }}>New copy of {baseDef.label}</span>
              <span className="ps-variant-row">
                <input className="ps-variant-input" value={variantName} onChange={(e) => setVariantName(e.target.value)}
                  placeholder="name (e.g. small)" onKeyDown={(e) => { if (e.key === 'Enter') saveVariant(); }} />
                <button type="button" className="tileset-view-action" disabled={!variantName.trim()} onClick={saveVariant}
                  title={`Save the current size as a new copy of ${baseDef.label}`}>Create copy</button>
              </span>
              <p className="ps-variant-hint">A copy shares {baseDef.label}’s sprite at {liveSeat.scale.toFixed(2)}×; tune its scale + footprint on its own. Pick it above after reload.</p>
            </div> : null}
          </div>
        </section>
      </aside>
    </>
  );
}

const PS_CSS = `
/* Fill the main pane and let the shared ViewPane own pan/zoom/fit — same board viewport the
   skirmish board uses, so it pans and never clips (was a bespoke fixed-height overflow:hidden box). */
.ps-board-main { padding: 0; grid-template-rows: minmax(0, 1fr); align-content: stretch; overflow: hidden; }
.ps-board-surface .tileset-generated-board-tile img { image-rendering: pixelated; }
.ps-ghost { display: contents; }
.ps-ghost img { opacity: 0.35; filter: saturate(0.4); }
.ps-guide { position: absolute; pointer-events: none; z-index: 40000; }
.ps-cross { position: absolute; width: 0; height: 0; pointer-events: none; z-index: 40001; }
.ps-cross::before, .ps-cross::after { content: ''; position: absolute; background: rgba(255,196,88,0.95); }
.ps-cross::before { left: -9px; top: -0.5px; width: 18px; height: 1px; }
.ps-cross::after { left: -0.5px; top: -9px; width: 1px; height: 18px; }
.ps-frame { position: absolute; pointer-events: none; z-index: 40000; outline: 1px dashed rgba(140,170,220,0.45); }
.ps-drag { position: absolute; z-index: 45000; cursor: move; }

/* Toggles — a tight wrap of quiet chips (studio instrument idiom, not fat buttons). */
.ps-toggles { display: flex; flex-wrap: wrap; gap: 5px; }
.ps-toggle { box-sizing: border-box; height: 28px; padding: 0 10px; font: inherit; font-size: 12px; cursor: pointer;
  background: #111a2c; color: #cfe3ff; border: 1px solid #2a3c5e; border-radius: 5px; }
.ps-toggle:hover { background: #17223a; }
.ps-toggle.is-on { background: #1d3354; border-color: #3f74c0; color: #eaf3ff; }

.ps-block { display: grid; gap: 6px; }
.ps-ctl-label { font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #8fa8cc; }
.ps-ctl-label em { font-style: normal; color: #eaf3ff; margin-left: 4px; font-variant-numeric: tabular-nums; font-weight: 600; }

/* 8-direction nudge pad. Explicit border-box cells so the 1px border can't overlap the gap. */
.ps-pad { display: grid; grid-template-columns: repeat(3, 42px); gap: 6px; }
.ps-pad-btn, .ps-pad-center { box-sizing: border-box; width: 42px; height: 38px; display: grid; place-items: center; }
.ps-pad-btn { padding: 0; cursor: pointer; color: #bcd4f2; background: #16233f; border: 1px solid #2a3c5e; border-radius: 6px; }
.ps-pad-btn:hover { background: #1e3054; color: #eaf3ff; }
.ps-pad-btn:active { background: #244071; }
.ps-pad-center::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #33415e; }

.ps-saved { margin: 0; font-size: 11px; color: #6b83a8; font-variant-numeric: tabular-nums; }
.ps-actions { display: flex; gap: 6px; }
.ps-actions .tileset-view-action { flex: 1; }
.ps-primary { background: rgba(29,74,46,0.9) !important; border-color: rgba(63,156,98,0.7) !important; color: #e7ffe9 !important; }
.ps-primary:disabled { opacity: 0.45; }
.ps-status { margin: 0; font-size: 12px; color: #8fd0a0; }
.ps-status.is-error { color: #f0a0a0; }

/* Delete a copy — a quiet danger tone so it reads as destructive without shouting. */
.ps-danger { flex: 1; background: rgba(74,29,29,0.9) !important; border-color: rgba(156,63,63,0.7) !important; color: #ffe7e7 !important; }
.ps-danger:hover { background: rgba(96,36,36,0.95) !important; }

.ps-variant { display: grid; gap: 6px; margin-top: 6px; padding-top: 12px; border-top: 1px solid #1b2740; }
.ps-variant-row { display: flex; gap: 6px; }
.ps-variant-row .tileset-view-action { flex: none; }
.ps-variant-input { flex: 1; min-width: 0; box-sizing: border-box; height: 32px; padding: 0 8px; font: inherit; font-size: 13px;
  color: #eaf3ff; background: #101a2e; border: 1px solid #2a3c5e; border-radius: 5px; }
.ps-variant-hint { margin: 0; font-size: 11px; color: #6b83a8; line-height: 1.4; }
.ps-slot-row { display: grid; grid-template-columns: minmax(0, 1fr) 32px 32px; align-items: end; gap: 6px; }
.ps-slot-button { box-sizing: border-box; width: 32px; height: 32px; padding: 0; display: grid; place-items: center;
  cursor: pointer; font: inherit; font-size: 18px; line-height: 1; color: #dff7ff; background: #16233f;
  border: 1px solid #2a3c5e; border-radius: 5px; }
.ps-slot-button:hover:not(:disabled) { background: #1e3054; color: #ffffff; }
.ps-slot-button:disabled { cursor: default; opacity: 0.42; }
.ps-slot-remove:not(:disabled) { color: #ffd8d8; background: rgba(74,29,29,0.65); border-color: rgba(156,63,63,0.55); }
.ps-slot-remove:hover:not(:disabled) { background: rgba(96,36,36,0.9); color: #ffffff; }
`;
