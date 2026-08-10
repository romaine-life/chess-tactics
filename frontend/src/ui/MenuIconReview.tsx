import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  acceptLiveMediaVersions,
  fetchAdminLiveMediaCatalog,
  reviewLiveMediaVersions,
  type AdminLiveMediaCatalog,
  type AdminLiveMediaVersion,
} from '../net/liveMediaAdmin';
import { fetchAdminDrawableCatalog, saveDrawableAsset } from '../net/drawableCatalogAdmin';
import { defaultBackgroundSet } from '../art/backgroundSets';
import { ChromeButton } from './shared/ChromeButton';
import { OuterChromeBox, OuterChromeHeader } from './shared/ChromeBox';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { menuModeIcon } from './menuModeIcon';
import { useSceneParticipant } from './shell/SceneBoundary';

/**
 * Owner review for a whole main-menu mark SET.
 *
 * The unit of decision here is the set, not the icon: these five marks stack in one
 * column where every neighbour is a size and material reference, so a mark can only be
 * judged against the other four it will stand beside. Each treatment is therefore
 * mounted as a complete rail through the SAME `ApparatusRailColumn` / `ApparatusRailTab`
 * the live menu paints — same oak leaf surface, same 40px seat, same 44px draw of the
 * 64px canvas — so what is on screen here is what the menu will look like, not a
 * contact sheet standing in for it.
 *
 * Nothing is installed until the owner installs a set, and installing is one act per
 * set: approval of those exact bytes, acceptance into the five slots, and the one
 * drawable re-point the Enchiridion mark needs (it currently borrows a shared kit
 * glyph and gains a mark of its own family here).
 */
export const MENU_ICON_BATCH_ID = 'main-menu-icons-2026-08-09-r5';

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
   *  marks is exactly the kind of thing this page exists to make visible. */
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
 * The mark each destination draws TODAY — resolved through `menuModeIcon`, the same
 * lookup the live rail uses, NOT through this page's slot table. Those two disagree on
 * purpose: Enchiridion's installed mark is a shared kit glyph outside the carved family,
 * which is one of the things being judged here. Reading the slot table would report it as
 * "no candidate" and hide the very mark the review is asking about.
 */
export function installedIconUrls(): Map<string, string> {
  const marks = new Map<string, string>();
  for (const destination of MENU_ICON_DESTINATIONS) {
    try {
      marks.set(destination.slug, menuModeIcon(destination.slug));
    } catch {
      // A destination with no installed mark leaves its seat empty rather than failing
      // the whole review; the rail below labels the gap.
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
 * The rail exactly as the menu paints it. `to` is this page's own address on every tab:
 * the primitive is a NavButton and a review must not navigate away, but swapping in a
 * lookalike button would defeat the whole point of mounting the real one.
 */
function RailPreview({
  marks,
  reviewHref,
}: {
  marks: Map<string, string>;
  reviewHref: string;
}): ReactElement {
  return (
    <ApparatusRailColumn className="menu-icon-review-rail">
      {MENU_ICON_DESTINATIONS.map((destination, index) => {
        const mark = marks.get(destination.slug);
        return mark ? (
          <ApparatusRailTab
            key={destination.slug}
            label={destination.label}
            to={reviewHref}
            index={index}
            iconSrc={mark}
          />
        ) : (
          <p className="menu-icon-review-missing" key={destination.slug} role="status">
            {destination.label}: no candidate
          </p>
        );
      })}
    </ApparatusRailColumn>
  );
}

function InstallSetControl({
  treatment,
  catalog,
  onInstalled,
}: {
  treatment: MenuIconTreatment;
  catalog: AdminLiveMediaCatalog;
  onInstalled: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const complete = MENU_ICON_DESTINATIONS.every((destination) => treatment.marks.has(destination.slug));

  const install = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      const versions = MENU_ICON_DESTINATIONS
        .map((destination) => treatment.marks.get(destination.slug))
        .filter((version): version is AdminLiveMediaVersion => Boolean(version));
      setStatus('Recording approval for these exact bytes…');
      const reviewed = await reviewLiveMediaVersions({
        versions,
        notes: `Selected the ${treatment.label} main-menu mark set from the live menu rail it paints.`,
        surfaceUrl: window.location.href,
        evidence: {
          schema: 'live-media-owner-proof-v1',
          batchId: MENU_ICON_BATCH_ID,
          treatment: treatment.treatment,
          canonicalScale: 1,
          surfaceKind: 'Main-menu apparatus rail at the live 44px seat',
          versions: versions.map((version) => ({ id: version.id, contentSha256: version.media!.sha256, slot: version.slot })),
        },
      });
      setStatus('Installing the set…');
      await acceptLiveMediaVersions(reviewed.versions.map((version) => {
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
        disabled={busy || !complete}
        data-testid={`install-menu-icons-${treatment.treatment}`}
        onClick={() => { void install(); }}
      >
        {busy ? 'Installing…' : `Use the ${treatment.label} set`}
      </ChromeButton>
      {!complete ? <p role="status">This set is incomplete and cannot be installed.</p> : null}
      {status ? <p role="status">{status}</p> : null}
    </>
  );
}

export function MenuIconReview(): ReactElement {
  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');
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
  const treatments = useMemo(() => catalog ? menuIconTreatments(catalog) : [], [catalog]);
  const installed = useMemo(() => installedIconUrls(), []);
  const reviewHref = `${window.location.pathname}${window.location.search}`;

  return (
    <main
      className="menu-icon-review-screen skirmish-screen"
      style={{ ['--skirmish-world-bg' as string]: `url("${defaultBackgroundSet().world}")` }}
    >
      <OuterChromeBox chromeConsumer="menu-icon-review" titled className="menu-icon-review-panel">
        <OuterChromeHeader title="Main-Menu Mark Review" />
        <p>
          Each column is the real menu rail — the same button primitive, the same leaf
          surface, the same 40px seat drawing the 64px canvas at 44px. Every candidate mark
          is fitted the same way: ink scaled to exactly 52px tall on the 64px canvas, both
          ink dimensions pinned even, and the mark seated on the button's own centre line —
          so every mark in every set carries the same 5.6px above it and below it. Nothing
          is installed until you install a set.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        {!catalog && !error ? <p role="status">Loading candidates…</p> : null}
        {catalog ? (
          <div className="menu-icon-review-sets">
            <section className="menu-icon-review-set" aria-labelledby="menu-icon-installed-title">
              <h2 id="menu-icon-installed-title">Installed</h2>
              <p>What the menu paints today.</p>
              <RailPreview marks={installed} reviewHref={reviewHref} />
            </section>
            {treatments.map((treatment) => (
              <section
                className="menu-icon-review-set"
                aria-labelledby={`menu-icon-${treatment.treatment}-title`}
                data-testid={`menu-icon-set-${treatment.treatment}`}
                key={treatment.treatment}
              >
                <h2 id={`menu-icon-${treatment.treatment}-title`}>{treatment.label}</h2>
                <p>Candidate set — not installed.</p>
                <RailPreview
                  marks={new Map([...treatment.marks].map(([slug, version]) => [slug, version.media!.url]))}
                  reviewHref={reviewHref}
                />
                <InstallSetControl treatment={treatment} catalog={catalog} onInstalled={refresh} />
              </section>
            ))}
          </div>
        ) : null}
        {catalog && !treatments.length ? <p>No candidate sets are uploaded for this batch.</p> : null}
      </OuterChromeBox>
    </main>
  );
}
