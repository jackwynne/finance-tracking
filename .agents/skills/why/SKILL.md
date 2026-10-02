---
name: why
description: Investigate design rationale and regressions through git history, pull requests, comments, tests, and repository documents. Use how for ordinary runtime walkthroughs.
---

# Why

Resolve model choices and tool arguments through [the repository model policy](../../pstack-models.md).

Explain why code has its current shape using historical evidence. Code shows what an implementation does; commits, pull requests, comments, and tests may explain the constraints and alternatives that shaped it.

## Establish the target

Capture the user's question, relevant files and symbols, user-visible behavior, and recent commits touching the target. Read [the code archaeology playbook](references/sources/code-archaeology.md) for history searches and common pitfalls.

Keep the investigation read-only unless the user separately requests a change. Record unavailable evidence and failed searches. Redact credentials and sensitive payloads.

## Investigate

Read the relevant commit diffs, pull request descriptions and discussions, comments, tests, and repository documents. Follow the history far enough to identify the motivating change. Distinguish direct statements of intent from inference about code mechanics.

For a substantial investigation with delegation available, give an investigator:

- [the investigator prompt](references/investigator-prompt.md)
- [the code archaeology playbook](references/sources/code-archaeology.md)
- the target files, symbols, and initial commit list
- the user's question and any evidence already collected

Use bounded, independent history questions if multiple investigators would improve coverage. Otherwise perform the investigation locally.

## Synthesize

Read [the confidence framework](references/epistemics.md). Separate Direct, Supported, Inferred, Speculative, and Unknown claims. Preserve contradictions and cite the exact commit, pull request, or file location supporting each factual claim.

For delegated investigations, give a separate synthesizer [the synthesizer prompt](references/synthesizer-prompt.md), the complete findings, investigation target, and original question. It may spot-check citations with read-only git or pull request queries. Without delegation, synthesize locally and state any requested independent review that could not run.

## Present

Lead with the explanation and supporting evidence. Include competing explanations and unresolved questions when they matter. State which history searches were performed and how strongly the evidence supports the conclusion. Use only the sections that help answer the question.

If the investigation precedes a fix, finish with the behavior the change must correct and the evidence that would prove it.

## References

- [Code archaeology](references/sources/code-archaeology.md) covers git, pull requests, tests, comments, and repository documents.
- [Investigator prompt](references/investigator-prompt.md) structures evidence collection.
- [Synthesizer prompt](references/synthesizer-prompt.md) guides the final explanation.
- [Confidence framework](references/epistemics.md) defines evidence tiers and phrasing.
