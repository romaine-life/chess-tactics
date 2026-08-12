import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  reviewLiveMediaVersion,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { useAdminLiveMediaCatalog } from './studio/useAdminLiveMediaCatalog';
import { fetchAdminDrawableCatalog, saveDrawableAsset } from '../net/drawableCatalogAdmin';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { menuModeIcon } from './menuModeIcon';
import { StudioCatalogCard } from './studio/StudioCatalogCard';

/**
 * Owner review for a whole main-menu mark SET, as a Studio CATEGORY.
 *
 * The unit of decision here is the set, not the icon: these five marks stack in one column
 * where every neighbour is a size and material reference, so a mark can only be judged against
 * the other four it will stand beside. Each treatment is therefore mounted as a complete rail
 * through the SAME `ApparatusRailColumn` / `ApparatusRailTab` the live menu paints — same oak
 * leaf surface, same 40px seat, same 44px draw of the 64px canvas — so what is on screen is
 * what the menu will look like, not a contact sheet standing in for it.
 *
 * Nothing is installed until the owner installs a set, and installing is one act per set:
 * approval of those exact bytes, acceptance into the five slots, and the one drawable re-point
 * the Enchiridion mark needs.
 *
 * This was its own screen at `/studio?menuIconReview=1` until ADR-0587 — an address that
 * borrowed the Studio's path and returned before the Studio rendered, so it had no category
 * rail and no way in but a hand-passed URL.
 */
export const MENU_ICON_BATCH_ID = 'main-menu-icons-2026-08-10-natural';

/** The rail, in the order the menu stacks it — `slug` is the `behavior.value` the
 *  menu-mode drawable routes on, so a mark and its destination cannot drift apart. */
interface Destination {
  slug: string;
  label: string;
  slot: string;
  /** Set when installing must also move the destination's drawable onto `slot`. The
   *  Enchiridion tab draws `ui/kit/icons/design-index.png` today — a shared kit glyph
   *  that is not a member of this family and that other surfaces also draw. */
  repointDrawable?: string;
}

export const MENU_ICON_DESTINATIONS: readonly Destination[] = Object.freeze([
  { slug: 'play', label: 'Play', slot: 'ui/main-menu/icons-carved/solo-skirmish.png' },
  { slug: 'campaign-editor', label: 'Editor', slot: 'ui/main-menu/icons-carved/campaign-editor.png' },
  { slug: 'lobbies', label: 'Lobbies', slot: 'ui/main-menu/icons-carved/lobbies.png' },
  {
    slug: 'enchiridion',
    label: 'Enchiridion',
    slot: 'ui/main-menu/icons-carved/enchiridion.png',
    repointDrawable: 'menu-mode-enchiridion',
  },
  { slug: 'settings', label: 'Settings', slot: 'ui/main-menu/icons-carved/settings.png' },
]);

function metadataString(version: AdminLiveMediaVersion, key: string): string {
  const value = version.metadata[key];
  return typeof value === 'string' ? value : '';
}

function batchId(version: AdminLiveMediaVersion): string {
  const batch = version.provenance.liveMediaBatch;
  return batch && typeof batch === 'object' && !Array.isArray(batch)
    && typeof (batch as Record<string, unknown>).batchId === 'string'
    ? String((batch as Record<string, unknown>).batchId)
    : '';
}

function treatmentIndex(version: AdminLiveMediaVersion): number {
  const value = Number(version.metadata.candidateIndex);
  return Number.isSafeInteger(value) && value > 0 ? value : Number.MAX_SAFE_INTEGER;
}

export interface MenuIconTreatment {
  treatment: string;
  label: string;
  index: number;
  /** Candidate per destination slug. A treatment missing a destination is still shown,
   *  with that seat empty, rather than silently dropped — a five-mark set with four
   *  marks is exactly the kind of thing this category exists to make visible. */
  marks: Map<string, AdminLiveMediaVersion>;
}

