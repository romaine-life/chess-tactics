import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { navigateApp } from './navigation';
import {
  DEFAULT_POOL_MODEL,
  POOL_GROUPINGS,
  POOL_MODELS,
  POOL_PIECES,
  POOL_PILE_SLOTS,
  buildPool,
  groupPool,
  poolPriceSteps,
  poolRotationContract,
  poolTermFormula,
  poolTermLabel,
  priceCard,
  sameKnobs,
  summarizePool,
  type PoolBand,
  type PoolCard,
  type PoolCell,
  type PoolGrouping,
  type PoolKnobs,
  type PoolModel,
  type PoolPiece,
  type PoolTerm,
} from './runCardPool';

// Studio → Card Pool. The offer catalog re-derived live from its own rules, so the distribution
// questions can be asked at the surface instead of one probe script at a time: how big is common,
// what does a cost band admit, what does dropping rotation collapse actually cost in cards and in
// illustrations. Every number here is computed from the knobs on the left.
//
// Two things make it usable in a conversation rather than only in a sitting. MODELS are named whole
// positions, because a design argument moves by proposing a complete alternative and not by nudging
// one number. GROUPS are a register in the Prosopography sense: choose a dimension and read who is
// actually in each bucket, because a tier count answers "how many" and never answers "which".
//
// The two `Shipped rule` models are the position every proposal is arguing against, and they are the
// game rather than a likeness of it: the pool admits both over-cap named cards, the price chain
// rounds where `runCardCost` rounds, and the tier is read straight out of `runCardRarity`. Read one
// of them first. A proposal compared against a baseline the studio could not draw is not compared
// against anything, which is how the Bishop pair came to be discussed as a card to PROMOTE into Rare
// while the shipped rule already had it there.

// Which MODEL is on screen is the whole content of this page, so it is addressed rather than
// clicked to: `?poolModel=<id>` opens straight on a position instead of on the head of the list with
// a dropdown still to find. The Studio's route encoder rebuilds the query from its own model, so
// preserveCardPoolRouteParams in TilePreview keeps this alive across that rebuild — the same shape
// the Chrome Lab and the Main Menu tuner use for their own sub-state. The head of the list is the
// default and is written as an ABSENT param, so a plain catalog link stays plain.
export const POOL_MODEL_PARAM = 'poolModel';

function readPoolModel(): PoolModel {
  if (typeof window === 'undefined') return DEFAULT_POOL_MODEL;
  const id = new URLSearchParams(window.location.search).get(POOL_MODEL_PARAM);
  return POOL_MODELS.find((model) => model.id === id) ?? DEFAULT_POOL_MODEL;
}

function writePoolModel(id: string): void {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (id === DEFAULT_POOL_MODEL.id) url.searchParams.delete(POOL_MODEL_PARAM);
  else url.searchParams.set(POOL_MODEL_PARAM, id);
  const query = url.searchParams.toString();
  navigateApp(`${url.pathname}${query ? `?${query}` : ''}${url.hash}`, { replace: true, scroll: false });
}

const BANDS: readonly PoolBand[] = ['common', 'uncommon', 'rare'];
const MAX_ROWS_PER_GROUP = 60;

/** Body size the surface is authored at. Owned by Controls, not by the page it governs. */
export const RUN_CARD_POOL_DEFAULT_TEXT_SIZE = 15;
export const RUN_CARD_POOL_MIN_TEXT_SIZE = 11;
export const RUN_CARD_POOL_MAX_TEXT_SIZE = 26;

function ShapeGrid({ cells, pieces }: { cells: readonly PoolCell[]; pieces: readonly PoolPiece[] }): ReactElement {
  const w = Math.max(...cells.map((c) => c.x)) + 1;
  const h = Math.max(...cells.map((c) => c.y)) + 1;
  const seat = new Map(cells.map((cell, index) => [`${cell.x},${cell.y}`, pieces[index]]));
  return (
    <span className="rcp-shape" style={{ gridTemplateColumns: `repeat(${w}, 1fr)`, gridTemplateRows: `repeat(${h}, 1fr)` }}>
      {Array.from({ length: w * h }, (_, i) => {
        const x = i % w;
        const y = Math.floor(i / w);
        const piece = seat.get(`${x},${y}`);
        return <span key={i} className={piece ? 'rcp-cell is-filled' : 'rcp-cell'}>{piece ?? ''}</span>;
      })}
    </span>
  );
}

