# Finance app review and improvement plan

Reviewed on 30 September 2026. The first release should make it easy for Codex to classify the full transaction ledger, then show where the investment portfolio is actually invested. Keep Convex, TanStack Start and the existing import staging. Redesign the finance model where needed, with fresh imports instead of legacy compatibility code.

The chosen classification workflow is an exported review file processed in Codex. An AI service inside the app can wait.

## Portfolio scope

The supplied screenshot identifies Smart USG, UST, EUF, TWF and MDZ, Simplicity KiwiSaver High Growth, Simplicity KiwiSaver Growth, and Hostplus Indexed High Growth. The user confirmed High Growth is the current KiwiSaver fund and that Vanguard investments are held through Smart. Treat the Growth entry as a separate instrument and possible historical holding until a current statement confirms its balance. The screenshot supplies identities, not units or current valuations.

Include Hostplus in the portfolio model and support an AUD statement balance from the start. Automate its underlying holdings after the Smart and Simplicity sources work. Keep retirement balances identifiable so total wealth and accessible investments can be viewed separately.

## Findings in the current app

These are findings from the code review. They have not all been reproduced through a signed-in browser.

A temporary Convex test confirmed an additional rollback bug. A synthetic 30-row investment import committed successfully, but rollback marked the job `rolledBack` with 5 transactions still active. Both bank and investment rollback handlers read the first 25 source rows before filtering out voided rows. On the next batch they reread those same voided rows and stop. The bank variant has the same code pattern but was not separately reproduced. Fix this before depending on rollback for any reimport work. The temporary reproduction was removed after recording the result; it did not touch the deployed database.

| Priority | Finding and evidence                                                                                                                                                                                                       | Consequence                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| First    | `convex/finance.ts`, `updateTransaction`, patches the counterparty default even for `scope: 'transaction'`.                                                                                                                | A one-off correction silently becomes the rule for future imports.                                                  |
| First    | `importCounterpartyClassifications` only updates counterparty defaults. The UI reports imported classifications without applying them to existing transactions.                                                            | An AI-classified file can leave historical spending uncategorized.                                                  |
| First    | `convex/imports.ts`, `suggestLinks`, confirms transfers using opposite amounts on different accounts within three days, without checking currencies or stronger evidence.                                                  | An unrelated expense and receipt can disappear from spending and income.                                            |
| First    | `convex/finance.ts`, `dashboard`, sums bank balances as net worth. It excludes the investment ledger and adds currencies without conversion. Its displayed date is the current date rather than the dates of the balances. | The net worth figure is incomplete and can imply fresher data than it contains.                                     |
| Next     | `src/routes/_authenticated/counterparties.tsx`, `exportClassifications`, exports merchant names, aliases and aggregate counts. It omits transaction examples, decision reasons, uncertainty and reporting treatment.       | Codex lacks the evidence needed for mixed-purpose merchants, transfers, refunds and investment payments.            |
| Next     | `src/routes/_authenticated/transactions.tsx` has account/category filters and individual category dropdowns. Search exists in the backend but is not exposed here.                                                         | No uncategorized queue, bulk review, transaction details, split editor or visible classification history.           |
| Next     | `convex/finance.ts` reads at most 5,000 transactions for merchant statistics and dashboard totals. `listTransactions` filters account/category after paginating the date index.                                            | Totals can be truncated and filtered pages can appear empty while matches remain later in the ledger.               |
| Next     | `convex/investmentImports.ts`, `listTransactions`, returns only the newest 500 rows. The investment screen is an activity table.                                                                                           | There is no complete position calculation, current valuation, asset allocation or fund breakdown.                   |
| Next     | `convex/investmentImportAction.ts`, `parseFundCsv`, records a generic managed fund with no instrument identity. Its account key can come from a transaction-description prefix or filename.                                | Fund switches cannot be represented reliably; account identity can depend on an employer reference or renamed file. |
| Next     | `convex/lib/finance.ts`, `toMinorUnits`, uses floating-point parsing and rounding. `finance-ui.tsx` formats every amount as NZD.                                                                                           | Exact amount parsing and currency-aware reporting need attention before adding AUD superannuation.                  |

