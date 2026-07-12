---
status: "accepted"
date: 2026-07-08
deciders: Nelson, Claude
---

# ADR-0071: The deliverable is the instrument — the agent builds the project around the project

The point of this project is **not** for the agent to build the game for the owner,
or to solve its problems for him. It is for the agent to build the **tools that put
assembly, inspection, judgment, tuning, and audit in the owner's hands** — the
meta-project, the project *around* the project. Every feature is confirmed against
this spirit: an algorithm without its inspector is scaffolding, not a feature; a
result the owner cannot reproduce, drive, and interrogate himself is not delivered.
This is the general rule that ADR-0054 (the calibration bench), ADR-0057 (tuning
surfaces), ADR-0070 (content answers to the owner), the Studio, the Gym, the level
editor, and the prop/portrait labs are each an instance of.

## Context and Problem Statement

The owner, verbatim, after a session in which the agent built a large feature past
him:

> "the whole point of this project isn't to have you solve it for me, or build it
> for me, but for you to make the tools that let me assemble it myself, and audit
> it myself, as much as possible. shortcuts happen as a way to stand something up,
> but the overall spirit of the project — which features must be confirmed against
> — is that the agent should be contributing to a kind of meta-project. the project
> *around* the project. I want to pick the art positioning, i want to inspect the
> algorithm."

And the division of labor that makes this the only sane arrangement:

> "you fail at visual alignment, and you fail at many concepts that I have to help
> with. … you can recite to me how stockfish was trained, but you aren't really
> doing a great job of understanding how to adapt that process to this, and you
> aren't doing a great job of understanding that success is putting the tools in
> MY hands — because I'm the expert. … I've played video games for 40 years, and I
> know what game AI should feel like, and do know a little bit about algorithms
> and search trees."

The owner is the domain expert: forty years of play, the feel of game AI, a working
grasp of algorithms and search. The agent is strong at mechanical construction and
recitation, and demonstrably weak at exactly what makes the game good — visual
alignment, feel, taste, and adapting canonical processes to *this* game's scale and
purpose. A system where the weak-at-judgment party makes the judgment calls and
hands over finished results is upside down. The correct system routes every
judgment call to the expert **through an instrument**, and the agent's craft is
building that instrument well.

The trigger session made the cost concrete: a board solver was built
*answer-first* — the "watch it think, drive it yourself" surface (the owner's
stated purpose, backed by two reference apps he built to show the exact shape) was
scheduled last, delivered as a scrub-a-recording compromise, and padded with
agent-summoned demo content (ADR-0070's trigger). Every piece worked; the point was
missed. Meanwhile the parts of the repo everyone is proud of — the level editor,
the Studio labs, the Gym — are precisely the parts where the agent built a lever
and the owner pulled it.

## Decision Outcome

Chosen: **features are confirmed against the meta-project**, concretely:

1. **The deliverable of feature work is the instrument, not the outcome.** A tuned
   number, a solved board, a generated sprite, a chosen position is a *byproduct*;
   the feature is the viewer/stepper/editor/tuner/auditor that let the owner
   produce, reproduce, and interrogate it. "It works" is not done; **"he can drive
   it" is done.**

2. **Owner-operable end-to-end.** Every instrument must be operable by the owner
   with the agent absent: reachable by clicking (ADR-0058), fed by content he
   governs (ADR-0070), with its knobs on the surface (bounds, seeds, weights,
   filters — not hardcoded defaults only an agent can change), and its state
   legible (what ran, on what data, with what result).

3. **Judgment routes to the owner; mechanics stay with the agent.** Art
   positioning, feel, difficulty, values, pacing, what-reads-well — the agent
   builds the picker/slider/before-after/stepper and the owner decides. The agent
   never bakes a judgment call into code as a fait accompli. (Existing instances:
   [[never-judge-images-solo]], the prop-seat lab, the portrait editor.)

4. **Canonical processes are adapted through this lens.** The question is never
   "how did Stockfish/AlphaZero/the textbook do it" recited at the owner — it is
   "what instrument puts that process under the owner's hands, at this game's
   scale, so HE can run it, watch it, and judge it." A pipeline the owner cannot
   see into fails this test no matter how faithful its pedigree.

5. **Shortcuts are named debt against this ADR.** Standing something up quickly is
   legitimate — but a feature that ships outcome-first records its missing
   instrument as explicit debt (the way ADR-0070 ships with named violations),
   never silently as "done."

### Consequences

- Good: the definition of done gains the meta-test — *can the owner assemble,
  inspect, and audit this himself?* — and audits can now cite this ADR when a
  feature ships as a black box, instead of ruling it legal.
- Good: names the rule the repo's best surfaces already follow, so new work
  converges on the pattern instead of rediscovering it per feature.
- Cost: instrument-first is slower to first result than solve-it-for-him. That
  cost is accepted — it is the point of the project.
- Named debt at adoption: the Board Solver stepper computes the whole solve up
  front and scrubs a recording (no compute-as-you-step — the reference apps'
  step semantics); its bounds are hardcoded (rule 2); its cluster runs emit no
  inspectable trace. All recorded as upheld findings of the 2026-07-08 audit;
  rework owner-directed.

## More Information

The general rule behind [ADR-0054](0054-nine-slice-editor-is-the-devs-calibration-bench.md),
[ADR-0057](0057-studio-tuning-surfaces-reset-to-committed-baseline.md),
[ADR-0058](0058-every-route-is-click-reachable.md),
[ADR-0070](0070-board-content-answers-to-the-one-content-system.md); sibling in
spirit to [ADR-0059](0059-reuse-the-canonical-primitive-not-a-bespoke-parallel.md)
(which did for primitives what this does for purpose). Reference implementations of
the intended feel: the owner's `bender-world` and `eight-queens` visualizers
(drive-it-yourself algorithm steppers). Trigger: the board-solver session,
2026-07-08.
