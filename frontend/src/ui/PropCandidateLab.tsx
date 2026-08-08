import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import { tileAssets, tileFamilies } from '../art/tileset';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard, boardLabCellPosition } from '../render/BoardLabBoard';
import { StructureSprite, seatTransformPercent, structureSeatPoint } from '../render/BoardStructure';
import { arrivalOffset, structureLandingMs, STRUCTURE_ENTRANCE_MS, STRUCTURE_IMPACT_MS } from '../render/SkirmishBoard';
import { objectBaseZIndex } from '../render/sceneDepth';
import { PROP_DEFS, propDef } from '../core/props';
import { structureArtAsset, structureArtHalfSrc, structureArtImpact, structureRasterDimensions } from '../core/structureArt';
import { pieceSpritePath } from '../core/pieces';
import { terrainFamiliesForRole } from '../core/tileSockets';
import { ViewPane } from './shared/ViewPane';
import { reportAuthSessionFailure } from '../net/authSession';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersions,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import {
  candidateSeat,
  propCandidateGroups,
  propCandidateSlots,
  propsWithCandidates,
  type PropCandidateGroup,
  type PropCandidateSeat,
} from './propCandidateReview';

// The prop half of the acceptance story. /surface-lab already lets terrain candidates be judged
// on the real board and installed from there; props had no equivalent, so generated prop art
// could only ever be looked at on a contact sheet — and the accept path refuses art that carries
// no live-surface proof. This is that surface: every staged candidate for one prop, mounted on
// the real board renderer at canonical 1x over real terrain, beside the art it would replace.
//
// Nothing here installs anything on its own. Review records the owner's approval against the
// exact reviewed bytes plus this page's URL; Accept then swaps the slot pointers. A candidate
// that is merely looked at changes nothing.

const COLS = 11;
const ROWS = 8;
const SURFACE_KIND = 'prop-candidate-board';

// Scoped to this viewer, exactly as PropSeatLab scopes its own — the Studio is a plain web page
// (ADR-0058) and does not carry the game's chrome kit.
const PC_CSS = `
.pc-board-main { padding: 0; grid-template-rows: minmax(0, 1fr); align-content: stretch; overflow: hidden; }
.pc-board-surface .tileset-generated-board-tile img { image-rendering: pixelated; }
.pc-board-surface img { image-rendering: pixelated; }
.pc-note { color: #9fb4c6; font-size: 12px; line-height: 1.45; margin: 2px 0 0; }
.pc-note--bad { color: #ffb4a8; }
.pc-list { display: grid; gap: 3px; max-height: 320px; overflow-y: auto; }
.pc-row { align-items: center; background: rgba(12,20,28,.6); border: 1px solid rgba(96,140,170,.35);
  border-radius: 4px; color: #cfe2f0; cursor: pointer; display: grid; font-size: 12px; gap: 8px;
  grid-template-columns: 28px 1fr auto; padding: 3px 6px; text-align: left; }
.pc-row.is-on { background: rgba(28,102,199,.28); border-color: rgba(140,200,255,.8); }
.pc-row img { image-rendering: pixelated; }
.pc-row-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-row-state { color: #8fb0c6; font-size: 11px; }
.pc-entrance { position: absolute; left: var(--pc-left); top: var(--pc-top);
  width: var(--pc-frame-w); height: var(--pc-frame-h); background-image: var(--pc-sheet);
  background-size: var(--pc-sheet-w) var(--pc-frame-h); background-position: var(--pc-offset) 0;
  background-repeat: no-repeat; image-rendering: pixelated; pointer-events: none;
  opacity: var(--pc-alpha); transform: translate(var(--pc-shift-x), var(--pc-shift-y)); }
.pc-impact { display: grid; gap: 6px; justify-items: start; }
.pc-impact-stage { width: var(--pc-frame-w); height: var(--pc-frame-h); background-image: var(--pc-sheet);
  background-size: var(--pc-sheet-w) var(--pc-frame-h); background-position: var(--pc-offset) 0;
  background-repeat: no-repeat; background-color: #3f6d2f; border: 1px solid rgba(96,140,170,.35);
  border-radius: 4px; image-rendering: pixelated; }
`;