Useful foundations already exist: integer bank amounts, original source records, staged imports, duplicate detection, batched commits and rollback, ownership checks, and Convex tests. Preserve those behaviours through the redesign.

## The transaction review workflow

The everyday flow should be Import, Review, Apply, with unresolved decisions kept visible.

1. Import bank files and preserve their raw records. Reuse confirmed merchant aliases and rules, while retaining the source of each classification.
2. Open a Review screen grouped by merchant or description pattern. Sort by unresolved transaction count or money affected. Show representative descriptions, accounts, dates, amounts, existing categories and exceptions.
3. Export a review bundle. Include a short instruction file, category catalogue, merchant groups, and complete paginated transaction data. Small exports can be one JSON file; large exports should use a manifest and numbered chunks so Codex can work through every row.
4. Codex returns a proposals file containing only decisions. Each proposal can set a merchant default, classify explicit transaction IDs, propose an alias merge, propose a split or reporting treatment, or leave an item unresolved with one specific question.
5. Import proposals into a preview. Show the number of affected transactions, before/after categories, explanations, exceptions, stale records and unresolved questions. Apply selected proposals, then record the changes for undo.

The input must include stable IDs, a bundle ID, record revisions, category definitions and examples, signed amounts serialized as decimal strings, currencies, dates, account labels, raw descriptions and existing classification provenance. Merchant examples help triage, but they must not replace the full transaction export. Mask account identifiers and omit authentication credentials.

Allow editing the category catalogue in the app, including definitions and examples that Codex can use. Give unresolved classification one explicit state instead of relying on both a missing category and a seeded Uncategorized category. Show loading, query errors and a completed empty result separately; an empty filtered page should not say that no transactions have ever been imported.

The response must refer to IDs from that bundle and include a rationale and confidence level. Confidence is a review aid, not proof that a category is correct. Omitted items remain unchanged. An unresolved proposal is distinct from an intentional request to clear a category. Do not require Codex to repeat or reorder the entire input document.

Provide explicit actions for this transaction, selected transactions, unclassified matches, and future matching transactions. A transaction override must never change a merchant default. A merchant default must never overwrite a manual override. Broader reclassification should preview exactly what it will replace.

Separate category from reporting treatment. Transfers, investment contributions, refunds, income and expenses need different reporting behaviour. Permit splits that sum exactly to the transaction amount. A supermarket default is useful; an Amazon default needs transaction exceptions. Transfers and refunds should be reviewable suggestions until confirmed by the user or a sufficiently specific confirmed rule.

Store proposals separately from accepted decisions. Keep batch progress on the server so applying a large file survives navigation and interrupted requests. Check revisions again when applying; do not overwrite edits made after export. Reject unknown IDs, cross-owner references, duplicate decisions and invalid split totals. Make retrying a batch idempotent. Undo restores the recorded previous values and reports conflicts with subsequent edits.

Add a project classification skill after this file contract is implemented. It should tell Codex how to read the bundle, use the category catalogue, produce validated proposals and list unresolved questions. A small local validator should check the response before it is imported. That is the useful automation for the first release.

## A portfolio model that supports real holdings

Keep personal ownership separate from public fund composition. Owning units of Smart TWF does not mean the user directly owns units of Vanguard VT. VT is a child in TWF's breakdown.