/** Every candidate treatment in this batch, grouped into whole sets. */
export function menuIconTreatments(catalog: AdminLiveMediaCatalog): MenuIconTreatment[] {
  const slots = new Set(MENU_ICON_DESTINATIONS.map((destination) => destination.slot));
  const bySlug = new Map(MENU_ICON_DESTINATIONS.map((destination) => [destination.slot, destination.slug]));
  const grouped = new Map<string, MenuIconTreatment>();
  for (const version of catalog.versions) {
    if (!version.media || version.status !== 'candidate') continue;
    if (!version.slot || !slots.has(version.slot)) continue;
    if (batchId(version) !== MENU_ICON_BATCH_ID) continue;
    const treatment = metadataString(version, 'treatment');
    if (!treatment) continue;
    const existing = grouped.get(treatment) ?? {
      treatment,
      label: metadataString(version, 'treatmentLabel') || treatment,
      index: treatmentIndex(version),
      marks: new Map<string, AdminLiveMediaVersion>(),
    };
    existing.marks.set(bySlug.get(version.slot)!, version);
    grouped.set(treatment, existing);
  }
  return [...grouped.values()].sort((left, right) => left.index - right.index);
}

/**
 * The mark each destination draws TODAY — resolved through `menuModeIcon`, the same lookup the
 * live rail uses, NOT through this category's slot table. Those two disagree on purpose:
 * Enchiridion's installed mark is a shared kit glyph outside the carved family, which is one of
 * the things being judged here. Reading the slot table would report it as "no candidate" and
 * hide the very mark the review is asking about.
 */
export function installedIconUrls(): Map<string, string> {
  const marks = new Map<string, string>();
  for (const destination of MENU_ICON_DESTINATIONS) {
    try {
      marks.set(destination.slug, menuModeIcon(destination.slug));
    } catch {
      // A destination with no installed mark leaves its seat empty rather than failing the
      // whole category; the rail below labels the gap.
    }
  }
  return marks;
}

/** Point a menu destination's drawable at its own installed mark. */
async function repointMenuModeIcon(assetId: string, slot: string): Promise<void> {
  const catalog = await fetchAdminDrawableCatalog();
  const asset = catalog.assets.find((entry) => entry.id === assetId);
  if (!asset) throw new Error(`the ${assetId} drawable is unavailable`);
  const media = Object.fromEntries(Object.entries(asset.media).map(([name, binding]) => [name, binding.slot]));
  if (media.icon === slot) return;
  await saveDrawableAsset({
    id: asset.id,
    kind: asset.kind,
    label: asset.label,
    sortOrder: asset.sortOrder,
    lifecycleState: asset.lifecycleState,
    behavior: asset.behavior,
    metadata: asset.metadata,
    media: { ...media, icon: slot },
    expectedRevision: asset.rowRevision,
  });
}

/**
 * The rail exactly as the menu paints it. The tabs select in place rather than navigating:
 * a review must not navigate away, and swapping in a lookalike button would defeat the whole
 * point of mounting the real one.
 */
function RailPreview({ marks }: { marks: Map<string, string> }): ReactElement {
  return (
    <ApparatusRailColumn opens="no-panel" className="menu-mark-rail">
      {MENU_ICON_DESTINATIONS.map((destination, index) => {
        const mark = marks.get(destination.slug);
        return mark ? (
          <ApparatusRailTab
            key={destination.slug}
            label={destination.label}
            index={index}
            iconSrc={mark}
            onSelect={() => undefined}
          />
        ) : (
          <p className="menu-mark-missing" key={destination.slug} role="status">
            {destination.label}: no candidate
          </p>
        );
      })}
    </ApparatusRailColumn>
  );
}

export interface MenuMarkState {
  catalog: AdminLiveMediaCatalog | null;
  selectedTreatment: string;
  select: (treatment: string) => void;
  error: string;
  refresh: () => void;
}

export function useMenuMarks(): MenuMarkState {
  const { catalog, error, refresh } = useAdminLiveMediaCatalog();
  const [selectedTreatment, setSelectedTreatment] = useState('');
  const select = useCallback((treatment: string) => setSelectedTreatment(treatment), []);
  return { catalog, selectedTreatment, select, error, refresh };
}

export function MenuMarkCatalog({ state }: { state: MenuMarkState }): ReactElement {
  const { catalog, selectedTreatment, select, error } = state;
  const treatments = useMemo(() => catalog ? menuIconTreatments(catalog) : [], [catalog]);
  const installed = useMemo(() => installedIconUrls(), []);
  if (error) return <p role="alert">{error}</p>;
  if (!catalog) return <p role="status">Loading candidates…</p>;
  return (
    <div className="tileset-studio-grid studio-seat-grid menu-mark-grid" data-testid="menu-mark-catalog">
      <StudioCatalogCard
        className="studio-seat-card"
        title="Installed"
        badge="in the menu now"
        selected={selectedTreatment === ''}
        onSelect={() => select('')}
        media={<RailPreview marks={installed} />}
      />
      {treatments.map((treatment) => (
        <StudioCatalogCard
          key={treatment.treatment}
          className="studio-seat-card"
          title={treatment.label}
          badge={`${treatment.marks.size}/${MENU_ICON_DESTINATIONS.length} marks`}
          selected={selectedTreatment === treatment.treatment}
          onSelect={() => select(treatment.treatment)}
          ariaLabel={`${treatment.label} candidate set`}
          media={(
            <RailPreview
              marks={new Map([...treatment.marks].map(([slug, version]) => [slug, version.media!.url]))}
            />
          )}
        />
      ))}
      {!treatments.length ? <p>No candidate sets are uploaded for this batch.</p> : null}
    </div>
  );
}