function CandidateSprite({
  seat,
  cell,
  srcFor,
}: {
  seat: PropCandidateSeat;
  cell: { x: number; y: number };
  srcFor: (half: 'back' | 'front') => string;
}): ReactElement {
  return (
    <StructureSprite
      anchor={cell}
      w={1}
      h={1}
      sprite={{ w: seat.width, h: seat.height, anchorX: seat.anchorX, anchorY: seat.anchorY, scale: seat.scale }}
      srcFor={srcFor}
      splitMode="flat-contact"
      attrsFor={(half) => ({ 'data-prop-candidate': seat.key, 'data-half': half })}
    />
  );
}

/**
 * The prop's ENTRANCE, replayed on the board: the fall, the landing, and what the impact leaves.
 * It runs the game's own `arrivalOffset` and impact frame policy against a local clock rather
 * than a lookalike, so the Studio cannot drift from what a battle actually shows — if the
 * choreography is retuned, this retunes with it.
 */
function EntrancePreview({ artId, cell, timeMs }: {
  artId: string;
  cell: { x: number; y: number };
  timeMs: number | null;
}): ReactElement | null {
  const sheet = structureArtImpact(artId);
  const art = structureArtAsset(artId);
  if (!art) return null;
  const sprite = art.sprite;
  const raster = sheet
    ? { w: sheet.frameWidth, h: sheet.frameHeight }
    : structureRasterDimensions(artId);
  const scale = sprite.scale;
  const { left, top } = structureSeatPoint(cell, 1, 1);
  const { x: tx, y: ty } = seatTransformPercent({ w: raster.w, h: raster.h, anchorX: sprite.anchorX, anchorY: sprite.anchorY });

  // A null clock means "not playing" — show the resting frame, exactly as an unplayed prop.
  const elapsed = timeMs ?? STRUCTURE_ENTRANCE_MS;
  const plan = { startMs: 0, delayMs: 0 };
  const fall = arrivalOffset(elapsed, plan);
  const landedAt = structureLandingMs(plan) ?? 0;
  const frames = sheet?.frameCount ?? 1;
  const frame = elapsed < landedAt
    ? 0
    : Math.min(frames - 1, Math.floor((elapsed - landedAt) / (STRUCTURE_IMPACT_MS / frames)));

  return (
    <div
      className="pc-entrance"
      style={{
        '--pc-left': `${left}px`,
        '--pc-top': `${top}px`,
        '--pc-frame-w': `${raster.w * scale}px`,
        '--pc-frame-h': `${raster.h * scale}px`,
        '--pc-sheet-w': `${raster.w * frames * scale}px`,
        '--pc-offset': `-${frame * raster.w * scale}px`,
        '--pc-sheet': `url(${sheet?.src ?? structureArtHalfSrc(artId, 'front')})`,
        '--pc-shift-x': `${tx}%`,
        '--pc-shift-y': `calc(${ty}% + ${fall.dy}px)`,
        '--pc-alpha': `${fall.opacity}`,
        zIndex: objectBaseZIndex(cell),
      } as CSSProperties}
      data-entrance-frame={frame}
    />
  );
}

/**
 * The impact sheet, under the hand. On the board this plays once and holds forever, which is
 * right for the game and useless for judging art — you cannot see it twice without reloading the
 * board. Here it loops, steps, and replays on demand at a readable size, which is the whole
 * reason a Studio surface exists.
 */
