import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { defaultBackgroundSet } from '../art/backgroundSets';
import { ChromeButton } from './shared/ChromeButton';
import { OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { EnchiridionSectionRail } from './Enchiridion';
import { enchiridionSectionHref } from './enchiridionRoute';
import { useSceneParticipant } from './shell/SceneBoundary';

/**
 * Owner review for the Enchiridion rail's TERRAIN mark.
 *
 * The installed mark is a plain grass-topped cube, and it is also the short one: measured on
 * the 64px canvas its ink is 40x35 where Units and Lipsana are 40 tall, so it sits on more air
 * than its neighbours and reads smaller than them. Every candidate here is therefore packed to
 * the rail's OWN measured box — ink exactly 40px tall, centred, 12px of margin above and below
 * — so what is being judged is the drawing, not a size difference (ADR-0026, ADR-0560).
 *
 * A mark can only be judged against the five it stands beside, so the comparison at the top is
 * the REAL `EnchiridionSectionRail` with one seat swapped, not a lookalike column. The specimen
 * grid below is the same `ApparatusRailColumn`/`ApparatusRailTab` primitive the live rail
 * paints, so a mark in the grid is already in its seat at its final size — no clicking needed
 * to see what it will look like.
 *
 * Nothing is installed until the owner installs one.
 */
export const TERRAIN_MARK_BATCH_ID = 'terrain-mark-2026-08-11-pixellab';
export const TERRAIN_MARK_SLOT = 'ui/kit/icons/tileset-studio.png';

/** The concepts in the batch, in the order they are offered. `key` is the `metadata.concept`
 *  each candidate carries, so a column and its candidates cannot drift apart. */
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

/** The code the owner names a candidate by — `C 07`, matching the column and its row. */
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

/** The real Enchiridion rail, with Terrain optionally wearing a candidate instead. */
function RailPreview({ mark }: { mark?: string }): ReactElement {
  return (
    <EnchiridionSectionRail
      section="terrain"
      sectionHref={enchiridionSectionHref}
      markOverride={mark ? { terrain: mark } : undefined}
    />
  );
}

function InstallControl({
  version,
  catalog,
  onInstalled,
}: {
  version: AdminLiveMediaVersion;
  catalog: AdminLiveMediaCatalog;
  onInstalled: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const code = terrainMarkCode(version);

  const install = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      setStatus('Recording approval for these exact bytes…');
      const reviewed = await reviewLiveMediaVersion({
        id: version.id,
        expectedRevision: version.rowRevision,
        notes: `Selected terrain mark ${code} from the live Enchiridion section rail it paints. Slot: ${TERRAIN_MARK_SLOT}.`,
        surfaceUrl: window.location.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          batchId: TERRAIN_MARK_BATCH_ID,
          candidate: code,
          versionId: version.id,
          contentSha256: version.media!.sha256,
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
      onInstalled();
    } catch (reason) {
      setStatus(reason instanceof Error ? `Install failed: ${reason.message}` : 'Install failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ChromeButton
        unit="inner-text-button"
        disabled={busy}
        data-testid="install-terrain-mark"
        onClick={() => { void install(); }}
      >
        {busy ? 'Installing…' : `Use ${code}`}
      </ChromeButton>
      {status ? <p role="status">{status}</p> : null}
    </>
  );
}

export function TerrainMarkReview(): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    void fetchAdminLiveMediaCatalog()
      .then((next) => { if (active) setCatalog(next); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, [nonce]);
  const sceneError = useMemo(() => error ? new Error(error) : null, [error]);
  useSceneParticipant('studio', sceneError ? 'error' : catalog ? 'painted' : 'loading', sceneError);

  const grouped = useMemo(
    () => catalog ? terrainMarkCandidates(catalog) : new Map<string, AdminLiveMediaVersion[]>(),
    [catalog],
  );
  const all = useMemo(() => [...grouped.values()].flat(), [grouped]);
  const selected = useMemo(
    () => all.find((candidate) => candidate.id === selectedId) ?? all[0] ?? null,
    [all, selectedId],
  );

  return (
    <main
      className="terrain-mark-review-screen menu-icon-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="terrain-mark-review" titled className="terrain-mark-review-panel">
        <OuterChromeHeader title="Enchiridion Terrain Mark" />
        <p>
          The installed grass cube is both plainer and SHORTER than the marks it stands beside —
          40&times;35 of ink where Units and Lipsana are 40 tall. Every candidate below is packed to
          the rail&rsquo;s own measured box: ink exactly 40px tall, centred, 12px of margin above and
          below. Each is already sitting in a real rail seat at its final size, so the grid is the
          comparison — clicking one only moves it into the pair of rails at the top. Nothing is
          installed until you press <strong>Use</strong>.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        {!catalog && !error ? <p role="status">Loading candidates…</p> : null}
        {catalog ? (
          <>
            <div className="menu-icon-review-sets terrain-mark-review-rails">
              <section className="menu-icon-review-set" aria-labelledby="terrain-mark-installed-title">
                <h2 id="terrain-mark-installed-title">Installed</h2>
                <p>What the Enchiridion paints today.</p>
                <RailPreview />
              </section>
              {selected?.media ? (
                <section className="menu-icon-review-set" aria-labelledby="terrain-mark-selected-title">
                  <h2 id="terrain-mark-selected-title">{terrainMarkCode(selected)}</h2>
                  <p>Candidate — not installed.</p>
                  <RailPreview mark={selected.media.url} />
                  <InstallControl version={selected} catalog={catalog} onInstalled={refresh} />
                </section>
              ) : null}
            </div>
            <div className="menu-icon-review-sets terrain-mark-review-specimens">
              {TERRAIN_MARK_CONCEPTS.map((concept) => {
                const entries = grouped.get(concept.key) ?? [];
                return (
                  <section
                    className="menu-icon-review-set"
                    aria-labelledby={`terrain-mark-${concept.key}-title`}
                    data-testid={`terrain-mark-concept-${concept.key}`}
                    key={concept.key}
                  >
                    <h2 id={`terrain-mark-${concept.key}-title`}>{concept.label}</h2>
                    <p>{concept.note}</p>
                    {entries.length ? (
                      <ApparatusRailColumn opens="no-panel" aria-label={`${concept.label} candidates`}>
                        {entries.map((version, index) => (
                          <ApparatusRailTab
                            key={version.id}
                            label="Terrain"
                            className="terrain-mark-review-tab"
                            index={index}
                            active={selected?.id === version.id}
                            iconSrc={version.media!.url}
                            ariaLabel={`Terrain mark ${terrainMarkCode(version)}`}
                            title={terrainMarkCode(version)}
                            onSelect={() => setSelectedId(version.id)}
                            trailing={<span className="terrain-mark-review-code" aria-hidden="true">{terrainMarkCode(version)}</span>}
                          />
                        ))}
                      </ApparatusRailColumn>
                    ) : <p className="menu-icon-review-missing" role="status">No candidates uploaded.</p>}
                  </section>
                );
              })}
            </div>
          </>
        ) : null}
        {catalog && !all.length ? <p>No candidates are uploaded for this batch.</p> : null}
      </OuterChromeBox>
    </main>
  );
}
