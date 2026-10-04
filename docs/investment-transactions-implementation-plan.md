# Investment transactions: implementation plan

## Goal

Record purchases of assets as a movement from cash to an investment asset. Show the cash outflow in the journal and cash balance, while keeping it out of expense totals, spending charts, and budgets.

## Current state

- Manual transactions support only `income` and `expense`; `zap-service.js` rejects other types.
- `amount` is stored in sats. `fiatAmount` and `currency` are optional snapshots for display. There are no bank/wallet accounts or asset holdings. A native `1,000,000 LAK` BCEL purchase cannot yet be represented accurately by the current model.
- `monthTotals`, `allTimeBalance`, and `spentByCat` in `js/utils/ui.js` treat every non-income record as an expense. Similar assumptions exist in Money filters, Settings, Journal, and transaction rows.
- Category `investments` currently has type `income`. Existing transactions using it must retain their original meaning until explicitly reclassified.

## Accounting rules to implement

Use transaction types `income | expense | transfer | investment | investment_return | adjustment` in the first release. Keep `debt` and realized profit/loss for a later, separately specified release. `investment_return` is **return of principal**, not investment income. Record interest, dividends, and realized gains as `income` with an investment-related category and asset link; record realized losses as an explicit loss/adjustment with a defined effect on holdings. Do not infer profit from the amount withdrawn.

| Operation | Cash account | Asset holding | Income | Expense |
| --- | ---: | ---: | ---: | ---: |
| Income | + | 0 | + | 0 |
| Expense | − | 0 | 0 | + |
| Transfer between cash accounts | − from, + to | 0 | 0 | 0 |
| Investment purchase | − | + cost basis/quantity | 0 | 0 |
| Return of principal | + | − cost basis/quantity | 0 | 0 |
| Investment gain/dividend | + if paid to cash | 0 or per sale | + | 0 |

Show dashboard values with distinct names: **Income**, **Expenses**, **Invested**, **Returned principal**, **Net cash flow**, and **Cash balance**. `Net cash flow = income − expenses − invested + returned principal` for the selected period, with transfers netting to zero across all cash accounts. Cash balance is the sum of account balances, including opening balances and adjustments. It must not be labeled net worth; invested cost basis or market value belongs in a separate assets view.

## Delivery tasks

1. **Data contract and migration.** Define accounts (`id`, `name`, `currency`, `openingBalance`), assets (`id`, `name`, `subtype`, `symbol`), and transaction fields (`type`, `amount`, `currency`, `fromAccountId`, `toAccountId`, `assetId`, `assetQuantity`, `occurredAt`, `description`). Use positive amounts with type-specific directions. Preserve owner, IDs, timestamps, offline storage, and Nostr sync semantics. Decide and document decimal precision per currency and asset. Keep existing sats records as legacy account transactions without converting historical amounts or recategorizing `investments` income automatically.
2. **Money rules.** Add one shared transaction classifier/aggregation module. Calculate income, expense, invested, returned principal, account balances, and asset positions explicitly by type. Reject unknown types rather than treating them as expense. Update `js/utils/ui.js`, `js/services/zap-service.js`, and `js/services/budget-service.js`; budgets count `expense` only. Keep Lightning zap imports mapped to their existing income/expense types.
3. **Entry and validation.** Extend `js/components/tx-modal.js` to select Investment and Return, cash account, asset, subtype (`stock`, `bitcoin`, `crypto`, `fund`, `gold`, `business`, `property`), native currency amount, and optional quantity. Validate positive finite amounts, required account/asset, supported currency, and sufficient asset quantity for a return/sale. Add account and asset creation or selection flows. Avoid using a live BTC/LAK rate to rewrite a historical LAK transaction.
4. **Journal and reports.** Update `js/components/tx-row.js`, `js/pages/transactions.js`, `js/pages/dashboard.js`, `js/pages/journal.js`, `js/pages/settings.js`, and sidebar summaries. Render a purchase as `Bitcoin Investment`, `−1,000,000 LAK`, `BCEL → Bitcoin`; show the asset and account in detail/edit views. Add an Investment filter. Spending donut, spending search/filter, and budgets exclude investments and transfers. Add localized labels in all supported locales.
5. **Compatibility and sync.** Update IndexedDB schema only if new stores are required; migrate without deleting old data. Ensure account, asset, and new transaction fields survive local reload, outbox, Nostr publish/merge, edit, and delete. Establish how deletion reverses account and asset projections. Keep old records readable on fresh devices.
6. **Verification.** Add focused tests for arithmetic, multi-account transfers, native LAK amounts, legacy sats records, return of principal versus gain, mixed-type reports, edit/delete, and sync round trip. Run `npm test` and manually check offline creation/reload and the example below.

## Acceptance example

Given BCEL cash opening balance `5,000,000 LAK`, expenses `2,000,000 LAK`, and a Bitcoin purchase of `1,000,000 LAK` on 4 Oct 2026:

- The Journal shows `Bitcoin Investment`, `−1,000,000 LAK`, `BCEL → Bitcoin`.
- Expenses and budget spending show `2,000,000 LAK`; Invested shows `1,000,000 LAK`.
- BCEL cash balance is `2,000,000 LAK`; the Bitcoin holding has `1,000,000 LAK` cost basis plus its recorded quantity.
- If the same `5,000,000 LAK` is entered as period income instead of opening balance, period net cash flow is `2,000,000 LAK`. Opening balances do not count as income.

## Release boundary

This release tracks investment cost basis and cash movements. Market price, unrealized gain/loss, tax lots, fees, debt accounting, and multi-currency conversion between accounts require separate rules and are outside this task unless explicitly scoped in.
