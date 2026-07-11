import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactElement, type ReactNode } from 'react';
import { edgeTiles, muralTiles, tileAssets, tileFamilies, wallFrameSrc, type TileAsset } from '../art/tileset';
import { DEFAULT_WALL_MATERIAL, resolveWallOverlays, roadEdgeKey } from '../core/featureAutotile';
import {
  applyLiveWallArt,
  currentWallArt,
  slotSource,
  wallArt,
  type WallArt,
  type WallArtMap,
  type WallArtSlot,
} from '../core/wallArt';
import { WALL_DECOR_ASSETS, wallDecorAsset, type WallDecorFaceId } from '../core/wallDecor';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard, boardLabCellPosition } from '../render/BoardLabBoard';
import { wallOverlayZIndex } from '../render/fenceOverlayDepth';
import { saveLiveWallArt } from '../net/wallArt';
import { mapSaveError } from '../campaign/save';
import { SliderRow } from './dressing/SliderRow';
import { ViewPane } from './shared/ViewPane';

const WALL_FRAME_W = 128;
const WALL_FRAME_H = 240;
const WALL_FRAME_LEFT = -64;
const WALL_FRAME_TOP = -96;
const WALL_STEP_X = 48;
const WALL_STEP_Y = 27;
const LAB_WEST_Y = 1;
const LAB_NORTH_X = 1;
const FAMILIES = ['grass', 'dirt', 'stone'] as const;
type Family = (typeof FAMILIES)[number];
const cap = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
const round2 = (value: number): number => Math.round(value * 100) / 100;

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

const cloneMap = (map: WallArtMap): WallArtMap => JSON.parse(JSON.stringify(map)) as WallArtMap;
const slugify = (value: string): string =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);

function entryAsWallArt(id: string, entry: WallArtMap[string]): WallArt {
  const span = Number.isFinite(entry?.span) ? Math.max(1, Math.min(16, Math.round(Number(entry.span)))) : 1;
  return {
    id,
    label: typeof entry?.label === 'string' && entry.label.trim() ? entry.label.trim() : id,
    span,
    slots: Array.isArray(entry?.slots) ? entry.slots : [],
  };
}

function uniqueWallArtId(map: WallArtMap, base: string): string {
  const clean = slugify(base) || 'new-wall-art';
  if (!map[clean]) return clean;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${clean}-${i}`;
    if (!map[candidate]) return candidate;
  }
  return `${clean}-${Date.now().toString(36)}`;
}

function uniqueSlotId(slots: readonly WallArtSlot[], base: string): string {
  const used = new Set(slots.map((slot) => slot.id));
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const candidate = `${base}-${i}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function defaultSlot(sourceId: string, face: WallDecorFaceId, slots: readonly WallArtSlot[]): WallArtSlot {
  const source = wallDecorAsset(sourceId);
  const faceAsset = source.faces[face];
  return {
    id: uniqueSlotId(slots, `${source.id}-${face}`),
    sourceId: source.id,
    face,
    x: faceAsset.previewX,
    y: faceAsset.previewY,
    scale: 1,
  };
}

function slotLabel(slot: WallArtSlot, index: number): string {
  return `Slot ${index + 1} - ${wallDecorAsset(slot.sourceId).label} (${slot.face})`;
}

function slotPreviewStyle(slot: WallArtSlot, wallLeft: number, wallTop: number, scale: number, offsetX = 0, offsetY = 0): CSSProperties {
  const source = slotSource(slot);
  const face = source.faces[slot.face];
  const slotScale = slot.scale * scale;
  return {
    left: offsetX + (wallLeft + slot.x - face.mountX * slot.scale) * scale,
    top: offsetY + (wallTop + slot.y - face.mountY * slot.scale) * scale,
    width: face.width * slotScale,
    height: face.height * slotScale,
  };
}

function DirArrow({ deg }: { deg: number }): ReactElement {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" style={{ display: 'block', transform: `rotate(${deg}deg)` }}>
      <path d="M12 4 L19 13 L14.5 13 L14.5 20 L9.5 20 L9.5 13 L5 13 Z" fill="currentColor" />
    </svg>
  );
}

function labAnchorCell(face: WallDecorFaceId): { x: number; y: number } {
  return face === 'west' ? { x: 0, y: LAB_WEST_Y } : { x: LAB_NORTH_X, y: 0 };
}