| Data                                | Purpose                                                                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Instruments and identifiers         | Stable identity for Smart ETFs, Vanguard/iShares child funds, Simplicity funds, companies and other assets. Store exchange plus ticker, ISIN or provider ID where available. Screenshot FundNZ codes are aliases until mapped to official identifiers. |
| Investment accounts                 | Separate Smart, KiwiSaver and Australian super, with currency and retirement restrictions.                                                                                                                                                             |
| Investment activity                 | Typed buys, sells, contributions, withdrawals, dividends, reinvestments, tax, fees, fund switches and corporate actions, linked to account and instrument. Preserve provider descriptions.                                                             |
| Position snapshots                  | Statement holdings or explicit opening balances on a given date. Needed when imported history is incomplete.                                                                                                                                           |
| Prices and exchange rates           | Dated market prices, fund unit prices, manual valuations and currency conversion, each with source and timestamp.                                                                                                                                      |
| Fund snapshots and constituent rows | A dated fund composition, with child instruments, weights, metadata and the original source document. Keep constituent rows in a separate table.                                                                                                       |
| Import and refresh jobs             | Durable status, progress, validation issues and retry state for private imports and public provider refreshes.                                                                                                                                         |

Calculate positions from a statement snapshot plus subsequent activity, or a complete activity history. Reconcile against provider running balances. Do not sum the latest 500 transactions or assume an incomplete history starts at zero. A Simplicity export without a fund column must ask which fund and account it belongs to. A file spanning a fund switch requires a switch date or separate mappings.

Use exact decimal arithmetic for units, prices and weights. Retain integer minor units for money and round at documented valuation boundaries. Model activity and job states as discriminated unions and derive TypeScript types from the Convex validators. Validate external files once at the boundary.

The first portfolio screen should show each holding's units or statement balance, value, valuation date, source and account. Use NZD as the initial reporting currency, while displaying Hostplus's original AUD balance and the conversion date. Missing prices or balances remain unknown. A partial total must say which holdings are excluded. Show cash, investments, retirement assets and liabilities separately before combining net worth.

Link bank investment payments to investment contributions when possible, so they are not counted twice. Employee KiwiSaver deductions must not be deducted from imported net salary again. Employer contributions belong in the investment activity view without becoming ordinary bank income.

## Getting the underlying investments

Provider research supports the following starting routes. The exact current files and automated download methods still need a short implementation spike; this review did not establish stable public APIs for every provider.

| Holding                          | Starting route                                                                                          | First data source                                                                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smart USG                        | Smart wrapper into Vanguard Growth ETF, VUG. Confirm the latest disclosure before enabling the mapping. | Smart disclosure and Vanguard US full holdings. Smart's [USG distribution announcement](https://www.nzx.com/announcements/442385) identifies the underlying fund.                                                                                                                                                                |
| Smart EUF                        | Smart wrapper into Vanguard FTSE Europe ETF, VGK.                                                       | Smart disclosure and Vanguard US full holdings. Smart's [regional fund article](https://www.smartinvest.co.nz/news-and-insights/beyond-america-broadening-your-global-portfolio-with-smarts-regional-funds) identifies the Europe and Total World child funds.                                                                   |
| Smart TWF                        | Smart wrapper into Vanguard Total World Stock ETF, VT.                                                  | Smart disclosure plus Vanguard VT full holdings. Preserve Smart cash and other residual positions.                                                                                                                                                                                                                               |
| Smart UST                        | Smart wrapper into iShares S&P 500 Information Technology Sector UCITS ETF, with NZD hedging.           | Smart disclosure and iShares/BlackRock holdings for the exact share class. Smart's [launch announcement](https://assets.ctfassets.net/m5mydry9e35f/615ZVvfyAJYBA6IRPKquc6/ce5572f65c25317c93b4e422a01a182d/Smart_launches_four_new_ETFs_and_announces_a_new_strategic_alliance_with_iShares.pdf) identifies the underlying fund. |
| Smart MDZ                        | NZ share exposure from the actual Smart holdings.                                                       | Smart's full portfolio disclosure. No Vanguard mapping should be inferred.                                                                                                                                                                                                                                                       |
| Simplicity KiwiSaver High Growth | Actual Simplicity holdings and underlying wholesale funds where disclosed.                              | Simplicity's fund documents and fund-specific investment calculator, with Disclose files as a fallback.                                                                                                                                                                                                                          |
| Simplicity KiwiSaver Growth      | A separate fund and historical position if confirmed.                                                   | Its own dated holdings and unit prices. Never substitute High Growth composition.                                                                                                                                                                                                                                                |
| Hostplus Indexed High Growth     | Hostplus's specific investment option.                                                                  | Manual AUD statement balance first, then its [investment holdings downloads](https://hostplus.com.au/members/our-products-and-services/investment-options/investment-holdings-by-investment-option).                                                                                                                             |

