import { useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { tileAssets, tileFamilies } from '../art/tileset';
import { solveSocketBoard } from '../core/tileBoardGenerator';
import { BoardLabBoard, boardLabCellPosition } from '../render/BoardLabBoard';
import { StructureSprite } from '../render/BoardStructure';
import { objectBaseZIndex } from '../render/sceneDepth';
import { PROP_DEFS, propDef } from '../core/props';
import { structureArtAsset, structureArtHalfSrc } from '../core/structureArt';
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

  const reviewableProps = useMemo(() => catalog ? propsWithCandidates(catalog) : [], [catalog]);
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

            <label className="tileset-catalog-zoom">
              <span>Prop</span>
              <select value={activeProp} onChange={(event) => { onPropId(event.target.value); setSelectedKey(''); }}>
                {(reviewableProps.length ? reviewableProps : PROP_DEFS.map((entry) => entry.id)).map((id) => (
                  <option key={id} value={id}>{structureArtAsset(id)?.label ?? id}</option>
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
            <p className="pc-note">Slots: {slots.join(' · ')}</p>
          </div>
        </section>
      </aside>
    </>
  );
}