function ImpactReview({ artId }: { artId: string }): ReactElement | null {
  const sheet = useMemo(() => structureArtImpact(artId), [artId]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [zoom, setZoom] = useState(4);
  const frames = sheet?.frameCount ?? 0;

  useEffect(() => {
    if (!playing || frames < 2) return undefined;
    const timer = window.setInterval(() => setFrame((current) => (current + 1) % frames), 110);
    return () => window.clearInterval(timer);
  }, [frames, playing]);

  useEffect(() => { setFrame(0); setPlaying(true); }, [artId]);

  if (!sheet) return <p className="pc-note">No impact sheet installed for this prop — it lands and looks the same.</p>;
  const step = (delta: number): void => { setPlaying(false); setFrame((current) => (current + delta + frames) % frames); };
  return (
    <div className="pc-impact">
      {/* Geometry travels as custom properties; every painted property lives in the stylesheet,
          so this stays a registered surface rather than inline chrome. */}
      <div
        className="pc-impact-stage"
        style={{
          '--pc-frame-w': `${sheet.frameWidth * zoom}px`,
          '--pc-frame-h': `${sheet.frameHeight * zoom}px`,
          '--pc-sheet-w': `${sheet.frameWidth * sheet.frameCount * zoom}px`,
          '--pc-offset': `-${frame * sheet.frameWidth * zoom}px`,
          '--pc-sheet': `url(${sheet.src})`,
        } as CSSProperties}
      />
      <div className="ps-toggles">
        <button type="button" className="ps-toggle" onClick={() => { setFrame(0); setPlaying(true); }}>Play again</button>
        <button type="button" className={`ps-toggle ${playing ? 'is-on' : ''}`} onClick={() => setPlaying((on) => !on)}>
          {playing ? 'Pause' : 'Loop'}
        </button>
        <button type="button" className="ps-toggle" onClick={() => step(-1)}>◀</button>
        <button type="button" className="ps-toggle" onClick={() => step(1)}>▶</button>
      </div>
      <label className="tileset-catalog-zoom">
        <span>Zoom {zoom}×</span>
        <input type="range" min={1} max={10} step={1} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
      </label>
      <p className="pc-note">Frame {frame + 1} of {frames} · {sheet.frameWidth}×{sheet.frameHeight} · frame 1 is the resting rock, the last is what it keeps.</p>
    </div>
  );
}

export function PropCandidateLab({ propId, onPropId, header }: {
  propId: string;
  onPropId: (id: string) => void;
  header?: ReactNode;
}): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'unauthorized' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [family, setFamily] = useState('grass');
  const [seed, setSeed] = useState(7);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [showUnit, setShowUnit] = useState(true);
  const [selectedKey, setSelectedKey] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'reviewing' | 'accepting' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [seats, setSeats] = useState<ReadonlyMap<string, PropCandidateSeat>>(new Map());
  const [seatError, setSeatError] = useState<string | null>(null);
  const [entranceMs, setEntranceMs] = useState<number | null>(null);
  const [entranceSpeed, setEntranceSpeed] = useState(1);
  const [entranceCell, setEntranceCell] = useState({ x: 5, y: 4 });
  // Each press is its own run. Keying the clock on the CURRENT time cannot work — the value is
  // the same at rest as it is at the end of a run, so a second press changes no dependency and
  // never restarts the loop. A token that only ever increments is what makes replay replay.
  const [entranceRun, setEntranceRun] = useState(0);

  useEffect(() => {
    if (entranceRun === 0) return undefined;
    let raf = 0;
    const rate = Math.max(0.05, entranceSpeed);
    const startedAt = performance.now();
    const tick = (now: number): void => {
      const elapsed = (now - startedAt) * rate;
      if (elapsed >= STRUCTURE_ENTRANCE_MS) { setEntranceMs(STRUCTURE_ENTRANCE_MS); return; }
      setEntranceMs(elapsed);
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [entranceRun, entranceSpeed]);

  const playEntrance = (): void => { setEntranceMs(0); setEntranceRun((run) => run + 1); };

  const refresh = useCallback(async (): Promise<void> => {
    setState((current) => (current === 'ready' ? current : 'loading'));
    try {
      setCatalog(await fetchAdminLiveMediaCatalog());
      setState('ready');
      setError(null);
    } catch (cause) {
      if (reportAuthSessionFailure(cause)) { setCatalog(null); setState('unauthorized'); setError(null); return; }
      setState('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  // EVERY prop is selectable. Staged candidates and impact sheets are things a prop may have, not
  // conditions for being worth looking at — the entrance is worth watching for a prop with
  // neither, and filtering them out made most of the catalog unreachable from the one surface
  // that can replay it.
  const staged = useMemo(() => new Set(catalog ? propsWithCandidates(catalog) : []), [catalog]);
  const reviewableProps = useMemo(
    () => [...new Set([...staged, ...PROP_DEFS.map((def) => def.id)])].sort(),
    [staged],
  );
  const propIndex = Math.max(0, reviewableProps.indexOf(reviewableProps.includes(propId) ? propId : reviewableProps[0] ?? propId));
  const stepProp = useCallback((delta: number): void => {
    if (!reviewableProps.length) return;
    const next = (propIndex + delta + reviewableProps.length) % reviewableProps.length;
    onPropId(reviewableProps[next]);
    setSelectedKey('');
    setNotice(null);
  }, [onPropId, propIndex, reviewableProps]);
  const propBadge = useCallback((id: string): string => {
    const marks = [
      staged.has(id) ? 'candidates' : '',
      structureArtImpact(propDef(id)?.spriteId ?? id) ? 'impact' : '',
    ].filter(Boolean);
    return marks.length ? ` · ${marks.join(' + ')}` : '';
  }, [staged]);
  const activeProp = reviewableProps.includes(propId) ? propId : (reviewableProps[0] ?? propId);
  const slots = useMemo(() => propCandidateSlots(activeProp), [activeProp]);
  const groups = useMemo(
    () => catalog ? propCandidateGroups(catalog, activeProp) : [],
    [activeProp, catalog],
  );
  const accepted = useMemo(() => propDef(activeProp) ?? null, [activeProp]);

  // Every candidate is measured from its own decoded pixels, so a 56px drawing and a 40px
  // drawing are compared at the same on-board size instead of one merely looking bolder.
  useEffect(() => {
    let cancelled = false;
    const target = accepted ? accepted.sprite.w * accepted.sprite.scale : 40;
    void Promise.all(groups.map(async (group) => [group.key, await candidateSeat(group, target)] as const))
      .then((entries) => { if (!cancelled) { setSeats(new Map(entries)); setSeatError(null); } })
      .catch((cause: unknown) => {
        // A measurement failure means nothing can be mounted, which would otherwise read as
        // "no candidates" — say so instead of showing an empty board.
        if (cancelled) return;
        setSeats(new Map());
        setSeatError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => { cancelled = true; };
  }, [accepted, groups]);

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

  const families = useMemo(() => terrainFamiliesForRole('prop-seat-preview').map((entry) => entry.id), []);
  const selected = groups.find((group) => group.key === selectedKey) ?? null;
  const seated = groups.filter((group) => seats.has(group.key));
  // The proof this surface signs is "these bytes, mounted here, at 1x". Signing before every
  // candidate has decoded and been seated would attest to a board that was not on screen.
  const proofMounted = zoom === 1 && seated.length === groups.length && groups.length > 0;

  const cellFor = (index: number): { x: number; y: number } => ({
    x: 2 + (index % (COLS - 3)),
    y: 2 + Math.floor(index / (COLS - 3)) * 2,
  });
  const referenceCell = { x: 0, y: 2 };
  const unitCell = { x: 0, y: 5 };
  const unitPos = boardLabCellPosition(unitCell);

  const versionsFor = (group: PropCandidateGroup): AdminLiveMediaVersion[] => group.versions;

  const handleReview = async (): Promise<void> => {
    if (!selected || !proofMounted || !notes.trim()) return;
    setBusy('reviewing');
    setNotice(null);
    const surfaceUrl = window.location.href;
    try {
      for (const version of versionsFor(selected)) {
        await reviewLiveMediaVersions({
          versions: [version],
          notes: notes.trim(),
          surfaceUrl,
          evidence: {
            schema: 'live-media-owner-proof-v1',
            versionId: version.id,
            contentSha256: version.media?.sha256 ?? '',
            slot: version.slot ?? '',
            canonicalScale: 1,
            surfaceKind: SURFACE_KIND,
          },
        });
      }
      await refresh();
      setNotice(`Approved ${selected.label} against this board.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  const handleAccept = async (): Promise<void> => {
    if (!selected || !catalog) return;
    setBusy('accepting');
    setNotice(null);
    try {
      const bySlot = new Map(catalog.slots.map((slot) => [slot.slot, slot]));
      await acceptLiveMediaVersions(versionsFor(selected).map((version) => {
        const slot = version.slot ? bySlot.get(version.slot) : undefined;
        return {
          id: version.id,
          expectedRevision: version.rowRevision,
          expectedSlotRevision: slot?.rowRevision ?? 0,
          expectedActiveVersionId: slot?.activeVersionId ?? null,
        };
      }));
      await refresh();
      setNotice(`Installed ${selected.label}. Re-seat it in /prop-lab if its frame changed size.`);
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <style>{PC_CSS}</style>
      <section className="al-lab-main pc-board-main" aria-label="Prop candidate board">
        <ViewPane kind="board" ariaLabel="Prop candidate viewport" zoom={zoom} pan={pan} minZoom={0.5} maxZoom={3} onZoomChange={setZoom} onPanChange={setPan}>
          <BoardLabBoard board={board} assetFrameSrc={(a) => a.src} boardZoom={zoom} boardPan={pan} className="pc-board-surface" ariaLabel="Prop candidate preview board">
            {accepted ? (
              <StructureSprite
                anchor={referenceCell}
                w={accepted.w}
                h={accepted.h}
                sprite={accepted.sprite}
                srcFor={(half) => structureArtHalfSrc(accepted.spriteId, half)}
                splitMode="flat-contact"
                attrsFor={(half) => ({ 'data-prop-accepted': accepted.id, 'data-half': half })}
              />
            ) : null}
            {groups.map((group, index) => {
              const seat = seats.get(group.key);
              if (!seat) return null;
              return (
                <CandidateSprite
                  key={group.key}
                  seat={seat}
                  cell={cellFor(index)}
                  srcFor={() => group.previewUrl}
                />
              );
            })}
            <EntrancePreview artId={propDef(activeProp)?.spriteId ?? activeProp} cell={entranceCell} timeMs={entranceMs} />
            {showUnit ? (
              <span className="board-unit-seat is-knight" style={{ left: unitPos.left, top: unitPos.top, zIndex: objectBaseZIndex(unitCell) }}>
                <img src={pieceSpritePath('knight')} alt="" draggable={false} />
              </span>
            ) : null}
          </BoardLabBoard>
        </ViewPane>
      </section>

      <aside className="tileset-view-controls" aria-label="Prop candidate controls">
        <section className="tileset-inspector-section">
          <h2>Controls</h2>
          <div className="tileset-control-stack">
            {header}
            {state === 'unauthorized' ? <p className="pc-note">Sign in as an owner to review candidates.</p> : null}
            {state === 'error' ? <p className="pc-note pc-note--bad">{error}</p> : null}

            {/* Walking the catalog is how a batch gets judged — picking each id out of a
                dropdown turns "compare seventeen rocks" into seventeen menu hunts. */}
            <div className="ps-toggles">
              <button type="button" className="ps-toggle" aria-label="Previous prop"
                onClick={() => stepProp(-1)}>◀</button>
              <span className="pc-note">{propIndex + 1} / {reviewableProps.length}</span>
              <button type="button" className="ps-toggle" aria-label="Next prop"
                onClick={() => stepProp(1)}>▶</button>
            </div>
            <label className="tileset-catalog-zoom">
              <span>Prop</span>
              <select value={activeProp} onChange={(event) => { onPropId(event.target.value); setSelectedKey(''); }}>
                {reviewableProps.map((id) => (
                  <option key={id} value={id}>{(structureArtAsset(id)?.label ?? propDef(id)?.label ?? id) + propBadge(id)}</option>
                ))}
              </select>
            </label>

            <label className="tileset-catalog-zoom">
              <span>Ground</span>
              <select value={family} onChange={(event) => setFamily(event.target.value)}>
                {families.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </label>

            <div className="ps-toggles">
              <button type="button" className={`ps-toggle ${showUnit ? 'is-on' : ''}`} onClick={() => setShowUnit((on) => !on)}>Unit</button>
              <button type="button" className="ps-toggle" onClick={() => setSeed((value) => value + 1)}>Reroll</button>
              <button type="button" className={`ps-toggle ${zoom === 1 ? 'is-on' : ''}`} onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>1× · fit proof</button>
            </div>

            <p className={`pc-note ${seatError ? 'pc-note--bad' : ''}`}>
              {seatError
                ? `Could not measure candidates: ${seatError}`
                : groups.length === 0
                  ? `No staged candidates for ${activeProp}.`
                  : `${seated.length}/${groups.length} candidate${groups.length === 1 ? '' : 's'} on the board. Far left is the installed art.`}
            </p>

            <div className="pc-list" role="listbox" aria-label="Staged candidates">
              {groups.map((group, index) => (
                <button
                  key={group.key}
                  type="button"
                  role="option"
                  aria-selected={group.key === selectedKey}
                  className={`pc-row ${group.key === selectedKey ? 'is-on' : ''}`}
                  onClick={() => { setSelectedKey(group.key); setNotice(null); }}
                >
                  <img src={group.previewUrl} alt="" width={28} height={28} />
                  <span className="pc-row-label">{index + 1}. {group.label}</span>
                  <span className="pc-row-state">{group.reviewed ? 'approved' : 'staged'}</span>
                </button>
              ))}
            </div>

            <label className="tileset-catalog-zoom">
              <span>Review note</span>
              <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="why this one" />
            </label>

            {!proofMounted && groups.length > 0
              ? <p className="pc-note">Set 1× and let every candidate paint before approving — the proof records this exact board.</p>
              : null}

            <div className="ps-toggles">
              <button type="button" className="ps-toggle" disabled={!selected || !proofMounted || !notes.trim() || busy !== null} onClick={() => void handleReview()}>
                {busy === 'reviewing' ? 'Approving…' : 'Approve on this board'}
              </button>
              <button type="button" className="ps-toggle" disabled={!selected || !selected.reviewed || busy !== null} onClick={() => void handleAccept()}>
                {busy === 'accepting' ? 'Installing…' : 'Install'}
              </button>
            </div>
            {notice ? <p className="pc-note">{notice}</p> : null}
            <h2>Entrance</h2>
            <div className="ps-toggles">
              <button type="button" className="ps-toggle" onClick={playEntrance}>Play entrance</button>
              {[1, 0.5, 0.25].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  className={`ps-toggle ${entranceSpeed === rate ? 'is-on' : ''}`}
                  onClick={() => setEntranceSpeed(rate)}
                >{rate === 1 ? '1×' : rate === 0.5 ? '½×' : '¼×'}</button>
              ))}
            </div>
            <label className="tileset-catalog-zoom">
              <span>Scrub {Math.round(entranceMs ?? STRUCTURE_ENTRANCE_MS)}ms</span>
              <input
                type="range" min={0} max={STRUCTURE_ENTRANCE_MS} step={10}
                value={Math.round(entranceMs ?? STRUCTURE_ENTRANCE_MS)}
                onChange={(event) => { setEntranceRun(0); setEntranceMs(Number(event.target.value)); }}
              />
            </label>
            <div className="ps-toggles">
              {(['x', 'y'] as const).map((axis) => (
                <button key={axis} type="button" className="ps-toggle"
                  onClick={() => setEntranceCell((cell) => ({
                    ...cell,
                    [axis]: (cell[axis] + 1) % (axis === 'x' ? COLS : ROWS),
                  }))}
                >Move {axis.toUpperCase()} ({entranceCell[axis]})</button>
              ))}
            </div>
            <p className="pc-note">The fall is {STRUCTURE_ENTRANCE_MS - STRUCTURE_IMPACT_MS}ms, the impact {STRUCTURE_IMPACT_MS}ms. Same functions the battle runs.</p>

            <h2>Impact frames</h2>
            <ImpactReview artId={propDef(activeProp)?.spriteId ?? activeProp} />

            <p className="pc-note">Slots: {slots.join(' · ')}</p>
          </div>
        </section>
      </aside>
    </>
  );
}
