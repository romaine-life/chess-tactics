import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { useAdminLiveMediaCatalog } from './studio/useAdminLiveMediaCatalog';
import { EnchiridionSectionRail } from './Enchiridion';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { enchiridionSectionHref } from './enchiridionRoute';

/**
 * Owner review for the Enchiridion rail's TERRAIN mark, as a Studio CATEGORY.
 *
 * The installed mark is a plain grass-topped cube, and it is also the short one: measured on the
 * 64px canvas its ink is 40x35 where Units and Lipsana are 40 tall, so it sits on more air than
 * its neighbours and reads smaller than them. Every candidate here is therefore packed to the
 * rail's OWN measured box — ink exactly 40px tall, centred, 12px of margin above and below — so
 * what is being judged is the drawing, not a size difference (ADR-0026, ADR-0560).
 *
 * A mark can only be judged against the five it stands beside, so the first two columns are the
 * REAL `EnchiridionSectionRail` — installed, and the selection — not a lookalike column. The four
 * concept columns beside them hold their sixteen candidates each, in their own rails, at the pitch
 * the Enchiridion stacks them at. Nothing is installed until the owner installs one.
 */
export const TERRAIN_MARK_BATCH_ID = 'terrain-mark-2026-08-11-pixellab';
export const TERRAIN_MARK_SLOT = 'ui/kit/icons/tileset-studio.png';

/** The concepts in the batch, in the order they are offered. `key` is the `metadata.concept`
 *  each candidate carries, so a group and its candidates cannot drift apart. */
export const TERRAIN_MARK_CONCEPTS: readonly { key: string; label: string; note: string }[] = Object.freeze([
  {
    key: 'two-tier-ground',
    label: 'Two-tier ground',
    note: 'Grass over exposed rock and soil — the installed cube, given strata.',
  },
  {
    key: 'boulder-on-turf',
    label: 'Boulder on turf',
    note: 'One ground tile with a mossy boulder and wild grass standing on it.',
  },
  {
    key: 'crag-and-pine',
    label: 'Crag and pine',
    note: 'A rocky crag with a grass crown and a lone pine — upright, like its neighbours.',
  },
  {
    key: 'headland-and-water',
    label: 'Headland and water',
    note: 'Turf and cliff with water at the foot. Some render the water as a flat field.',
  },
]);

function metadataString(version: AdminLiveMediaVersion, key: string): string {
  const value = version.metadata[key];
  return typeof value === 'string' ? value : '';
}

