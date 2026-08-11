---
status: accepted
date: 2026-08-10
deciders: owner (Nelson) + Claude
refines:
  - "[ADR-0527](0527-a-royal-fork-pays-one-gold.md)"
  - "[ADR-0540](0540-the-board-pays-manubiae-for-named-tactics.md)"
---

# ADR-0565: A Knight's fork is paid by the prong, and accelerates

## Context

ADR-0527 gave the Run its royal fork and ADR-0540 folded it into the Manubiae catalog, where it
asks about the QUALITY of two prongs: the enemy King, and a Rook or better. It says nothing about
how many things a unit hits.

The owner asked for the other question: *"a knight should get a bonus for each simultaneous enemy
piece attacked, scaling up."* Count, and a count whose marginal value rises.

Knight-specific, and the geometry is why. A Knight's attacks cannot be blocked and its eight
squares are scattered rather than laid along lines, so the enemy has no move that answers two of
them at once — no interposition, no single retreat covering both, no counter-line. Every other
piece forks along rays that a block or a pin can address. That is what makes the count mean
something for a Knight and much less for a Queen.

## Decision

- **`knight-fork` pays by the prong, and the price accelerates.** The second unit attacked adds
  one rung, the third adds two, the fourth adds three: 5, 15, 30, 50, 75 for two, three, four,
  five and six units. A flat rate per unit would say a Knight hitting four things is twice a Knight
  hitting two, and it is nothing of the sort — the second prong is what makes it a fork, and every
  prong after that is another square the enemy cannot answer.
- **Five a rung rather than ten, to put the plain two-prong fork UNDER the royal fork** it is
  often a lesser version of, with three prongs passing it. That order is the whole reason for the
  number.
- **Count, not value.** A Knight forking three Pawns pays 15 and that is correct: it is a fine
  square, and it is worth less than the 30 a fourth prong reaches. The rate is set low enough that
  counting bodies never outruns quality by much — the royal fork's King-and-Queen at 10 sits
  between the two-prong 5 and the three-prong 15.
- **The two forks are one ladder.** A Knight striking the King and a Rook is a royal fork AND a
  two-prong Knight's fork, and one unit's fork is one deed, so the dearer pays and the other stands
  down — the rule the two checks and the four mates already run on. It also simplifies the reader:
  `forkHolds` is now asked once, of the FORK rather than of an entry, and only when there is a fork
  to ask about.
- **The fork must HOLD, and it matters more here than for the royal one.** ADR-0540 required a
  royal fork to survive the enemy taking the forker; a plain Knight's fork needs it more, because a
  royal fork is a CHECK and the enemy must answer it, while a fork of three ordinary pieces forces
  nothing at all. A Knight that plants itself en prise beside three enemies has handed over a
  Knight, and paying for that would teach exactly that move. Same `forkHolds`, unchanged.
- **Membership is `isEnemy`, the predicate a capture uses**, so obstacles and neutrals are not
  attacked things and a Knight beside a rock has not forked it. `enemiesAttackedBy` joins
  `royalForkVictim` in `core/rules` as its counting counterpart, reading boards through the same
  `attacksSquare` geometry check detection uses. It is deliberately NOT `opponentsUnderAttackBy`,
  which serves the service record and counts any non-obstacle of another side, neutrals included.
- **From the square it just moved to**, exactly as the royal fork requires, so a Knight standing
  where it already stood is not paid again every turn.
- Board law is untouched, and no RunSaveVersion, save shape, or database migration changes.

## Consequences

- **The Knight now has a coherent identity in this economy, and it is the identity chess gives
  it.** It is the only unit that can earn a smothered mate (ADR-0540), the only one whose
  underpromotion can mate where a Queen could not (ADR-0561), and now the only one paid for the
  breadth of what it attacks — while being the one unit structurally shut out of the reach
  bounties, since its longest move is two squares (ADR-0564). Paid for what cannot be blocked and
  cannot be answered; never paid for distance. Nothing coordinated that; it fell out of pricing
  each deed honestly, which is worth noticing before adding an entry that breaks it.
- `forkHolds` now runs on any Knight move that attacks two or more enemies, where before it ran
  only behind a matched royal fork. It stays bounded — one ply per legal enemy capture of the
  Knight, and only once a fork is already on the board — and the ladder means it is asked once per
  moved unit rather than once per entry.
- The ceiling is high and unreachable in practice: eight prongs would pay 140, and would require
  every square around a Knight's eight to hold an enemy unit while the Knight itself is safe. No
  cap is written for it, because a position that achieves it has earned whatever it says.
- A Knight's fork of two is now the cheapest fixed-shape deed in the catalog at 5, below the royal
  fork's 10. That is the intended reading: it is the commonest good Knight move there is.