function wallArtBoardSlotRect(slot: WallArtSlot): CSSProperties & { src: string } {
  const source = slotSource(slot);
  const face = source.faces[slot.face];
  const anchor = labAnchorCell(slot.face);
  const { left, top } = boardLabCellPosition(anchor);
  return {
    src: face.src,
    left: left + WALL_FRAME_LEFT + slot.x - face.mountX * slot.scale,
    top: top + WALL_FRAME_TOP + slot.y - face.mountY * slot.scale,
    width: face.width * slot.scale,
    height: face.height * slot.scale,
    zIndex: wallOverlayZIndex(anchor) + 2,
  };
}

function WallArtBoardSlots({
  art,
  activeSlotIndex,
  ghost = false,
  onSelectSlot,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  art: WallArt;
  activeSlotIndex: number;
  ghost?: boolean;
  onSelectSlot?: (index: number) => void;
  onPointerDown?: (event: PointerEvent<HTMLButtonElement>, index: number) => void;
  onPointerMove?: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (event: PointerEvent<HTMLButtonElement>) => void;
}): ReactElement {
  return (
    <>
      {art.slots.map((slot, index) => {
        const { src, ...style } = wallArtBoardSlotRect(slot);
        const className = `wall-art-board-slot${index === activeSlotIndex ? ' is-active' : ''}${ghost ? ' is-ghost' : ''}`;
        if (ghost) {
          return <img key={`${art.id}-${slot.id}-ghost`} className={className} src={src} alt="" draggable={false} style={style} />;
        }
        return (
          <button
            key={`${art.id}-${slot.id}`}
            type="button"
            className={className}
            style={style}
            onClick={() => onSelectSlot?.(index)}
            onPointerDown={(event) => onPointerDown?.(event, index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label={`Edit wall art slot ${index + 1}`}
            title="Drag to move this artwork slot"
          >
            <img src={src} alt="" draggable={false} />
          </button>
        );
      })}
    </>
  );
}

export function WallArtPreview({ art, zoom = 1 }: { art: WallArt; zoom?: number }): ReactElement {
  const boxW = 152 * zoom;
  const boxH = 132 * zoom;
  const visibleFaces = new Set<WallDecorFaceId>(art.slots.map((slot) => slot.face));
  if (!visibleFaces.size) visibleFaces.add('west');
  const nativeFrames: Array<{ key: string; left: number; top: number }> = [];
  for (const face of visibleFaces) {
    for (let i = 0; i < art.span; i += 1) {
      nativeFrames.push({
        key: `${face}-${i}`,
        left: WALL_FRAME_LEFT + (face === 'west' ? -WALL_STEP_X * i : WALL_STEP_X * i),
        top: WALL_FRAME_TOP + WALL_STEP_Y * i,
      });
    }
  }
  const rects = [
    ...nativeFrames.map((frame) => ({ left: frame.left, top: frame.top, right: frame.left + WALL_FRAME_W, bottom: frame.top + WALL_FRAME_H })),
    ...art.slots.map((slot) => {
      const source = slotSource(slot);
      const face = source.faces[slot.face];
      const left = WALL_FRAME_LEFT + slot.x - face.mountX * slot.scale;
      const top = WALL_FRAME_TOP + slot.y - face.mountY * slot.scale;
      return { left, top, right: left + face.width * slot.scale, bottom: top + face.height * slot.scale };
    }),
  ];
  const minX = Math.min(...rects.map((rect) => rect.left));
  const minY = Math.min(...rects.map((rect) => rect.top));
  const maxX = Math.max(...rects.map((rect) => rect.right));
  const maxY = Math.max(...rects.map((rect) => rect.bottom));
  const nativeW = Math.max(1, maxX - minX);
  const nativeH = Math.max(1, maxY - minY);
  const scale = Math.min(0.72 * zoom, (boxW - 12 * zoom) / nativeW, (boxH - 12 * zoom) / nativeH);
  const offsetX = (boxW - nativeW * scale) / 2 - minX * scale;
  const offsetY = (boxH - nativeH * scale) / 2 - minY * scale;
  return (
    <span className="wall-asset-preview" style={{ width: boxW, height: boxH }} aria-hidden="true">
      {nativeFrames.map((frame) => (
        <img
          key={frame.key}
          className="wall-asset-preview-wall"
          src={wallFrameSrc(DEFAULT_WALL_MATERIAL, 9)}
          alt=""
          draggable={false}
          style={{ left: offsetX + frame.left * scale, top: offsetY + frame.top * scale, width: WALL_FRAME_W * scale, height: WALL_FRAME_H * scale }}
        />
      ))}
      {art.slots.map((slot) => (
        <img
          key={`${art.id}-${slot.id}`}
          className="wall-asset-preview-sprite"
          src={slotSource(slot).faces[slot.face].src}
          alt=""
          draggable={false}
          style={slotPreviewStyle(slot, WALL_FRAME_LEFT, WALL_FRAME_TOP, scale, offsetX, offsetY)}
        />
      ))}
    </span>
  );
}

export function WallArtLab({ artId, onArtId, header, draftSourceId, onDraftSourceConsumed }: {
  artId: string | undefined;
  onArtId: (id: string) => void;
  header?: ReactNode;
  draftSourceId?: string | null;
  onDraftSourceConsumed?: () => void;
}): ReactElement {
  const [draftMap, setDraftMap] = useState<WallArtMap>(() => cloneMap(currentWallArt()));
  const [selectedSlotIndex, setSelectedSlotIndex] = useState(0);
  const [status, setStatus] = useState('');
  const [newArtName, setNewArtName] = useState('New Wall Art');
  const [newArtId, setNewArtId] = useState('new-wall-art');
  const [family, setFamily] = useState<Family>('stone');
  const [seed, setSeed] = useState(11);
  const [zoom, setZoom] = useState(1.45);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showSavedGhost, setShowSavedGhost] = useState(false);
  const drag = useRef<{ pointerId: number; index: number; px: number; py: number; x: number; y: number } | null>(null);
  const committedMap = currentWallArt();
  const ids = useMemo(() => Object.keys(draftMap).sort(), [draftMap]);
  const activeId = ids.includes(artId ?? '') ? artId! : ids[0] ?? 'banner-stone-wall';
  const activeEntry = draftMap[activeId] ?? { label: activeId, slots: [] };
  const art = entryAsWallArt(activeId, activeEntry);
  const activeSlotIndex = Math.min(selectedSlotIndex, Math.max(0, art.slots.length - 1));
  const activeSlot = art.slots[activeSlotIndex];
  const dirty = JSON.stringify(draftMap) !== JSON.stringify(committedMap);
  const boardBounds = useMemo(() => ({
    cols: Math.max(4, art.span + LAB_NORTH_X + 2),
    rows: Math.max(4, art.span + LAB_WEST_Y + 2),
  }), [art.span]);
  const board = useMemo(
    () => solveSocketBoard({
      assets: tileAssets as readonly TileAsset[],
      terrainMap: Array.from({ length: boardBounds.cols * boardBounds.rows }, () => family),
      seed,
      columns: boardBounds.cols,
      rows: boardBounds.rows,
      familyAssets: tileFamilies,
      edgeAssets: edgeTiles,
      muralEdges: muralTiles,
    }),
    [boardBounds.cols, boardBounds.rows, family, seed],
  );
  const wallOverlays = useMemo(() => {
    const walls: Record<string, typeof DEFAULT_WALL_MATERIAL> = {};
    for (let i = 0; i < art.span; i += 1) {
      walls[roadEdgeKey(0, LAB_WEST_Y + i, -1, LAB_WEST_Y + i)] = DEFAULT_WALL_MATERIAL;
      walls[roadEdgeKey(LAB_NORTH_X + i, 0, LAB_NORTH_X + i, -1)] = DEFAULT_WALL_MATERIAL;
    }
    return resolveWallOverlays(walls, boardBounds);
  }, [art.span, boardBounds]);

  const setArtEntry = (patch: Partial<WallArtMap[string]>): void => {
    setStatus('');
    setDraftMap((cur) => ({
      ...cur,
      [activeId]: {
        ...(cur[activeId] ?? activeEntry),
        ...patch,
      },
    }));
  };

  const setSlotAtIndex = (index: number, patch: Partial<WallArtSlot>): void => {
    setStatus('');
    setDraftMap((cur) => {
      const entry = cur[activeId] ?? activeEntry;
      const slots = [...(entry.slots ?? [])];
      const slot = slots[index];
      if (!slot) return cur;
      slots[index] = { ...slot, ...patch };
      return { ...cur, [activeId]: { ...entry, slots } };
    });
  };

  const setSlot = (patch: Partial<WallArtSlot>): void => {
    if (!activeSlot) return;
    setSlotAtIndex(activeSlotIndex, patch);
  };

  const nudgeSlot = (vx: number, vy: number, step: number): void => {
    if (!activeSlot) return;
    setSlotAtIndex(activeSlotIndex, { x: Math.round(activeSlot.x + vx * step), y: Math.round(activeSlot.y + vy * step) });
  };

  const addSlot = (): void => {
    const face = activeSlot?.face ?? 'west';
    const sourceId = activeSlot?.sourceId ?? WALL_DECOR_ASSETS[0].id;
    setStatus('');
    setDraftMap((cur) => {
      const entry = cur[activeId] ?? activeEntry;
      const slots = [...(entry.slots ?? [])];
      slots.push(defaultSlot(sourceId, face, slots));
      return { ...cur, [activeId]: { ...entry, slots } };
    });
    setSelectedSlotIndex(art.slots.length);
  };

  const createArt = (sourceId = activeSlot?.sourceId ?? WALL_DECOR_ASSETS[0].id): void => {
    const source = wallDecorAsset(sourceId);
    const id = uniqueWallArtId(draftMap, newArtId || newArtName);
    const label = newArtName.trim() || id;
    const slot = defaultSlot(source.id, 'west', []);
    setDraftMap((cur) => ({
      ...cur,
      [id]: {
        label,
        span: 1,
        slots: [slot],
      },
    }));
    onArtId(id);
    setSelectedSlotIndex(0);
    setNewArtName('New Wall Art');
    setNewArtId(uniqueWallArtId({ ...draftMap, [id]: { label, slots: [slot] } }, 'new-wall-art'));
    setStatus(`created draft "${id}"`);
  };

  useEffect(() => {
    if (!draftSourceId) return;
    const source = wallDecorAsset(draftSourceId);
    const label = `${source.label} wall art`;
    const id = uniqueWallArtId(draftMap, label);
    const slot = defaultSlot(source.id, 'west', []);
    setDraftMap((cur) => ({
      ...cur,
      [id]: {
        label,
        span: 1,
        slots: [slot],
      },
    }));
    onArtId(id);
    setSelectedSlotIndex(0);
    setNewArtName('New Wall Art');
    setNewArtId(uniqueWallArtId({ ...draftMap, [id]: { label, slots: [slot] } }, 'new-wall-art'));
    setStatus(`created draft "${id}" from ${source.label}`);
    onDraftSourceConsumed?.();
    // The source draft is a one-shot command from the catalog; keep this effect keyed to that command only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftSourceId]);

  const removeSlot = (): void => {
    if (!activeSlot) return;
    setStatus('');
    setDraftMap((cur) => {
      const entry = cur[activeId] ?? activeEntry;
      const slots = (entry.slots ?? []).filter((_, index) => index !== activeSlotIndex);
      return { ...cur, [activeId]: { ...entry, slots } };
    });
    setSelectedSlotIndex(Math.max(0, activeSlotIndex - 1));
  };

  const startSlotDrag = (event: PointerEvent<HTMLButtonElement>, index: number): void => {
    const slot = art.slots[index];
    if (!slot) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedSlotIndex(index);
    drag.current = { pointerId: event.pointerId, index, px: event.clientX, py: event.clientY, x: slot.x, y: slot.y };
  };

  const moveSlotDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    setSlotAtIndex(current.index, {
      x: Math.round(current.x + (event.clientX - current.px) / zoom),
      y: Math.round(current.y + (event.clientY - current.py) / zoom),
    });
  };

  const endSlotDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    drag.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can already be gone after a cancel; nothing else to clean up.
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      const move: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
      };
      const dir = move[event.key];
      if (!dir || !activeSlot) return;
      event.preventDefault();
      nudgeSlot(dir[0], dir[1], event.shiftKey ? 10 : 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeSlot?.id, activeSlot?.x, activeSlot?.y, activeSlotIndex]);

  const save = async (): Promise<void> => {
    if (!dirty) return;
    setStatus('saving...');
    try {
      await saveLiveWallArt(draftMap);
      applyLiveWallArt(draftMap);
      setStatus('saved - live now');
    } catch (err) {
      const result = mapSaveError(err);
      setStatus(`error: ${'action' in result ? 'sign in required' : result.message}`);
    }
  };

  const copy = async (): Promise<void> => {
    await navigator.clipboard.writeText(`${JSON.stringify(draftMap, null, 2)}\n`);
    setStatus('copied wall art JSON');
  };

  const reset = (): void => {
    setDraftMap(cloneMap(currentWallArt()));
    setStatus('reset to saved');
  };

  const committedArt = wallArt(activeId) ?? art;
  const slotBounds = activeSlot?.face === 'north'
    ? { minX: 0, maxX: WALL_FRAME_W + WALL_STEP_X * (art.span - 1), minY: 0, maxY: 180 + WALL_STEP_Y * (art.span - 1) }
    : { minX: -WALL_STEP_X * (art.span - 1), maxX: WALL_FRAME_W, minY: 0, maxY: 180 + WALL_STEP_Y * (art.span - 1) };

  return (
    <>
      <section className="al-lab-main wall-asset-lab-main" aria-label="Wall art preview">
        <ViewPane kind="board" ariaLabel="Wall art board preview" zoom={zoom} pan={pan} minZoom={0.65} maxZoom={3} onZoomChange={setZoom} onPanChange={setPan}>
          <BoardLabBoard
            board={board}
            boardZoom={zoom}
            boardPan={pan}
            className="wall-art-board-surface"
            ariaLabel="Wall art board preview"
            wallOverlays={wallOverlays}
            wallBounds={boardBounds}
          >
            {showSavedGhost ? <WallArtBoardSlots art={committedArt} activeSlotIndex={-1} ghost /> : null}
            <WallArtBoardSlots
              art={art}
              activeSlotIndex={activeSlotIndex}
              onSelectSlot={setSelectedSlotIndex}
              onPointerDown={startSlotDrag}
              onPointerMove={moveSlotDrag}
              onPointerUp={endSlotDrag}
            />
          </BoardLabBoard>
        </ViewPane>
      </section>
      <aside className="tileset-view-controls" aria-label="Wall art controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            <div className="ps-variant wall-art-source-slots">
              <span className="ps-ctl-label">Source artwork slots</span>
              <span className="ps-slot-row">
                <label className="tileset-category-select" title="Which source-art slot the controls below edit.">
                  <span>Source artwork slot</span>
                  <select
                    value={activeSlot ? activeSlotIndex : -1}
                    onChange={(event) => setSelectedSlotIndex(Number(event.target.value))}
                    aria-label="Source artwork slot"
                    disabled={!art.slots.length}
                  >
                    {art.slots.length ? null : <option value={-1}>None</option>}
                    {art.slots.map((slot, index) => (
                      <option key={slot.id} value={index}>{slotLabel(slot, index)}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="ps-slot-button" onClick={addSlot} title="Add source artwork slot" aria-label="Add source artwork slot">+</button>
                <button type="button" className="ps-slot-button ps-slot-remove" onClick={removeSlot} disabled={!activeSlot} title="Remove source artwork slot" aria-label="Remove source artwork slot">-</button>
              </span>
              {activeSlot ? (
                <>
                  <label className="tileset-category-select">
                    <span>Source artwork</span>
                    <select value={activeSlot.sourceId} onChange={(event) => setSlot({ sourceId: wallDecorAsset(event.target.value).id })} aria-label="Source artwork">
                      {WALL_DECOR_ASSETS.map((decor) => <option key={decor.id} value={decor.id}>Wall art source: {decor.label}</option>)}
                    </select>
                  </label>
                  <label className="tileset-category-select">
                    <span>Face</span>
                    <select value={activeSlot.face} onChange={(event) => setSlot({ face: event.target.value as WallDecorFaceId })} aria-label="Wall face">
                      <option value="west">West</option>
                      <option value="north">North</option>
                    </select>
                  </label>
                  <SliderRow label={`X - ${Math.round(activeSlot.x)}`} value={activeSlot.x} set={(value) => setSlot({ x: Math.round(value) })} min={slotBounds.minX} max={slotBounds.maxX} step={1} nudge={1} dflt={defaultSlot(activeSlot.sourceId, activeSlot.face, []).x} />
                  <SliderRow label={`Y - ${Math.round(activeSlot.y)}`} value={activeSlot.y} set={(value) => setSlot({ y: Math.round(value) })} min={slotBounds.minY} max={slotBounds.maxY} step={1} nudge={1} dflt={defaultSlot(activeSlot.sourceId, activeSlot.face, []).y} />
                  <SliderRow label={`Scale - ${activeSlot.scale.toFixed(2)}x`} value={activeSlot.scale} set={(value) => setSlot({ scale: round2(value) })} min={0.25} max={1.8} step={0.01} nudge={0.05} dflt={1} />
                  <div className="ps-block">
                    <span className="ps-ctl-label">Nudge <em>Shift = x10</em></span>
                    <div className="ps-pad">
                      {NUDGE_PAD.map((direction, index) => direction
                        ? (
                          <button
                            key={direction.key}
                            type="button"
                            className="ps-pad-btn"
                            title={`Nudge ${direction.name} (Shift = x10)`}
                            aria-label={`nudge ${direction.name}`}
                            onClick={(event) => nudgeSlot(direction.vx, direction.vy, event.shiftKey ? 10 : 1)}
                          >
                            <DirArrow deg={direction.deg} />
                          </button>
                        )
                        : <span key={`c${index}`} className="ps-pad-center" aria-hidden="true" />)}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
            <div className="ps-variant">
              <span className="ps-ctl-label">Wall art definition</span>
              <label className="tileset-category-select" title="Which wall art is being tuned.">
                <span>Wall art</span>
                <select value={activeId} onChange={(event) => { onArtId(event.target.value); setSelectedSlotIndex(0); }} aria-label="Wall art">
                  {ids.map((id) => (
                    <option key={id} value={id}>{entryAsWallArt(id, draftMap[id]).label}</option>
                  ))}
                </select>
              </label>
              <label className="tileset-category-select">
                <span>Name</span>
                <input value={art.label} onChange={(event) => setArtEntry({ label: event.target.value })} />
              </label>
              <SliderRow label={`Span - ${art.span} wall${art.span === 1 ? '' : 's'}`} value={art.span} set={(value) => setArtEntry({ span: Math.round(value) })} min={1} max={8} step={1} nudge={1} dflt={committedArt.span} />
            </div>
            <div className="ps-variant">
              <span className="ps-ctl-label">New wall art</span>
              <label className="tileset-category-select">
                <span>Name</span>
                <input value={newArtName} onChange={(event) => { setNewArtName(event.target.value); setNewArtId(slugify(event.target.value)); }} />
              </label>
              <label className="tileset-category-select">
                <span>ID</span>
                <input value={newArtId} onChange={(event) => setNewArtId(slugify(event.target.value))} />
              </label>
              <button type="button" className="tileset-view-action" onClick={() => createArt()} title="Create a new wall art definition from the current source artwork slot">Create new from slot</button>
            </div>
            {activeSlot ? <p className="ps-saved">draft: wall art · source slot {activeSlotIndex + 1}/{art.slots.length} from {wallDecorAsset(activeSlot.sourceId).label}</p> : null}
            <label className="tileset-category-select" title="The ground family under the preview board.">
              <span>Ground</span>
              <select value={family} onChange={(event) => setFamily(event.target.value as Family)} aria-label="Ground family">
                {FAMILIES.map((item) => <option key={item} value={item}>{cap(item)}</option>)}
              </select>
            </label>
            <label className="tileset-catalog-zoom">
              <span>Zoom</span>
              <input type="range" min={0.65} max={3} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
            </label>
            <div className="ps-toggles">
              <button type="button" className={`ps-toggle ${showSavedGhost ? 'is-on' : ''}`} onClick={() => setShowSavedGhost((value) => !value)} title="Overlay the saved wall art for comparison">Ghost</button>
              <button type="button" className="ps-toggle" onClick={() => setSeed((value) => (value % 9999) + 1)} title="Re-roll the board tiles">Re-roll</button>
            </div>
            <dl className="al-meta">
              <div><dt>ID</dt><dd>{activeId}</dd></div>
              <div><dt>Slots</dt><dd>{art.slots.length}</dd></div>
              <div><dt>Span</dt><dd>{art.span} wall{art.span === 1 ? '' : 's'}</dd></div>
            </dl>
            <div className="ps-actions">
              <button type="button" className="tileset-view-action ps-primary" onClick={() => void save()} disabled={!dirty}>Save live</button>
              <button type="button" className="tileset-view-action" onClick={() => void copy()}>Copy JSON</button>
              <button type="button" className="tileset-view-action" onClick={reset} disabled={!dirty}>Reset</button>
            </div>
            {status ? <p className={`ps-status ${status.startsWith('error') ? 'is-error' : ''}`}>{status}</p> : null}
            {dirty && !status ? <p className="ps-status">unsaved changes</p> : null}
          </div>
        </section>
      </aside>
    </>
  );
}