export function MenuMarkControls({ state }: { state: MenuMarkState }): ReactElement {
  const { catalog, selectedTreatment, refresh } = state;
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const treatments = useMemo(() => catalog ? menuIconTreatments(catalog) : [], [catalog]);
  const treatment = treatments.find((entry) => entry.treatment === selectedTreatment) ?? null;
  const complete = Boolean(treatment)
    && MENU_ICON_DESTINATIONS.every((destination) => treatment!.marks.has(destination.slug));

  const install = async (): Promise<void> => {
    if (busy || !catalog || !treatment) return;
    setBusy(true);
    try {
      const versions = MENU_ICON_DESTINATIONS
        .map((destination) => treatment.marks.get(destination.slug))
        .filter((version): version is AdminLiveMediaVersion => Boolean(version));
      setStatus('Recording approval for these exact bytes…');
      // One review call per version, NOT the review batch. A review batch is only for versions
      // that share a declared acceptance group, and these five occupy five independent slots —
      // sending them together is refused with media_review_batch_requires_one_acceptance_group.
      // Acceptance is still one batch, which is what makes the set land together or not at all.
      const reviewedVersions: AdminLiveMediaVersion[] = [];
      for (const version of versions) {
        reviewedVersions.push(await reviewLiveMediaVersion({
          id: version.id,
          expectedRevision: version.rowRevision,
          notes: `Selected the ${treatment.label} main-menu mark set from the live menu rail it paints. Slot: ${version.slot}.`,
          surfaceUrl: window.location.href,
          evidence: {
            schema: 'live-media-owner-proof-v1',
            batchId: MENU_ICON_BATCH_ID,
            treatment: treatment.treatment,
            versionId: version.id,
            contentSha256: version.media!.sha256,
            slot: version.slot,
            canonicalScale: 1,
            surfaceKind: 'Main-menu apparatus rail at the live 44px seat',
          },
        }));
      }
      setStatus('Installing the set…');
      await acceptLiveMediaVersions(reviewedVersions.map((version) => {
        const slot = catalog.slots.find((entry) => entry.slot === version.slot);
        return {
          id: version.id,
          expectedRevision: version.rowRevision,
          expectedSlotRevision: slot?.rowRevision ?? 0,
          expectedActiveVersionId: slot?.activeVersionId ?? null,
        };
      }));
      for (const destination of MENU_ICON_DESTINATIONS) {
        if (!destination.repointDrawable || !treatment.marks.has(destination.slug)) continue;
        setStatus(`Pointing ${destination.label} at its own mark…`);
        await repointMenuModeIcon(destination.repointDrawable, destination.slot);
      }
      setStatus('Installed. The main menu paints this set now — reload the menu to see it.');
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
        Each card is the real menu rail — the same button primitive, the same leaf surface, the
        same 40px seat drawing the 64px canvas at 44px. Every mark is fitted the same way: ink
        scaled to exactly 52px tall on the 64px canvas, both ink dimensions pinned even, and the
        mark seated on the button's own centre line. Each mark is drawn in the materials its own
        object is made of, not in one material shared across the set (ADR-0035, ADR-0560).
        Nothing is installed until you install a set.
      </p>
      <button
        type="button"
        className="tileset-view-action"
        disabled={busy || !treatment || !complete}
        data-testid="install-menu-marks"
        onClick={() => { void install(); }}
      >
        {!treatment ? 'Select a candidate set' : busy ? 'Installing…' : `Use the ${treatment.label} set`}
      </button>
      {treatment && !complete ? <p className="tileset-catalog-note" role="status">This set is incomplete and cannot be installed.</p> : null}
      {status ? <p className="tileset-catalog-note" role="status">{status}</p> : null}
    </>
  );
}
