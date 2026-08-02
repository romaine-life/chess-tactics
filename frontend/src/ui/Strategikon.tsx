import { useState, type ReactElement } from 'react';
import type { RunDocument } from '../run/model';
import {
  DEFAULT_RUN_ARMY_FILTERS,
  RunArmyWorkspace,
  type RunArmyFilters,
} from './RunArmyWorkspace';
import { Enchiridion, EnchiridionSectionRail, RelicCodex } from './Enchiridion';
import { ENCHIRIDION_SECTIONS, type EnchiridionSection } from './enchiridionRoute';
import { ApparatusRailColumn, ApparatusRailTab } from './shared/ApparatusRailTab';
import { InnerChromeBox, ShellWorkspace } from './shared/ChromeBox';
import { installedUiMedia } from './installedUiMedia';

export type StrategikonSection = 'enchiridion' | 'prosopography' | 'lipsanotheca';

function sectionFromPath(path: string): StrategikonSection {
  if (path.includes('/prosopography')) return 'prosopography';
  if (path.includes('/lipsanotheca')) return 'lipsanotheca';
  return 'enchiridion';
}

function enchiridionSectionFromPath(path: string): EnchiridionSection {
  const found = ENCHIRIDION_SECTIONS.find((section) => path.endsWith(`/${section}`));
  return found ?? 'units';
}

function strategikonHref(basePath: '/play' | '/run', section: StrategikonSection, enchiridionSection = 'units'): string {
  return section === 'enchiridion'
    ? `${basePath}/strategikon/enchiridion/${enchiridionSection}`
    : `${basePath}/strategikon/${section}`;
}

function UnavailableRunReference({ title, copy }: { title: string; copy: string }): ReactElement {
  return (
    <main className="strategikon-reference">
      <section className="enchiridion-panel enchiridion-panel-unframed strategikon-unavailable-panel">
        <h2 className="settings-section-title">{title}</h2>
        <InnerChromeBox className="enchiridion-empty">
          <h3>No persistent Run is attached</h3>
          <p>{copy}</p>
        </InnerChromeBox>
      </section>
    </main>
  );
}

export function Strategikon({
  path,
  search,
  run,
}: {
  path: string;
  search: string;
  run?: RunDocument | null;
}): ReactElement {
  const basePath: '/play' | '/run' = path.startsWith('/run') ? '/run' : '/play';
  const section = sectionFromPath(path);
  const enchiridionSection = enchiridionSectionFromPath(path);
  const [filters, setFilters] = useState<RunArmyFilters>({ ...DEFAULT_RUN_ARMY_FILTERS });
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const withSearch = (href: string) => `${href}${search}`;

  return (
    <ShellWorkspace
      className="strategikon-workspace"
      contentClassName={`strategikon-workspace-layout${section === 'enchiridion' ? ' has-secondary-rail' : ''}`}
      bodyClassName="strategikon-content"
      backgroundArtwork={(
        <img
          className="strategikon-background-artwork"
          src={installedUiMedia('ui-workspaces-strategikon-background-png')}
          alt=""
          draggable={false}
        />
      )}
      edgeAttached
      rail={(
        <>
          <ApparatusRailColumn className="strategikon-rail" aria-label="Strategikon sections">
            <ApparatusRailTab
              label="Enchiridion"
              to={withSearch(strategikonHref(basePath, 'enchiridion', enchiridionSection))}
              index={0}
              active={section === 'enchiridion'}
              iconClassName="ic-grid"
            />
            <ApparatusRailTab
              label="Prosopography"
              title="The Martial Prosopography — Current Army"
              to={withSearch(strategikonHref(basePath, 'prosopography'))}
              index={1}
              active={section === 'prosopography'}
              iconClassName="skirmish-tab-icon skirmish-tab-icon-roster"
            />
            <ApparatusRailTab
              label="Lipsanotheca"
              title="The Lipsanotheca — Held Relics"
              to={withSearch(strategikonHref(basePath, 'lipsanotheca'))}
              index={2}
              active={section === 'lipsanotheca'}
              iconClassName="skirmish-tab-icon skirmish-tab-icon-log"
            />
          </ApparatusRailColumn>
          {section === 'enchiridion' ? (
            <EnchiridionSectionRail
              section={enchiridionSection}
              sectionHref={(next) => withSearch(strategikonHref(basePath, 'enchiridion', next))}
            />
          ) : null}
        </>
      )}
      aria-label="Strategikon"
      data-testid="strategikon"
    >
        {section === 'enchiridion' ? (
          <Enchiridion
            section={enchiridionSection}
            sectionHref={(next) => withSearch(strategikonHref(basePath, 'enchiridion', next))}
            showSectionRail={false}
            sceneInstanceKey={`strategikon/enchiridion/${enchiridionSection}`}
            framed={false}
          />
        ) : section === 'prosopography' ? (
          run ? (
            <RunArmyWorkspace
              run={run}
              title="The Martial Prosopography"
              backLabel="Back to Prosopography"
              filters={filters}
              selectedUnitId={selectedUnitId}
              onFiltersChange={setFilters}
              onSelectUnit={setSelectedUnitId}
              onBack={() => setSelectedUnitId(null)}
              onSell={() => undefined}
              framed={false}
            />
          ) : (
            <UnavailableRunReference title="The Martial Prosopography" copy="A persistent Current Army appears here during a Run." />
          )
        ) : run ? (
          <RelicCodex relicIds={run.relics} title="The Lipsanotheca" showStatistics={false} framed={false} />
        ) : (
          <UnavailableRunReference title="The Lipsanotheca" copy="Held relics appear here during a Run." />
        )}
    </ShellWorkspace>
  );
}
