# Finance implementation

Code for core slices 1–8 is implemented and committed locally. Akahu and ChatGPT OAuth still have live acceptance gates that require the owner's configuration. Optional slice 9 remains later work.

- [x] Preserve existing financial records and authentication; use additive schemas.
- [x] Correct classification scope, manual provenance, rollback batching and bank/file source retention.
- [x] Reuse statement account identities; require explicit selection for existing ambiguous duplicates.
- [x] Implement monthly spending, comparable periods, broad groups, transfers, splits, refunds, exact money and visible source/FX coverage.
- [x] Implement complete review-file export, proposal upload, preview, atomic apply, durable receipts, revision checks and undo.
- [x] Implement dated all-asset snapshots, ownership shares, retirement/debt distinctions and sourced country/industry/asset-class views.
- [x] Implement purchase evidence, duplicate review, statement rebasing and atomic fund-switch snapshots.
- [x] Implement read-only Akahu sync, account mapping, pagination, daily polling and quarantined bank corrections; verify sanitized provider fixtures.
- [x] Implement OAuth MCP transport, owner binding, scoped reads/proposals and separately app-approved apply/undo; verify isolated JWT/SDK fixtures.
- [x] Add in-app setup instructions, personal plugin/skill and navigation.
- [x] Review with an independent GPT-6 Astra agent and fix accepted findings.
- [ ] Verify eligible official personal ANZ consent and sampled live balances/transactions after owner configuration.
- [ ] Verify ChatGPT developer-mode OAuth and tools on the owner's actual account after WorkOS Connect configuration.

## Verification

- `pnpm test`: 74 passed, 2 existing tests skipped because local source fixtures are unavailable. The separate lint-plugin suite passed 16 tests.
- `pnpm lint`, `pnpm format:check` and `pnpm build`: passed. Build retains upstream WorkOS deprecation notices; font asset resolution was corrected.
- `pnpm exec convex dev --once`: passed against the configured development deployment. No production deployment or financial-data reset was performed.
- Authenticated T3 browser checks: Spending, Exposure, Updates and Setup guide rendered at desktop and mobile widths without page overflow. Statement coverage defaults to unknown and blocks saving until selected explicitly.
- The actual review download read 573 ledger records across three pages and marked the bundle complete. Exporting did not grant account credentials.
- The authenticated FX refresh stored 144 directional rates, covering published dates from 24 June through 1 October 2026. These are public source rates; no financial transactions or holdings were changed.
- Apply, retry, stale revision, group conflict and undo correctness are tested in isolated Convex fixtures. The authenticated browser also completed upload, preview, apply, page reload, receipt download and undo for a proposal with no changed financial fields. Its receipt has identical before/after state and status undone. One clearly named verification job remains in the history.
- Plugin frontmatter validation passed. The configuration script produced a valid public URL transport file and rejected an HTTP endpoint. The package has not been installed or published.

## Owner setup

Use the signed-in **Setup guide**. Import current ANZ and CommBank history and provide dated statements for Smart funds, Simplicity KiwiSaver and Hostplus. The screenshot remains an undated inventory, not seeded current holdings. Existing duplicate bank records are preserved and flagged; reconcile their identities before relying on recorded net wealth.

The [README](../../README.md) contains exact Akahu server variables, WorkOS Connect audience/scopes, MCP registration and personal plugin commands. Keep credentials on the server. Connections remain disabled until configured and explicitly enabled by the owner.

## Delivery

The [decision trail](decisions.tsv) records choices and evidence. Key local commits:

- `6ffc9b1`, `96896ec`: classification and rollback correctness.
- `06b7fd6`: additive domain models.
- `1b08251`, `a40ccee`: strict checks and formatter baseline.
- `b3b96dc`: reporting, proposal service, portfolio and read-only connections.
- `2833d2f`: statement account identity.
- `41056eb`: fund-switch reconciliation.
- `ccc0618`: screens and in-app setup guide.
- `230db24`: personal plugin, server setup instructions and decision trail.

Independent GPT-6 Astra review confirmed the resolved blockers and the trail's distinctions. Attention remains on live ANZ/ChatGPT acceptance, existing duplicate account identities, dated holdings evidence, and installing the personal plugin. The browser lifecycle was a no-change proposal; financial-change correctness was verified with isolated tests. Public FX rates were updated and one undone verification job remains. Delivery is local.

Public fund-download automation, recursive company overlap, performance reporting and a developer CLI remain optional later work. The complete specification is [the improvement plan](../improvement-plan.html). No remote push has been requested.