function NumberRow({
  label, value, onChange, step = 1, min, max, hint,
}: {
  label: string; value: number; onChange: (next: number) => void;
  step?: number; min?: number; max?: number; hint?: string;
}): ReactElement {
  return (
    <label className="rcp-row" title={hint}>
      <span className="rcp-row-label">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(next);
        }}
      />
    </label>
  );
}

function CardTable({ cards }: { cards: readonly PoolCard[] }): ReactElement {
  return (
    <table>
      <thead>
        <tr><th>shape</th><th>pieces</th><th>mat</th><th>vol</th><th>dens</th><th>cost</th><th>band</th><th title="Total defences: per piece, how many others cover it, summed">def</th><th title="Pawns stuck directly behind a friendly piece">blk</th><th>BB</th></tr>
      </thead>
      <tbody>
        {cards.slice(0, MAX_ROWS_PER_GROUP).map((card) => (
          <tr key={card.key} className={`rcp-band-${card.band}`}>
            <td><ShapeGrid cells={card.cells} pieces={card.pieces} /></td>
            <td>{card.pieces.join('')}</td>
            <td>{card.value}</td>
            <td>{card.volume}</td>
            <td>{card.density.toFixed(2)}</td>
            <td>{card.cost}</td>
            <td>{card.band}</td>
            <td>{card.defences || ''}</td>
            <td>{card.blockedPawns || ''}</td>
            <td>{card.hasBishopPair ? '✦' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RunCardPoolCatalog({ textSize }: { textSize: number }): ReactElement {
  const opened = readPoolModel();
  const [modelId, setModelId] = useState<string>(opened.id);
  const [knobs, setKnobs] = useState<PoolKnobs>(opened.knobs);
  const [bandFilter, setBandFilter] = useState<PoolBand | 'all'>('all');
  const [volumeFilter, setVolumeFilter] = useState<number | 'all'>('all');
  const [pieceFilter, setPieceFilter] = useState<PoolPiece | 'all'>('all');
  const [grouping, setGrouping] = useState<PoolGrouping>('band');
  const [draft, setDraft] = useState<Map<string, PoolPiece>>(new Map([['0,0', 'P']]));

  const set = useCallback(<K extends keyof PoolKnobs>(field: K, value: PoolKnobs[K]) => {
    setKnobs((prev) => ({ ...prev, [field]: value }));
  }, []);
  const setTerm = useCallback((index: number, term: PoolTerm) => {
    setKnobs((prev) => ({ ...prev, terms: prev.terms.map((existing, at) => (at === index ? term : existing)) }));
  }, []);
  const setPieceValue = useCallback((piece: PoolPiece, value: number) => {
    setKnobs((prev) => ({ ...prev, pieceValue: { ...prev.pieceValue, [piece]: value } }));
  }, []);
  const applyModel = useCallback((id: string) => {
    const model = POOL_MODELS.find((candidate) => candidate.id === id);
    if (!model) return;
    setModelId(id);
    setKnobs(model.knobs);
    writePoolModel(id);
  }, []);

  const activeModel = POOL_MODELS.find((model) => model.id === modelId) ?? null;
  const isCustom = activeModel !== null && !sameKnobs(activeModel.knobs, knobs);

  const rotation = useMemo(() => poolRotationContract(knobs), [knobs]);
  const cards = useMemo(() => buildPool(knobs), [knobs]);
  const summary = useMemo(() => summarizePool(cards), [cards]);

  const shown = useMemo(() => cards.filter((card) => (
    (bandFilter === 'all' || card.band === bandFilter)
    && (volumeFilter === 'all' || card.volume === volumeFilter)
    && (pieceFilter === 'all' || card.pieces.includes(pieceFilter))
  )), [cards, bandFilter, volumeFilter, pieceFilter]);

  const groups = useMemo(() => groupPool(shown, grouping), [shown, grouping]);

  const draftCells = useMemo(() => (
    [...draft.keys()].map((k) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    }).sort((a, b) => a.y - b.y || a.x - b.x)
  ), [draft]);
  const draftPieces = useMemo(() => draftCells.map((c) => draft.get(`${c.x},${c.y}`) as PoolPiece), [draftCells, draft]);
  const draftStats = useMemo(() => (
    draftCells.length === 0 ? null : priceCard(draftCells, draftPieces, knobs)
  ), [draftCells, draftPieces, knobs]);
  const draftSteps = useMemo(() => (
    draftCells.length === 0 ? null : poolPriceSteps(draftCells, draftPieces, knobs)
  ), [draftCells, draftPieces, knobs]);
  const draftInPool = useMemo(() => {
    if (!draftStats) return false;
    const wanted = draftCells.map((c, i) => `${c.x}${c.y}${draftPieces[i]}`).sort().join('-');
    return cards.some((card) => card.cells.map((c, i) => `${c.x}${c.y}${card.pieces[i]}`).sort().join('-') === wanted);
  }, [cards, draftCells, draftPieces, draftStats]);

  const cycleCell = useCallback((x: number, y: number) => {
    setDraft((prev) => {
      const next = new Map(prev);
      const k = `${x},${y}`;
      const current = next.get(k);
      if (current === undefined) next.set(k, 'P');
      else {
        const index = POOL_PIECES.indexOf(current);
        if (index === POOL_PIECES.length - 1) next.delete(k);
        else next.set(k, POOL_PIECES[index + 1]);
      }
      return next;
    });
  }, []);

  return (
    <div className="rcp" style={{ ['--rcp-fs' as string]: `${textSize}px` }}>
      <style>{`
        /* Every size below is a multiple of --rcp-fs, so the slider moves the whole surface
           together instead of leaving half of it at its authored size. */
        /* The studio shell is height:100% + overflow:hidden and only hands scrolling to a child
           carrying the tileset-studio-grid class. This page is not that grid, so it has to own
           its own scrolling or its lower half is simply unreachable. */
        .rcp { display: grid; grid-template-columns: minmax(calc(var(--rcp-fs) * 20), calc(var(--rcp-fs) * 24)) 1fr; gap: 22px; align-items: start; font-size: var(--rcp-fs); min-height: 0; height: 100%; overflow-y: auto; overscroll-behavior: contain; padding-bottom: calc(var(--rcp-fs) * 3); }
        .rcp h3 { margin: 0 0 10px; font-size: var(--rcp-fs); letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.8; }
        .rcp-panel { border: 1px solid rgba(255,255,255,0.16); border-radius: 6px; padding: 14px 16px; margin-bottom: 16px; }
        .rcp-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 7px 0; font-size: var(--rcp-fs); }
        .rcp-row-label { opacity: 0.85; }
        .rcp-row input[type=number] { width: calc(var(--rcp-fs) * 6); padding: 4px 8px; font: inherit; font-size: var(--rcp-fs); }
        .rcp-check { display: flex; align-items: center; gap: 9px; margin: 8px 0; font-size: var(--rcp-fs); }
        .rcp-select-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 10px 0; font-size: var(--rcp-fs); }
        .rcp-select-row select { font: inherit; font-size: var(--rcp-fs); padding: 4px 6px; min-width: 0; flex: 1 1 auto; }
        .rcp-check input { width: calc(var(--rcp-fs) * 1.05); height: calc(var(--rcp-fs) * 1.05); }
        .rcp-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(calc(var(--rcp-fs) * 10), 1fr)); gap: 10px; margin-bottom: 16px; }
        .rcp-stat { border: 1px solid rgba(255,255,255,0.16); border-radius: 6px; padding: 12px 14px; }
        .rcp-stat b { display: block; font-size: calc(var(--rcp-fs) * 2); line-height: 1.1; font-variant-numeric: tabular-nums; }
        .rcp-stat span { font-size: calc(var(--rcp-fs) * 0.87); opacity: 0.72; letter-spacing: 0.03em; }
        .rcp table { border-collapse: collapse; width: 100%; font-size: var(--rcp-fs); font-variant-numeric: tabular-nums; }
        .rcp th, .rcp td { text-align: right; padding: 5px 10px; border-bottom: 1px solid rgba(255,255,255,0.09); }
        .rcp th { font-size: calc(var(--rcp-fs) * 0.93); opacity: 0.8; }
        .rcp th:first-child, .rcp td:first-child, .rcp th:nth-child(2), .rcp td:nth-child(2) { text-align: left; }
        .rcp-shape { display: inline-grid; gap: 1px; vertical-align: middle; }
        .rcp-cell { width: calc(var(--rcp-fs) * 1.2); height: calc(var(--rcp-fs) * 1.2); font-size: calc(var(--rcp-fs) * 0.8); line-height: calc(var(--rcp-fs) * 1.2); text-align: center; border-radius: 2px; }
        .rcp-cell.is-filled { background: rgba(255,255,255,0.22); }
        .rcp-band-common { opacity: 0.68; }
        .rcp-band-rare { font-weight: 700; }
        .rcp-filters { display: flex; gap: 9px; flex-wrap: wrap; margin-bottom: 12px; font-size: var(--rcp-fs); align-items: center; }
        .rcp-filters button { font: inherit; font-size: var(--rcp-fs); padding: 5px 12px; border-radius: 4px; cursor: pointer; }
        .rcp-filters button[aria-pressed=true] { outline: 2px solid currentColor; }
        .rcp-filters select { font: inherit; font-size: var(--rcp-fs); padding: 5px 8px; }
        .rcp-draft-grid { display: grid; gap: 3px; margin: 10px 0; }
        .rcp-draft-grid button { width: calc(var(--rcp-fs) * 2.67); height: calc(var(--rcp-fs) * 2.67); font: inherit; font-size: calc(var(--rcp-fs) * 1.2); cursor: pointer; border-radius: 3px; }
        .rcp-note { font-size: calc(var(--rcp-fs) * 0.9); opacity: 0.68; margin: 8px 0 0; line-height: 1.5; }
        .rcp-model select { width: 100%; font: inherit; font-size: calc(var(--rcp-fs) * 1.07); padding: 7px 8px; }
        .rcp-model-note { font-size: calc(var(--rcp-fs) * 0.9); opacity: 0.78; margin: 10px 0 0; line-height: 1.55; }
        .rcp-custom { display: inline-block; margin-top: 10px; font-size: calc(var(--rcp-fs) * 0.87); padding: 3px 10px; border-radius: 10px; border: 1px solid currentColor; }
        .rcp-group { border: 1px solid rgba(255,255,255,0.14); border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
        .rcp-group-head { display: flex; align-items: baseline; gap: 14px; padding: 9px 14px; background: rgba(255,255,255,0.05); font-size: var(--rcp-fs); }
        .rcp-group-name { font-weight: 700; font-size: calc(var(--rcp-fs) * 1.13); white-space: pre; font-family: ui-monospace, monospace; }
        .rcp-group-count { font-variant-numeric: tabular-nums; }
        .rcp-group-bands { margin-left: auto; opacity: 0.75; font-variant-numeric: tabular-nums; }
        /* No inner scroller. The page scrolls now, and a scroll box inside a scrolling page means
           two bars competing for the same wheel gesture. Row count per group is what bounds this. */
        .rcp-group-body { overflow: visible; }
        .rcp-formula { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.14); }
        .rcp-formula-line { margin: 4px 0; }
        .rcp-formula-line code { font-family: ui-monospace, monospace; font-size: calc(var(--rcp-fs) * 0.88); line-height: 1.5; }
        .rcp-formula-line.is-off { opacity: 0.38; }
        .rcp-formula sup { font-size: 0.75em; }
        .rcp-term { border-top: 1px solid rgba(255,255,255,0.12); padding: 10px 0 4px; }
        .rcp-term:first-of-type { border-top: 0; padding-top: 0; }
        .rcp-term-head { font-size: calc(var(--rcp-fs) * 0.87); letter-spacing: 0.05em; text-transform: uppercase; opacity: 0.62; }
        .rcp-turns { margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.12); }
        .rcp-term-formula { display: block; white-space: pre-line; font-family: ui-monospace, monospace; font-size: calc(var(--rcp-fs) * 0.88); margin: 4px 0 6px; line-height: 1.45; }
        .rcp-active-model { display: flex; align-items: baseline; gap: 10px; margin-bottom: 12px; }
        .rcp-active-model span { font-size: calc(var(--rcp-fs) * 0.87); opacity: 0.62; letter-spacing: 0.05em; text-transform: uppercase; }
        .rcp-active-model b { font-size: calc(var(--rcp-fs) * 1.2); }
        .rcp-active-model em { font-size: calc(var(--rcp-fs) * 0.87); font-style: normal; opacity: 0.8; padding: 2px 9px; border-radius: 10px; border: 1px solid currentColor; }
        .rcp-contract { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.14); }
        .rcp-contract-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 5px 0; font-size: calc(var(--rcp-fs) * 0.93); }
        .rcp-contract-row span { opacity: 0.72; }
        .rcp-contract-row b { text-align: right; }
      `}</style>

      <div>
        <div className="rcp-panel rcp-model">
          <h3>Model</h3>
          <select value={modelId} onChange={(event) => applyModel(event.target.value)}>
            {POOL_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
          </select>
          <p className="rcp-model-note">{activeModel?.note}</p>
          {isCustom ? <span className="rcp-custom">edited — no longer {activeModel?.label}</span> : null}
        </div>

        <div className="rcp-panel">
          <h3>Piece material</h3>
          {POOL_PIECES.map((piece) => (
            <NumberRow key={piece} label={piece} value={knobs.pieceValue[piece]} onChange={(next) => setPieceValue(piece, next)} step={0.5} min={0} />
          ))}
        </div>

        <div className="rcp-panel">
          <h3>Generation</h3>
          <NumberRow label="Grid cols" value={knobs.cols} onChange={(v) => set('cols', Math.max(1, Math.min(6, v)))} min={1} max={6} />
          <NumberRow label="Grid rows" value={knobs.rows} onChange={(v) => set('rows', Math.max(1, Math.min(4, v)))} min={1} max={4} />
          <NumberRow label="Max cells" value={knobs.maxCells} onChange={(v) => set('maxCells', Math.max(1, Math.min(6, v)))} min={1} max={6} hint="Cap the footprint size. Set to 2 for the small-card-only catalog." />
          <NumberRow label="Max material" value={knobs.maxValue} onChange={(v) => set('maxValue', v)} min={1} />
          <label className="rcp-check">
            <input type="checkbox" checked={knobs.collapseRotation} onChange={(e) => set('collapseRotation', e.target.checked)} />
            <span>Rotation collapse</span>
          </label>
          <label className="rcp-check">
            <input type="checkbox" checked={knobs.oneOrientationPerShape} onChange={(e) => set('oneOrientationPerShape', e.target.checked)} />
            <span>One orientation per shape</span>
          </label>
          <label className="rcp-select-row">
            <span>Over-cap named cards</span>
            <select
              value={knobs.overCapNamedCards}
              onChange={(e) => set('overCapNamedCards', e.target.value as PoolKnobs['overCapNamedCards'])}
            >
              <option value="none">none — generator only</option>
              <option value="queen-pawn">Queen+Pawn</option>
              <option value="live-catalog">the live catalog’s two</option>
            </select>
          </label>
          <p className="rcp-note">
            The live catalog injects two ten-material pairs past the cap by hand: `pq-front` and
            `rr-vertical`. Exempting the Queen+Pawn alone lands one card short of the game, and the
            card it drops is the Rook pair.
          </p>

          <div className="rcp-contract">
            <div className="rcp-contract-row">
              <span>Player rotates at placement</span>
              <b>{rotation.playerRotatesAtPlacement ? 'yes' : 'no'}</b>
            </div>
            <div className="rcp-contract-row">
              <span>Front/back is</span>
              <b>{rotation.frontBackIs}</b>
            </div>
            <div className="rcp-contract-row">
              <span>Orientations</span>
              <b>{rotation.orientationsPerShape}</b>
            </div>
            <p className="rcp-note">{rotation.summary}</p>
          </div>
        </div>

        <div className="rcp-panel">
          <h3>Price formula</h3>
          {knobs.terms.length === 0 ? (
            <p className="rcp-note">This model prices a card at its raw material and nothing else.</p>
          ) : null}
          {knobs.terms.map((term, index) => (
            <div className="rcp-term" key={`${term.kind}-${index}`}>
              <div className="rcp-term-head">{poolTermLabel(term)}</div>
              <code className="rcp-term-formula">{poolTermFormula(term)}</code>
              {term.kind === 'density' ? (
                <>
                  <NumberRow label="power" value={term.power} onChange={(v) => setTerm(index, { ...term, power: v })} step={0.1} />
                  <NumberRow label="scale" value={term.scale} onChange={(v) => setTerm(index, { ...term, scale: v })} step={1} min={1} />
                </>
              ) : null}
              {term.kind === 'bishopPair' ? (
                <NumberRow label="bonus" value={term.bonus} onChange={(v) => setTerm(index, { ...term, bonus: v })} step={0.05} />
              ) : null}
              {term.kind === 'defences' ? (
                <>
                  <NumberRow label="bonus" value={term.bonus} onChange={(v) => setTerm(index, { ...term, bonus: v })} step={0.05} />
                  <label className="rcp-check">
                    <input
                      type="checkbox"
                      checked={term.countPawnSupport}
                      onChange={(e) => setTerm(index, { ...term, countPawnSupport: e.target.checked })}
                    />
                    <span>Count pawn shelter</span>
                  </label>
                </>
              ) : null}
              {term.kind === 'blockedPawn' ? (
                <NumberRow label="penalty" value={term.penalty} onChange={(v) => setTerm(index, { ...term, penalty: v })} step={0.05} />
              ) : null}
              {term.kind === 'round' ? (
                <NumberRow label="to" value={term.to} onChange={(v) => setTerm(index, { ...term, to: Math.max(0, v) })} step={1} min={0} />
              ) : null}
            </div>
          ))}
          <div className="rcp-formula-line rcp-turns">
            <code>
              {knobs.collapseRotation
                ? 'evaluated at all four quarter turns — the best result is the price'
                : 'evaluated at the card’s bought facing only'}
            </code>
          </div>
          <p className="rcp-note">
            {knobs.collapseRotation
              ? 'The whole chain is run once per turn and the best outcome wins, because a card is placed in ONE orientation — it cannot collect one turn’s shelter and another turn’s freedom. Price stands in for value, so the best outcome is the one the player will take.'
              : 'Facing is bought, so there is one seating to read and nothing to choose between.'}
          </p>
          <p className="rcp-note">
            These are the terms this model declares. A model that does not name a term does not carry it
            at all — comparing two models compares two formulas, not one formula with zeros in it.
          </p>
        </div>

        <div className="rcp-panel">
          <h3>Rarity formula</h3>
          <label className="rcp-select-row">
            <span>Tier decided by</span>
            <select value={knobs.bandRule} onChange={(e) => set('bandRule', e.target.value as PoolKnobs['bandRule'])}>
              <option value="price">price — two cuts</option>
              <option value="shipped">the shipped rule</option>
            </select>
          </label>
          {knobs.bandRule === 'shipped' ? (
            <div className="rcp-term">
              <div className="rcp-term-head">The rule the game is running</div>
              <code className="rcp-term-formula">
                {`material  P 1  N 3  B 3  R 5  Q 9

common    material <= 4
uncommon  material 5-6
rare      material >= 7

then  Z S T J L footprint   -> down one tier
then  card carries a Bishop -> up one tier`}
              </code>
              <p className="rcp-note">
                Price is not read at all. This is `runCardRarity` itself, asked the same question the
                catalog asks it, so a tier here is the tier the card has in a Run.
              </p>
            </div>
          ) : (
            <div className="rcp-term">
              <div className="rcp-term-head">Bands on price</div>
              <code className="rcp-term-formula">
                {`common    cost <= ${knobs.commonMaxCost}
uncommon  cost <= ${knobs.uncommonMaxCost}
rare      everything above`}
              </code>
              <NumberRow label="common ≤" value={knobs.commonMaxCost} onChange={(v) => set('commonMaxCost', v)} step={5} />
              <NumberRow label="uncommon ≤" value={knobs.uncommonMaxCost} onChange={(v) => set('uncommonMaxCost', v)} step={5} />
            </div>
          )}
          <table>
            <tbody>
              {BANDS.map((band) => (
                <tr key={band}>
                  <td>{band}</td>
                  <td>{summary.byBand[band]} cards</td>
                  <td>{POOL_PILE_SLOTS[band]} slots</td>
                  <td>{summary.byBand[band] === 0 ? '—' : `${(summary.perPileShare[band] * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="rcp-note">
            {knobs.bandRule === 'shipped'
              ? 'The shipped rule reads material and shape and never reads price, so it separates cards that cost the same — the Bishop step is what puts the Bishop pair in Rare while the Knight pair stays Uncommon at identical material. What it cannot do is notice that a shape rule has deleted every card the footprint demotion was feeding into Common.'
              : 'Rarity here is derived entirely from price — two cuts, nothing else. That is one proposal rather than a fact: a cut cannot separate cards that price the same, which is why rung 90 holds RB and RN alongside the triple-minor cards.'}
          </p>
        </div>
      </div>

      <div>
        <div className="rcp-active-model">
          <span>Model</span>
          <b>{activeModel?.label ?? 'Custom'}</b>
          {isCustom ? <em>edited — no longer {activeModel?.label}</em> : null}
        </div>

        <div className="rcp-summary">
          <div className="rcp-stat"><b>{summary.total}</b><span>CARDS IN POOL</span></div>
          {BANDS.map((band) => (
            <div className="rcp-stat" key={band}>
              <b>{summary.byBand[band]}</b>
              <span>{band.toUpperCase()} · {POOL_PILE_SLOTS[band]} SLOTS</span>
            </div>
          ))}
          <div className="rcp-stat"><b>{summary.artOwed}</b><span>ILLUSTRATIONS OWED</span></div>
        </div>

        <div className="rcp-panel">
          <h3>Tier by volume</h3>
          <table>
            <thead>
              <tr><th>band</th><th>1</th><th>2</th><th>3</th><th>4</th><th>total</th><th>share of a pile slot</th></tr>
            </thead>
            <tbody>
              {BANDS.map((band) => (
                <tr key={band}>
                  <td>{band}</td>
                  {[1, 2, 3, 4].map((v) => <td key={v}>{summary.byBandVolume[band][v]}</td>)}
                  <td>{summary.byBand[band]}</td>
                  <td>{summary.byBand[band] === 0 ? '—' : `${(summary.perPileShare[band] * 100).toFixed(1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="rcp-note">
            Share of a pile slot is how often ONE card of that band reaches a 20-card pile at the shipped
            16/3/1 quota. Under 1% means the player never learns to recognise it. Illustrations owed counts
            uncommon + rare only, on the rule that commons are templated.
          </p>
        </div>

        <div className="rcp-panel">
          <h3>Ad-hoc card</h3>
          <div className="rcp-draft-grid" style={{ gridTemplateColumns: `repeat(${knobs.cols}, 30px)` }}>
            {Array.from({ length: knobs.cols * knobs.rows }, (_, i) => {
              const x = i % knobs.cols;
              const y = Math.floor(i / knobs.cols);
              const piece = draft.get(`${x},${y}`);
              return (
                <button key={i} type="button" onClick={() => cycleCell(x, y)} title={`(${x},${y}) — click to cycle`}>
                  {piece ?? '·'}
                </button>
              );
            })}
          </div>
          {draftStats ? (
            <table>
              <tbody>
                <tr><td>material</td><td>{draftStats.value}</td><td>volume</td><td>{draftStats.volume}</td></tr>
                <tr><td>density</td><td>{draftStats.density.toFixed(2)}</td><td>cost</td><td><b>{draftStats.cost}</b></td></tr>
                <tr><td>band</td><td>{draftStats.band}</td><td>defences</td><td>{draftStats.defences}</td></tr>
                <tr><td>blocked pawns</td><td>{draftStats.blockedPawns}</td><td>bishop pair</td><td>{draftStats.hasBishopPair ? 'yes' : 'no'}</td></tr>
                <tr><td>in pool</td><td colSpan={3}>{draftInPool ? 'yes' : 'no — outside the generator'}</td></tr>
              </tbody>
            </table>
          ) : <p className="rcp-note">Click cells to seat pieces. Each click cycles P → N → B → R → Q → empty.</p>}
          {draftSteps ? (
            <div className="rcp-formula rcp-worked">
              <div className="rcp-formula-line"><code>material = {draftSteps.value}</code></div>
              {draftSteps.steps.map((step, index) => (
                <div className={step.worked ? 'rcp-formula-line' : 'rcp-formula-line is-off'} key={index}>
                  <code>{step.worked ?? `${step.formula} — does not apply`}</code>
                  {step.worked && step.term.kind !== 'round' ? <code>{` = ${step.after.toFixed(1)}`}</code> : null}
                </div>
              ))}
            </div>
          ) : null}
          <p className="rcp-note">Row 0 is the edge toward the enemy, so a piece in the top row is the front rank.</p>
        </div>

        <div className="rcp-filters">
          <label>group by <select value={grouping} onChange={(e) => setGrouping(e.target.value as PoolGrouping)}>
            {POOL_GROUPINGS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select></label>
          <span style={{ marginLeft: 6 }}>band</span>
          {(['all', ...BANDS] as const).map((band) => (
            <button key={band} type="button" aria-pressed={bandFilter === band} onClick={() => setBandFilter(band as PoolBand | 'all')}>{band}</button>
          ))}
          <span style={{ marginLeft: 6 }}>vol</span>
          {(['all', 1, 2, 3, 4] as const).map((v) => (
            <button key={String(v)} type="button" aria-pressed={volumeFilter === v} onClick={() => setVolumeFilter(v as number | 'all')}>{v}</button>
          ))}
          <span style={{ marginLeft: 6 }}>has</span>
          {(['all', ...POOL_PIECES] as const).map((p) => (
            <button key={p} type="button" aria-pressed={pieceFilter === p} onClick={() => setPieceFilter(p as PoolPiece | 'all')}>{p}</button>
          ))}
          <span style={{ marginLeft: 'auto', opacity: 0.7 }}>{shown.length} of {summary.total} · {groups.length} group{groups.length === 1 ? '' : 's'}</span>
        </div>

        {groups.map((group) => {
          const bandCounts = BANDS.map((band) => `${band[0]}${group.cards.filter((card) => card.band === band).length}`).join(' · ');
          const costs = group.cards.map((card) => card.cost);
          const range = costs.length === 0 ? '—' : `${Math.min(...costs)}–${Math.max(...costs)} gold`;
          return (
            <div className="rcp-group" key={group.key}>
              <div className="rcp-group-head">
                <span className="rcp-group-name">{group.label}</span>
                <span className="rcp-group-count">{group.cards.length} card{group.cards.length === 1 ? '' : 's'}</span>
                <span style={{ opacity: 0.72 }}>{range}</span>
                <span className="rcp-group-bands">{bandCounts}</span>
              </div>
              <div className="rcp-group-body">
                <CardTable cards={group.cards} />
                {group.cards.length > MAX_ROWS_PER_GROUP ? (
                  <p className="rcp-note" style={{ padding: '4px 10px 8px' }}>
                    Showing {MAX_ROWS_PER_GROUP} of {group.cards.length}. The counts above and every summary
                    stat cover all of them — nothing is dropped from the numbers, only from the rows.
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}

        <p className="rcp-note">
          {knobs.overCapNamedCards === 'live-catalog'
            ? 'Over-cap named cards are set to the live catalog’s two, so this pool holds every card the game can deal and none it cannot.'
            : 'This pool is short of the live catalog by the over-cap named cards it is not admitting: `rr-vertical`, the Rook pair at ten material, and — set to none — `pq-front` with it. Both reach the game only through the named-card injection.'}
        </p>
      </div>
    </div>
  );
}