Use Vanguard's US fund sources for the US-listed child ETFs, rather than assuming Vanguard Australia products have identical holdings. Its fund pages expose full-holdings export controls, but download automation must be verified for VUG, VGK and VT individually.

Simplicity's [High Growth KiwiSaver page](https://simplicity.kiwi/kiwisaver/funds/kiwisaver-high-growth-fund) links all investments, unit price history and fund updates. It says international portfolio management moved from Vanguard to DWS on 28 April 2023. Use Simplicity's actual portfolio rather than approximating it with a Vanguard index. Keep target allocation separate from observed holdings.

Simplicity's [investment fund calculator](https://simplicity.kiwi/calculators/investment-funds/where-in-the-world-is-my-money) labels its data date and excludes cash equivalents and currency hedges. Check the KiwiSaver calculator's coverage separately. A calculator breakdown cannot automatically be treated as a complete portfolio. The [Disclose guidance](https://disclose-register.companiesoffice.govt.nz/help-centre/managed-fund-offers/filing-full-portfolio-holdings/) describes six-monthly full-holdings filings, so those files are historical snapshots rather than live positions.

Start with official downloadable CSV/XLSX sources, then public structured data, then deterministic PDF extraction if necessary. Include manual source-file upload immediately so a provider website change does not disable the feature. Do not require provider login credentials for public fund composition. Personal units still come from statements or imports.

For each provider, implement a small adapter that discovers, downloads, parses and validates a snapshot. Store its source URL, raw file, hash, parser version, publication/holdings dates and coverage. Stage all constituent rows and publish a pointer only when validation completes. A failed refresh keeps the last successful snapshot and displays the failure. Use bounded Convex actions for network work and internal mutations for writes. Scheduled refreshes should retry idempotently and avoid simultaneous publication for the same fund.

Poll according to each source's actual publication cadence. Prices may update on business days; composition may update monthly, quarterly or less often. Display those dates separately. Historical views must select composition and prices known at the requested date. Never apply today's holdings to a historical chart without an explicit estimate label.

## Calculating exposure and overlap

For each holding, multiply its portfolio value by every fund weight along the path to the underlying asset. Sum all paths to a company across Smart funds, KiwiSaver and other holdings.

For example, a hypothetical NZ$10,000 TWF position with a 99% VT allocation and a 4% Apple weight in VT gives NZ$396 of Apple exposure. Both percentages are illustrative. Actual calculations use the stored dated disclosures.

Use security identifiers to match holdings and a separate issuer identity to combine share classes when showing company totals. Keep security detail available. Add country, sector and asset class only when the source supports them. A US-listed fund is not automatically US company exposure, and an Irish-domiciled ETF is not Irish economic exposure. Keep currency denomination and currency hedging separate.

Stop at an unresolved child fund and report its value as unresolved. Detect cycles. Preserve cash, derivatives, liabilities and disclosed signed weights; holdings can exceed 100% of net assets with offsetting positions. Do not normalize incomplete holdings to 100% or silently remove those offsets. Sector classifications from different providers need an explicit mapping, with unknown classifications retained.

The portfolio should answer:

- How much is held in each fund and account?
- Which companies account for the largest combined exposure?
- How much is in each country, sector and asset class?
- Which funds contribute to a company's exposure?
- How much of the portfolio has a resolved breakdown, and how old are its sources?
- What is accessible now, and what is in KiwiSaver or super?

Start with a holdings table, allocation bars and a searchable company table. Clicking a company should show every contributing fund and its calculation. Add a map only if it helps answer a question the table cannot.

## Implementation order and completion checks

| Slice | Work                                                                                                                                                                                                                                 | Done when                                                                                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Correct transaction/default scope, classification provenance, transfer review and accurate report labels. Fix baseline lint, validate monetary parsing, and use indexed queries or maintained summaries instead of silent read caps. | One-off edits cannot change future defaults; applying merchant defaults can explicitly update history; transfer suggestions do not silently hide activity; totals state their currency and coverage.                               |
| 2     | Implement the complete Codex review bundle, proposals, preview, durable apply/undo job, review queue and classification skill.                                                                                                       | A full ledger can be exported in chunks, classified in Codex, imported, reviewed and applied without losing manual edits. Retries and an interrupted batch do not duplicate changes. Every unresolved transaction remains visible. |
| 3     | Add instrument identity, statement/opening positions, fund-switch mapping, exact calculations, manual prices and AUD/NZD valuation.                                                                                                  | Smart and KiwiSaver positions reconcile to statements. Hostplus can be recorded. Partial history and unknown values are shown clearly. Net worth includes the portfolio once.                                                      |
| 4     | Prove one complete source snapshot for each provider path, then import all current owned funds. Build adapters, raw-source retention and manual upload.                                                                              | TWF to VT, USG to VUG, EUF to VGK, UST to iShares, MDZ and Simplicity have verified identities and dated snapshots. Unknown constituents and cash/hedge exclusions are accounted for.                                              |
| 5     | Add recursive exposure, company aggregation, source drilldown and concentration/overlap views.                                                                                                                                       | Hand-calculated fixtures reconcile; shared companies sum correctly; nested funds, incomplete data, signed weights and different source dates display correctly.                                                                    |
| 6     | Add scheduled refreshes, historical snapshots, Hostplus composition and investment performance.                                                                                                                                      | A failed refresh preserves published data. Provider layout changes are tested. Performance separates contributions from gains and states whether it is before or after tax/fees.                                                   |

Build each slice as a focused change and run the relevant checks. Tests should cover the financial rules and import/review contracts, using Convex's actual test helpers and sanitized provider fixtures. Verify one real provider download for every enabled adapter and compare imported positions to statements. Fixtures alone do not prove live downloads or signed-in workflows.

Retain ownership checks and authentication. Use fresh imports for the redesigned schema; no legacy adapters or historical-data migration is required. Do not reset the current deployment as part of this planning task. Document the later reset/reimport procedure before running it.

Defer in-app AI, live trading, bank credential aggregation, tax filing, advanced return attribution and a broad cosmetic redesign. They do not unlock the selected workflow.

## Review verification and remaining limits

- `pnpm test` passed 12 tests, with 2 skipped across 4 test files. The optional local-export tests did not run in this invocation.
- `pnpm lint` reached Oxlint after TypeScript and failed with 30 errors and 10 warnings, mainly in UI components. These are baseline findings.
- `pnpm build` and `pnpm exec tsc -p convex/tsconfig.json` passed.
- Initially started the frontend on `http://localhost:3010`. The shared Power BI gateway occupied port 3000 with two active worktrees registered. After the user confirmed the WorkOS callback and authorized a temporary pause, stopped that gateway and started finance on `http://localhost:3000`. The Power BI worktree servers stayed running. The local callback remains on port 3000.
- Browser inspection reached the welcome/sign-in flow. Signed-in transaction, import and portfolio QA is still pending.
- Public provider research established source routes and several fund identities. Automatic download contracts, complete per-fund coverage and actual portfolio exposure are still unverified.
- Copied the TypeScript best practices and unslop skills from the Power BI app, including the two TypeScript principle dependencies and its examples. Linked them in `AGENTS.md`.

The first implementation deliverable should be slices 1 and 2. They directly solve the classification problem and produce a review bundle Codex can process before the portfolio work expands.

Include the rollback fix in slice 1. Its regression check must import more than one batch, roll back every active source and transaction, and verify that the completion status agrees with the data. Cover both ledgers, including transactions shared by more than one import.
