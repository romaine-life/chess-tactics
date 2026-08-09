import { useCallback, useMemo, useState, type ReactElement } from 'react';
import {
  DEFAULT_POOL_KNOBS,
  POOL_GROUPINGS,
  POOL_MODELS,
  POOL_PIECES,
  POOL_PILE_SLOTS,
  buildPool,
  groupPool,
  priceCard,
  sameKnobs,
  summarizePool,
  type PoolBand,
  type PoolCard,
  type PoolCell,
  type PoolGrouping,
  type PoolKnobs,
  type PoolPiece,
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
// Defaults reproduce the shipped generator, with one known gap: `rr-vertical` is a named card
// injected past the material cap, so this lands on 268 where the live catalog carries 269.

const BANDS: readonly PoolBand[] = ['common', 'uncommon', 'rare'];
const MAX_ROWS_PER_GROUP = 60;

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
        <tr><th>shape</th><th>pieces</th><th>mat</th><th>vol</th><th>dens</th><th>cost</th><th>band</th><th>supp</th><th>BB</th></tr>
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
            <td>{card.supportPairs || ''}</td>
            <td>{card.hasBishopPair ? '✦' : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RunCardPoolCatalog(): ReactElement {
  const [modelId, setModelId] = useState<string>('density-cost');
  const [knobs, setKnobs] = useState<PoolKnobs>(DEFAULT_POOL_KNOBS);
  const [bandFilter, setBandFilter] = useState<PoolBand | 'all'>('all');
  const [volumeFilter, setVolumeFilter] = useState<number | 'all'>('all');
  const [pieceFilter, setPieceFilter] = useState<PoolPiece | 'all'>('all');
  const [grouping, setGrouping] = useState<PoolGrouping>('band');
  const [draft, setDraft] = useState<Map<string, PoolPiece>>(new Map([['0,0', 'P']]));

  const set = useCallback(<K extends keyof PoolKnobs>(field: K, value: PoolKnobs[K]) => {
    setKnobs((prev) => ({ ...prev, [field]: value }));
  }, []);
  const setPieceValue = useCallback((piece: PoolPiece, value: number) => {
    setKnobs((prev) => ({ ...prev, pieceValue: { ...prev.pieceValue, [piece]: value } }));
  }, []);
  const applyModel = useCallback((id: string) => {
    const model = POOL_MODELS.find((candidate) => candidate.id === id);
    if (!model) return;
    setModelId(id);
    setKnobs(model.knobs);
  }, []);

  const activeModel = POOL_MODELS.find((model) => model.id === modelId) ?? null;
  const isCustom = activeModel !== null && !sameKnobs(activeModel.knobs, knobs);

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
    <div className="rcp">
      <style>{`
        .rcp { display: grid; grid-template-columns: minmax(300px, 360px) 1fr; gap: 22px; align-items: start; font-size: 15px; }
        .rcp h3 { margin: 0 0 10px; font-size: 15px; letter-spacing: 0.04em; text-transform: uppercase; opacity: 0.8; }
        .rcp-panel { border: 1px solid rgba(255,255,255,0.16); border-radius: 6px; padding: 14px 16px; margin-bottom: 16px; }
        .rcp-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 7px 0; font-size: 15px; }
        .rcp-row-label { opacity: 0.85; }
        .rcp-row input[type=number] { width: 92px; padding: 4px 8px; font: inherit; font-size: 15px; }
        .rcp-check { display: flex; align-items: center; gap: 9px; margin: 8px 0; font-size: 15px; }
        .rcp-check input { width: 16px; height: 16px; }
        .rcp-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 16px; }
        .rcp-stat { border: 1px solid rgba(255,255,255,0.16); border-radius: 6px; padding: 12px 14px; }
        .rcp-stat b { display: block; font-size: 30px; line-height: 1.1; font-variant-numeric: tabular-nums; }
        .rcp-stat span { font-size: 13px; opacity: 0.72; letter-spacing: 0.03em; }
        .rcp table { border-collapse: collapse; width: 100%; font-size: 15px; font-variant-numeric: tabular-nums; }
        .rcp th, .rcp td { text-align: right; padding: 5px 10px; border-bottom: 1px solid rgba(255,255,255,0.09); }
        .rcp th { font-size: 14px; opacity: 0.8; }
        .rcp th:first-child, .rcp td:first-child, .rcp th:nth-child(2), .rcp td:nth-child(2) { text-align: left; }
        .rcp-shape { display: inline-grid; gap: 1px; vertical-align: middle; }
        .rcp-cell { width: 18px; height: 18px; font-size: 12px; line-height: 18px; text-align: center; border-radius: 2px; }
        .rcp-cell.is-filled { background: rgba(255,255,255,0.22); }
        .rcp-band-common { opacity: 0.68; }
        .rcp-band-rare { font-weight: 700; }
        .rcp-filters { display: flex; gap: 9px; flex-wrap: wrap; margin-bottom: 12px; font-size: 15px; align-items: center; }
        .rcp-filters button { font: inherit; font-size: 15px; padding: 5px 12px; border-radius: 4px; cursor: pointer; }
        .rcp-filters button[aria-pressed=true] { outline: 2px solid currentColor; }
        .rcp-filters select { font: inherit; font-size: 15px; padding: 5px 8px; }
        .rcp-draft-grid { display: grid; gap: 3px; margin: 10px 0; }
        .rcp-draft-grid button { width: 40px; height: 40px; font: inherit; font-size: 18px; cursor: pointer; border-radius: 3px; }
        .rcp-note { font-size: 13.5px; opacity: 0.68; margin: 8px 0 0; line-height: 1.5; }
        .rcp-model select { width: 100%; font: inherit; font-size: 16px; padding: 7px 8px; }
        .rcp-model-note { font-size: 13.5px; opacity: 0.78; margin: 10px 0 0; line-height: 1.55; }
        .rcp-custom { display: inline-block; margin-top: 10px; font-size: 13px; padding: 3px 10px; border-radius: 10px; border: 1px solid currentColor; }
        .rcp-group { border: 1px solid rgba(255,255,255,0.14); border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
        .rcp-group-head { display: flex; align-items: baseline; gap: 14px; padding: 9px 14px; background: rgba(255,255,255,0.05); font-size: 15px; }
        .rcp-group-name { font-weight: 700; font-size: 17px; white-space: pre; font-family: ui-monospace, monospace; }
        .rcp-group-count { font-variant-numeric: tabular-nums; }
        .rcp-group-bands { margin-left: auto; opacity: 0.75; font-variant-numeric: tabular-nums; }
        .rcp-group-body { max-height: 420px; overflow: auto; }
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
          <label className="rcp-check">
            <input type="checkbox" checked={knobs.allowQueenPawnOverCap} onChange={(e) => set('allowQueenPawnOverCap', e.target.checked)} />
            <span>Queen+Pawn exempt from cap</span>
          </label>
          <p className="rcp-note">
            Collapse off alone makes every rotation its own card too. Add one-orientation-per-shape for the
            vertical-only rule: front/back becomes a purchase without a horizontal twin for every card.
          </p>
        </div>

        <div className="rcp-panel">
          <h3>Pricing</h3>
          <NumberRow label="Density power" value={knobs.densityPower} onChange={(v) => set('densityPower', v)} step={0.1} hint="cost = value x (density/3)^power x scale. 0 is flat material pricing; 0.5 is the sqrt curve." />
          <NumberRow label="Scale" value={knobs.costScale} onChange={(v) => set('costScale', v)} step={1} min={1} />
          <NumberRow label="Round to" value={knobs.roundTo} onChange={(v) => set('roundTo', Math.max(0, v))} step={1} min={0} />
          <NumberRow label="Bishop pair +" value={knobs.bishopPairBonus} onChange={(v) => set('bishopPairBonus', v)} step={0.05} hint="Bonus for two Bishops on opposite colours." />
          <NumberRow label="Support pair +" value={knobs.supportBonus} onChange={(v) => set('supportBonus', v)} step={0.05} hint="Per pair where one piece defends another's square." />
          <label className="rcp-check">
            <input type="checkbox" checked={knobs.countPawnSupport} onChange={(e) => set('countPawnSupport', e.target.checked)} />
            <span>Count pawn support</span>
          </label>
          <p className="rcp-note">Pawn support is only invariant with rotation collapse OFF — a pawn's covered squares turn with the card.</p>
        </div>

        <div className="rcp-panel">
          <h3>Bands</h3>
          <NumberRow label="Common ≤" value={knobs.commonMaxCost} onChange={(v) => set('commonMaxCost', v)} step={5} />
          <NumberRow label="Uncommon ≤" value={knobs.uncommonMaxCost} onChange={(v) => set('uncommonMaxCost', v)} step={5} />
        </div>
      </div>

      <div>
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
                <tr><td>band</td><td>{draftStats.band}</td><td>support pairs</td><td>{draftStats.supportPairs}</td></tr>
                <tr><td>bishop pair</td><td>{draftStats.hasBishopPair ? 'yes' : 'no'}</td><td>in pool</td><td>{draftInPool ? 'yes' : 'no — outside the generator'}</td></tr>
              </tbody>
            </table>
          ) : <p className="rcp-note">Click cells to seat pieces. Each click cycles P → N → B → R → Q → empty.</p>}
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
          At shipped generation rules this pool holds 268 where the live catalog holds 269: `rr-vertical` is a
          named card injected past the material cap, and this generator exempts the Queen+Pawn pair alone.
        </p>
      </div>
    </div>
  );
}