function metadataIndex(version: AdminLiveMediaVersion, key: string): number {
  const value = Number(version.metadata[key]);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

function batchId(version: AdminLiveMediaVersion): string {
  const batch = version.provenance.liveMediaBatch;
  return batch && typeof batch === 'object' && !Array.isArray(batch)
    && typeof (batch as Record<string, unknown>).batchId === 'string'
    ? String((batch as Record<string, unknown>).batchId)
    : '';
}

/** The code the owner names a candidate by — `C07`, matching its group and its row. */
export function terrainMarkCode(version: AdminLiveMediaVersion): string {
  const concept = TERRAIN_MARK_CONCEPTS.findIndex((entry) => entry.key === metadataString(version, 'concept'));
  const letter = concept < 0 ? '?' : String.fromCharCode(65 + concept);
  const index = metadataIndex(version, 'conceptIndex');
  return `${letter}${index === Number.MAX_SAFE_INTEGER ? '??' : String(index).padStart(2, '0')}`;
}

/** Every candidate in this batch, grouped by concept in the offered order. */
export function terrainMarkCandidates(catalog: AdminLiveMediaCatalog): Map<string, AdminLiveMediaVersion[]> {
  const grouped = new Map<string, AdminLiveMediaVersion[]>(
    TERRAIN_MARK_CONCEPTS.map((concept) => [concept.key, [] as AdminLiveMediaVersion[]]),
  );
  for (const version of catalog.versions) {
    if (!version.media || version.status !== 'candidate' || version.slot !== TERRAIN_MARK_SLOT) continue;
    if (batchId(version) !== TERRAIN_MARK_BATCH_ID) continue;
    grouped.get(metadataString(version, 'concept'))?.push(version);
  }
  for (const entries of grouped.values()) {
    entries.sort((left, right) => metadataIndex(left, 'conceptIndex') - metadataIndex(right, 'conceptIndex'));
  }
  return grouped;
}

/** The real Enchiridion rail, with Terrain optionally wearing a candidate instead. Drawn TWICE —
 *  installed, and the selection — as the first two columns. The neighbours are what a mark is
 *  judged against, and they are the same five for every candidate, so a copy per candidate would
 *  say nothing a column can be read for. */
function RailPreview({ mark }: { mark?: string }): ReactElement {
  return (
    <EnchiridionSectionRail
      section="terrain"
      sectionHref={enchiridionSectionHref}
      markOverride={mark ? { terrain: mark } : undefined}
    />
  );
}

export interface TerrainMarkState {
  catalog: AdminLiveMediaCatalog | null;
  selectedId: string;
  select: (id: string) => void;
  error: string;
  refresh: () => void;
}

export function useTerrainMarks(): TerrainMarkState {
  const { catalog, error, refresh } = useAdminLiveMediaCatalog();
  const [selectedId, setSelectedId] = useState('');
  const select = useCallback((id: string) => setSelectedId(id), []);
  return { catalog, selectedId, select, error, refresh };
}

export function TerrainMarkCatalog({ state }: { state: TerrainMarkState }): ReactElement {
  const { catalog, selectedId, select, error } = state;
  const grouped = useMemo(
    () => catalog ? terrainMarkCandidates(catalog) : new Map<string, AdminLiveMediaVersion[]>(),
    [catalog],
  );
  const all = useMemo(() => [...grouped.values()].flat(), [grouped]);
  const selected = all.find((version) => version.id === selectedId) ?? null;
  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  // ONE row of columns: the two whole rails first, then a column per concept. Not a rail band
  // stacked above the candidates — a six-seat rail is ~600px tall, so on any window shorter than
  // that it filled the screen and every candidate was below the fold, which is exactly what
  // "where are my candidates" looked like. Side by side, the comparison keeps its full size, the
  // columns start at the top of the same viewport, and one horizontal scroll reaches the whole
  // batch. Every column has the same shape — heading, note, rail — so nothing is clipped by a
  // neighbour that is built differently.
  return (
    <div className="terrain-mark-columns" data-testid="terrain-mark-catalog">
      <section className="terrain-mark-column terrain-mark-column-rail">
        <h3>Installed</h3>
        <p className="tileset-catalog-note">What the Enchiridion paints today.</p>
        <RailPreview />
      </section>
      <section className="terrain-mark-column terrain-mark-column-rail">
        <h3>{selected ? terrainMarkCode(selected) : 'Selected'}</h3>
        <p className="tileset-catalog-note">
          {selected
            ? 'The candidate in the rail, beside the five marks it would stand with.'
            : 'Pick a candidate and it stands here, beside the five marks it would join.'}
        </p>
        {selected?.media ? <RailPreview mark={selected.media.url} /> : null}
      </section>
      {TERRAIN_MARK_CONCEPTS.map((concept) => {
          const entries = grouped.get(concept.key) ?? [];
          return (
            <section
              className="terrain-mark-column"
              data-testid={`terrain-mark-concept-${concept.key}`}
              key={concept.key}
            >
              <h3>{concept.label}</h3>
              <p className="tileset-catalog-note">{concept.note}</p>
              {entries.length ? (
                <ApparatusRailColumn opens="no-panel" aria-label={`${concept.label} candidates`}>
                  {entries.map((version, index) => (
                    <ApparatusRailTab
                      key={version.id}
                      label="Terrain"
                      className="terrain-mark-tab"
                      index={index}
                      active={selectedId === version.id}
                      iconSrc={version.media!.url}
                      ariaLabel={`Terrain mark ${terrainMarkCode(version)}`}
                      title={terrainMarkCode(version)}
                      onSelect={() => select(version.id)}
                      trailing={<span className="terrain-mark-code" aria-hidden="true">{terrainMarkCode(version)}</span>}
                    />
                  ))}
                </ApparatusRailColumn>
              ) : <p>No candidates uploaded.</p>}
            </section>
          );
        })}
      {!all.length ? <p>No candidates are uploaded for this batch.</p> : null}
    </div>
  );
}

export function TerrainMarkControls({ state }: { state: TerrainMarkState }): ReactElement {
  const { catalog, selectedId, refresh } = state;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const grouped = useMemo(
    () => catalog ? terrainMarkCandidates(catalog) : new Map<string, AdminLiveMediaVersion[]>(),
    [catalog],
  );
  const selected = [...grouped.values()].flat().find((version) => version.id === selectedId) ?? null;

  const install = async (): Promise<void> => {
    if (busy || !catalog || !selected?.media) return;
    const code = terrainMarkCode(selected);
    setBusy(true);
    try {
      setStatus('Recording approval for these exact bytes…');
      const reviewed = await reviewLiveMediaVersion({
        id: selected.id,
        expectedRevision: selected.rowRevision,
        notes: `Selected terrain mark ${code} from the live Enchiridion section rail it paints. Slot: ${TERRAIN_MARK_SLOT}.`,
        surfaceUrl: window.location.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          batchId: TERRAIN_MARK_BATCH_ID,
          candidate: code,
          versionId: selected.id,
          contentSha256: selected.media.sha256,
          slot: TERRAIN_MARK_SLOT,
          canonicalScale: 1,
          surfaceKind: 'Enchiridion section rail at the live tab seat',
        },
      });
      setStatus('Installing…');
      const slot = catalog.slots.find((entry) => entry.slot === TERRAIN_MARK_SLOT);
      await acceptLiveMediaVersions([{
        id: reviewed.id,
        expectedRevision: reviewed.rowRevision,
        expectedSlotRevision: slot?.rowRevision ?? 0,
        expectedActiveVersionId: slot?.activeVersionId ?? null,
      }]);
      setStatus(`Installed. The Enchiridion rail wears ${code} now — reload the Enchiridion to see it.`);
      refresh();
    } catch (reason) {
      setStatus(reason instanceof Error ? `Install failed: ${reason.message}` : 'Install failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p className="tileset-catalog-note">
        The installed grass cube is both plainer and SHORTER than the marks it stands beside —
        40×35 of ink where Units and Lipsana are 40 tall. Every candidate is packed to the rail's
        own measured box: ink exactly 40px tall, centred, 12px of margin above and below. Each
        candidate stands in a real rail seat, so the columns are the comparison; picking one puts it
        in the Selected rail, second from the left, beside the five marks it would stand with.
      </p>
      <button
        type="button"
        className="tileset-view-action"
        data-testid="install-terrain-mark"
        disabled={busy || !selected}
        onClick={() => { void install(); }}
      >
        {!selected ? 'Select a candidate' : busy ? 'Installing…' : `Use ${terrainMarkCode(selected)}`}
      </button>
      {status ? <p className="tileset-catalog-note" role="status">{status}</p> : null}
    </>
  );
}
