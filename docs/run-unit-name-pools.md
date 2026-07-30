# Run unit name pools

Run units use complete historical identities selected by chess-piece role. The
pool is content, not a procedural medieval-name generator: given names and family
names are never recombined into people who did not exist.

This contract implements [ADR-0228](adr/0228-run-unit-names-are-role-specific-historical-identities.md).

## Scope by chess role

| Piece | Identity represented | Current pool |
| --- | --- | ---: |
| Pawn | A named archer recorded in a medieval muster or retinue roll | 64 |
| Knight | A documented medieval knight | 64 |
| Bishop | A biblical or historical religious office-holder or leader | 64 |
| Rook | A real medieval European or Mediterranean castle or citadel | 64 |
| Queen | A biblical, European, or Mediterranean queen, empress, or regent | 64 |
| King | A biblical, European, or Mediterranean king or emperor | 64 |

The game's primary visual period remains roughly 1000–1500 AD. Biblical and
early-church people are an intentional secondary register; the other pools are
predominantly medieval and weighted toward western Europe and the Mediterranean.

Every pool is shuffled independently from the Run seed. Acquisition order is
counted separately per piece type, so all 64 identities in a role are used once
before that role can repeat. The chosen string is stored on the unit and is not
regenerated for display.

## Source anchors

- **Pawns:** [The Medieval Soldier Database](https://www.medievalsoldier.org/database/)
  and the [National Archives research guide](https://www.nationalarchives.gov.uk/help-with-your-research/research-guides/medieval-early-modern-soldiers/).
  The current entries are transcribed from database results for rank `Archer`,
  datasets `111`, years 1369–1453. The database was compiled from National
  Archives muster rolls, protections, and Gascon rolls.
- **Knights:** the [College of St George history of the Military Knights and
  founder companions](https://www.stgeorges-windsor.org/wp-content/uploads/2019/08/Monograph-Vol-4.pdf),
  the National Archives military-service guide above, and the Metropolitan
  Museum's [overview of medieval knighthood](https://www.metmuseum.org/essays/feudalism-and-knights-in-medieval-europe).
  The pool uses named, attested people rather than romance or Round Table figures.
- **Bishops and religious leaders:** the Holy See's official
  [chronology of pontiffs](https://www.vatican.va/content/vatican/en/holy-father.html)
  and the peer-reviewed
  [Fasti Ecclesiae Gallicanae](https://www.brepols.net/series/FEG)
  prosopographical repertory, together with canonical biblical identities.
- **Rooks:** official monument registers and histories from
  [English Heritage](https://www.english-heritage.org.uk/learn/histories/medieval-castles/),
  [Cadw](https://cadw.gov.wales/visit/places-to-visit/castles-wales), and the
  [UNESCO World Heritage List](https://whc.unesco.org/en/list).
- **Queens and Kings:** the
  [Royal Household chronology](https://www.royal.uk/kings-and-queens-1066) and
  the [Dictionary of Medieval Names from European Sources](https://dmnes.org/),
  whose source corpus covers European names from 500–1600 and explicitly indexes
  important rulers and church leaders, together with canonical biblical rulers.

Sources last checked 2026-07-29.

## Maintenance rules

- Add only a complete identity that denotes one attested person, office-holder,
  or real fortification appropriate to that role.
- Preserve the documented spelling used by a reliable source where practical.
  Add a territorial qualifier when two rulers would otherwise be ambiguous.
- Do not add legendary knights, fantasy names, recombined fragments, generic
  occupations, or invented castles.
- Keep every identity non-empty, unique within its role, and at most 80
  characters. Expand all six roles deliberately; do not solve one exhausted pool
  by borrowing an identity from another piece type.
