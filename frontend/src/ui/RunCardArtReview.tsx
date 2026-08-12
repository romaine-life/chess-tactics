import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { fetchAdminLiveMediaCatalog, type AdminLiveMediaCatalog } from '../net/liveMediaAdmin';
import {
  RUN_CARD_DECK,
  RUN_STARTER_CARDS,
  DEFAULT_RUN_RULES,
  cardAllowedByRules,
  runCardCost,
  type RunCoreCard,
  type RunStarterCard,
} from '../run/model';
import { runCardName, runCardFlavor, runCardArtSlots } from '../run/cardNames';
import { RunCard } from './RunCard';

/**
 * Every card illustration of the ADR-0579 batch, mounted on the face it will actually be seen on.
 *
 * A contact sheet of PNGs cannot answer the question this page exists for: the art window crops,
 * the frame sits over it, and the name and price sit beside it. This is the same `RunCard` the
 * Sectio row draws, so what is judged here is what ships.
 *
 * Review only. Nothing here accepts, activates or re-points a slot.
 */
const SLOT_PREFIX = 'ui/run/card-art/';
const PROMPT_SCHEMA = 'run-card-art-prompt-v3';

type Mounted = {
  card: RunCoreCard | RunStarterCard;
  slot: string;
  world: string;
  status: string;
  url: string;
};

function worldOf(metadata: unknown): string {
  const anchor = (metadata as { historicalAnchor?: unknown } | null)?.historicalAnchor;
  return typeof anchor === 'string' && anchor.trim() ? anchor : 'Unassigned';
}

export function RunCardArtReviewCatalog(): ReactElement {

  const [catalog, setCatalog] = useState<AdminLiveMediaCatalog | null>(null);
  const [error, setError] = useState('');


  useEffect(() => {
    let live = true;
    fetchAdminLiveMediaCatalog()
      .then((next) => { if (live) setCatalog(next); })
      .catch((cause) => { if (live) setError(String((cause as Error)?.message ?? cause)); });
    return () => { live = false; };
  }, []);

  const mounted = useMemo<Mounted[]>(() => {
    if (!catalog) return [];
    // The batch is identified by its schema AND by still being a candidate: the ADR-0520 family art
    // shares the schema name, and an accepted row is not what this page is for.
    const versions = catalog.versions.filter((version) => (
      version.provenance?.schema === PROMPT_SCHEMA
      && version.status === 'candidate'
      && String(version.slot ?? '').startsWith(SLOT_PREFIX)
      && Boolean(version.media)
    ));
    const bySlot = new Map(versions.map((version) => [String(version.slot), version]));
    const cards: readonly (RunCoreCard | RunStarterCard)[] = [
      ...RUN_CARD_DECK.filter((card) => cardAllowedByRules(card, DEFAULT_RUN_RULES)),
      ...RUN_STARTER_CARDS,
    ];
    return cards.flatMap((card) => {
      const slot = runCardArtSlots(card)[0]!;
      const version = bySlot.get(slot);
      if (!version?.media) return [];
      return [{
        card,
        slot,
        world: worldOf(version.metadata),
        status: version.status,
        url: version.media.immutableUrl ?? version.media.url,
      }];
    });
  }, [catalog]);

  const worlds = useMemo(() => {
    const grouped = new Map<string, Mounted[]>();
    for (const entry of mounted) {
      grouped.set(entry.world, [...(grouped.get(entry.world) ?? []), entry]);
    }
    return [...grouped.entries()].sort((left, right) => right[1].length - left[1].length);
  }, [mounted]);

  if (error) return <p className="tileset-studio-empty" role="alert">Card art unavailable: {error}</p>;
  if (!catalog) return <p className="tileset-studio-empty" role="status">Loading the live catalog…</p>;

  return (
    <div className="run-card-art-review">
      {worlds.map(([world, entries]) => (
        <section key={world} className="run-card-art-review-world" aria-label={world}>
          <h2>{world} <span>{entries.length}</span></h2>
          <div className="run-card-art-review-grid">
            {entries.map(({ card, url, slot }) => (
              <figure key={slot} className="run-card-art-review-item" data-card-art-slot={slot}>
                {/* A King is a starter card and carries no price; it is granted, never bought. */}
                <RunCard
                  card={('goldBonusTenths' in card
                    ? card
                    : { ...card, cost: runCardCost(card, DEFAULT_RUN_RULES) }) as never}
                  mode={'goldBonusTenths' in card ? 'grant' : 'reference'}
                  artUrlOverride={url}
                />
                <figcaption>
                  <strong>{runCardName(card)}</strong>
                  <em>{runCardFlavor(card)}</em>
                  <code>{card.id}</code>
                  <img src={url} alt="" loading="lazy" />
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      ))}
      {!mounted.length ? (
        <p className="tileset-studio-empty" role="status">
          No candidate card art in the live catalog.
        </p>
      ) : null}
    </div>
  );
}
