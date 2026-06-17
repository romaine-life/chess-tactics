// Glossary — tag, single entry (catalog glossary mode), and the full page.
// Faithful port of app.js renderGlossaryTag/renderGlossaryEntry/renderGlossary.
import { GLOSSARY } from './catalogData';

type Navigate = (href: string, e?: { preventDefault: () => void }) => void;

export function GlossaryTag({ tag }: { tag: string }): React.ReactElement | null {
  if (!tag) return null;
  const cls = tag === 'asset' ? 'is-asset' : 'is-not-asset';
  return <span className={`glossary-tag ${cls}`}>{tag}</span>;
}

// Catalog glossary mode: the content pane for the currently-selected term.
export function GlossaryEntry({ term, onNavigate }: { term: string; onNavigate: Navigate }): React.ReactElement {
  const g = GLOSSARY.find((entry) => entry.term === term);
  if (!g) return <p className="catalog-empty">Pick a term from the tree to read its definition.</p>;
  return (
    <article className="glossary-entry">
      <header>
        <h3>{g.term}</h3>
        <GlossaryTag tag={g.tag} />
      </header>
      <p className="glossary-entry-def">{g.def}</p>
      <p className="glossary-entry-src">{g.src}</p>
      <p className="glossary-entry-more">
        <a href="/design/glossary" onClick={(e) => onNavigate('/design/glossary', e)}>Full glossary →</a>
      </p>
    </article>
  );
}

// The standalone /design/glossary page.
export function GlossaryPage({ onNavigate }: { onNavigate: Navigate }): React.ReactElement {
  return (
    <div className="main-assets-screen glossary-screen" data-live-screen="glossary">
      <header className="main-assets-header">
        <a className="design-back" href="/design" onClick={(e) => onNavigate('/design', e)}>← Design</a>
        <p className="eyebrow">Design system</p>
        <h2>Glossary</h2>
        <p className="main-assets-intro">The shared vocabulary for the asset catalog. Every term is attested by engine documentation (Unity, Unreal, Godot).</p>
      </header>

      <section className="glossary-callout" aria-label="Core distinction">
        <p><strong>Two structures, kept separate.</strong> The <b>catalog</b> is an inventory of assets sorted by type (Buttons, Icons, Board, Pieces). A <b>button</b> is a <b>widget</b> — a composition of assets assembled at runtime — not an inventory item.</p>
      </section>

      <dl className="glossary-list">
        {GLOSSARY.map((g) => (
          <div className="glossary-row" key={g.term}>
            <dt>
              <span className="glossary-term">{g.term}</span>
              <GlossaryTag tag={g.tag} />
            </dt>
            <dd>
              <p>{g.def}</p>
              <span className="glossary-src">{g.src}</span>
            </dd>
          </div>
        ))}
      </dl>

      <section className="glossary-example" aria-label="Worked example">
        <h3>Worked example</h3>
        <p>The on-screen <b>Solo Skirmish</b> button is a <b>widget</b>: the <code>button-row.main-menu.solo-skirmish</code> row art (normal or pressed state) + the live label “Solo Skirmish” (in the <code>textInset</code>) + the <code>party</code> action. The row art is an asset in the catalog; the button itself is not.</p>
      </section>
    </div>
  );
}
