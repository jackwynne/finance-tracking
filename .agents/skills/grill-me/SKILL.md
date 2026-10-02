---
name: grill-me
description: "Interrogate a proposed feature, plan, or design in dependency-aware rounds until its important decisions, constraints, and verification are settled. Use when the user asks to grill, stress-test, or shape an idea before implementation; do not use for simple implementation requests or ordinary codebase explanations."
---

# Grill me

Turn a fuzzy change into a shared, implementation-ready understanding. The conversation is the default artifact. Do not create permanent project documentation.

## Ground the discussion

Read the relevant code and repository instructions before asking questions. Resolve facts from the working tree, tools, and existing records yourself. Ask the user for decisions, preferences, and knowledge that only they can supply.

Build a private decision tree for the change. A decision can depend on earlier decisions. The current frontier is the set of material decisions whose prerequisites are settled.

Do not ask about low-impact details that existing conventions, reversible implementation choices, or good defaults already settle. Do not widen the requested change while exploring it.

## Interview in rounds

Ask the whole current frontier in one round, grouping closely related points so the round stays easy to answer. Number each question and include:

- The decision and why it affects the result.
- Concrete options when they clarify the choice.
- A recommended answer with a short reason.

Do not ask a question whose answer depends on another unresolved question in the same round. After the user answers, update the decision tree, call out any conflict or newly exposed consequence, and ask the next frontier.

If an answer contradicts the live code or an earlier decision, show the concrete conflict and resolve it with the user. Do not silently reinterpret the answer.

Stop when every material branch is settled, assumptions are explicit, and no blocking question remains. Summarize the resulting plan. If implementation is already authorized, proceed unless the user requested a checkpoint. For a planning-only request, return the plan and leave implementation for a later request.

## Keep the output temporary

By default, return the implementation brief in chat and write no files.

Only save a brief when the user explicitly asks to save, hand off, or carry the plan into another session. Write it to `.artifacts/plans/<short-slug>.md`. Before writing, verify that the exact path is ignored by Git. Never add the brief to Git, move it under `docs/`, or turn it into a glossary or ADR.

Keep a saved brief short:

```markdown
# <Change title>

> Temporary implementation brief. The live code is authoritative.

## Goal

## Decisions

## Constraints and non-goals

## Implementation slices

## Verification

## Open questions
```

Omit empty sections. Prefer pointers to current files and symbols over copied implementation detail. Record exact defaults, negative requirements, ordering rules, permission constraints, and observable acceptance criteria when the interview settled them.

Before using a saved brief, re-read the code it points to and correct stale assumptions in the brief. A brief does not expand the user's authorization or scope.

If the same workflow created the brief and later completes or abandons the implementation, remove that exact brief unless the user asks to keep it. Never bulk-delete plans. Put lasting constraints in code, types, tests, validation, or repository checks when implementation requires enforcement.
