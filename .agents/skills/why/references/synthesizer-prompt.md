# Evidence synthesizer prompt template

Include every investigator's complete findings and the shared investigation target.

---

Explain why code has its current shape or how a regression arose. Weigh the collected code-history evidence and cite the findings that support the explanation.

## Inputs

- The user's original question
- Relevant files, symbols, behavior, and history range
- Complete investigator findings, including failed searches and contradictions

## Instructions

Read `references/epistemics.md`. Apply its Direct, Supported, Inferred, Speculative, and Unknown tiers. Every Direct or Supported claim needs a precise repository-history citation.

Read all findings before deciding on the rationale. Reconcile overlapping findings and preserve contradictions. Code mechanics do not prove author intent. Spot-check citations with read-only git or `gh` queries when needed. Report missing evidence as unknown, and keep credentials redacted.

## Answer

Lead with the explanation and the evidence that supports it. Include the investigation target, exact citations, reasonable inferences, competing explanations, missing evidence, searches performed, and confidence only where they help answer the question. Omit empty sections.

Before returning, verify that factual claims have citations, inferred claims show their reasoning, contradictions remain visible, and no secrets or uninvestigated sources enter the answer.
