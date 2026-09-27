# Budget Watch — Feature Plan

Status: complete (Phases 1-4, plus period grouping) — F1-F5 resolved, open questions decided
Owner: unassigned
Related: `js/components/rail.js`, `js/services/budget-service.js`,
`tests/budget.test.js`, `docs/architecture.md`

## 1. What it is

"Budget watch" is the top card in the right-hand rail (visible on wide desktop,
`≥1360px`). It is a compact, read-only snapshot of the user's most-used budgets.

- Renderer: `js/components/rail.js:34-61` (class `Rail`, mounted in `js/app.js:128`).
- Data source: `budgetService.getAllBudgetProgress()` (`js/services/budget-service.js:278`).
- Markup: `.bud-row` / `.bud-info` / `.bud-top` / `.btrack` / `.bfill`
  (`css/components.css:583-624`).
- Empty state: `<p class="muted-p">No budgets yet.</p>`.

It is the compact sibling of the richer budget UI: `dashboard.js` shows the top 3
budgets, `transactions.js` has a budget section, and `budgets-modal.js` sets
monthly per-category limits.

## 2. Behavior spec (current)

| Aspect | Current behavior |
| --- | --- |
| Selection | Active budgets only (`isActive` and no past `endDate`). Rows are chosen most-urgent-first (status severity, then `percentage` desc); when several periods are in use each period is capped at 2 rows, total ≤4 (`rail.js:30-58`, `budget-service.js:279-282`) |
| Grouping | Rows render under a period header (`daily` → `weekly` → `monthly` → `yearly`) so percentages are comparable within a group (`rail.js:54-58,75-83`) |
| Row label | `categoryService.getCategory(categoryId)?.name` → fallback `categoryMeta().label` (`rail.js:_budgetRow`) |
| Percent | Service returns the real, unclamped `percentage` (`budget-service.js:243`); the rail clamps the bar to 100% but shows the real rounded `%` (`rail.js:_budgetRow`) |
| Bar color | `danger` → `var(--out)`, `warning` → `var(--zap)`, else category color (`rail.js:_budgetRow`) |
| Status thresholds | Per-budget `alertThreshold` is the warning point with the global `0.2` gap above it for danger (capped at 100%); global `0.7`/`0.9` are only defaults (`budget-service.js:18-21, _getThresholds`) |
| Period window | `_getPeriodRange(period, startDate, endDate, now)` (`budget-service.js:368-414`); recurring budgets measure the current period, `startDate` is only a lower bound |
| Spent | Sum of `expense` transactions in the category within the period window (`budget-service.js:232-240`) |
| Persistence / sync | `budgets` object store; outbox entity `budget`; Nostr `kind 30078` (`docs/architecture.md`) |
| Ownership | Per-owner via `filterOwned` / `currentOwner` (`budget-service.js:37`); reloaded on login/logout (`app.js:127,138`) |

## 3. Audit findings

Ordered by impact. Severity: **High** = wrong/stale data shown to the user.

### F1 — High: the card does not react to budget changes — RESOLVED
Fixed in `rail.js:mounted()`: the rail now `watchEvent`s `BUDGETS_LOADED`,
`BUDGET_CREATED`, `BUDGET_UPDATED`, `BUDGET_DELETED` and re-renders. This also
covers the first-paint issue, since `budgetService.init()` re-emits
`BUDGETS_LOADED` after `_mountLayout()`. Chosen option B (event subscription)
over adding a `budgets` store slice. Note: `Events.BUDGETS_UPDATED`
(`event-bus.js:130`) still exists but is emitted by nothing.

Original finding: `Rail` subscribed only to `transactions` and `price`, while
budget CRUD and load emit events that nothing on the rail listened to:
`BUDGETS_LOADED` (`budget-service.js:39`), `BUDGET_CREATED` (`:126`),
`BUDGET_UPDATED` (`:169`), `BUDGET_DELETED` (`:208`).

Two user-visible effects:
1. Creating/editing/deleting a budget did not refresh the card until a
   transaction or price update happened to re-render the rail.
2. `_mountLayout()` runs at `app.js:77`, before `budgetService.init()` at
   `app.js:82`, so the first paint was always the empty state.

Root cause: budgets were not in the reactive store.

### F2 — High: recurring budgets measure the wrong period — RESOLVED
Fixed in `_getPeriodRange` (`budget-service.js:368`): when `endDate` is null the
window is computed from "now" for daily/weekly/monthly/yearly, with `startDate`
used only as a lower bound. Covering tests in `tests/budget.test.js` (month
rollover, December, week boundaries, startDate clamp, explicit endDate).

### F3 — Medium: per-budget threshold is ignored — RESOLVED
`getBudgetProgress` now resolves thresholds via `_getThresholds(budget)`
(`budget-service.js`): the budget's own `alertThreshold` is the warning point,
danger keeps the global `0.2` gap above it (capped at 100%), and the global
`0.7`/`0.9` pair is only the default when a budget has no threshold.
`getBudgetAlerts`/`getStats` derive from `getBudgetProgress`, so they follow
automatically. Tests in `tests/budget.test.js`.

### F4 — Medium: silent dead component — RESOLVED
`js/components/budget-progress.js` was imported nowhere and used patterns that
did not match the codebase (`this.addEventListener(...)`, `utils/format.js`).
It was deleted, along with its unused CSS (`.budget-*`, `.summary-*`,
`.progress-bar*`, `.detail-row`, `.create-budget-btn`), its precache entry in
`service-worker.js`, and the now-unused `Events.BUDGET_CLICKED`.

### F5 — Low: mixed periods and clamped percentage — RESOLVED
The rail now ranks by status severity first (danger, then warning, then
on-track), so an at-risk budget cannot be pushed off the card by a low daily
one, and groups rows under a period header so percentages are comparable
(`daily` → `weekly` → `monthly` → `yearly`). When several periods are in use
each period contributes at most 2 rows (total ≤4), so one period cannot fill
the card and hide the others.
`getBudgetProgress` returns the real, unclamped `percentage`, and the rail shows
that real figure while still clamping the bar to 100%, so "at limit" and "far
over" are distinguishable.

## 4. Proposed plan

### Phase 0 — Decide direction (no code)
- [x] Keep the watch visually as-is (do not adopt `budget-progress.js` yet).
- [x] F1 fix option B: the rail subscribes to budget events (no `budgets`
      store slice).

### Phase 1 — Make the card trustworthy (F1, F2) — DONE
- [x] F1: `rail.js` `watchEvent`s `BUDGETS_LOADED` / `BUDGET_CREATED` /
      `BUDGET_UPDATED` / `BUDGET_DELETED` and re-renders.
- [x] F2: when `endDate` is null, compute the window from "now" for
      daily/weekly/monthly/yearly; `startDate` is only a lower bound.
- [x] Tests in `tests/budget.test.js` for `_getPeriodRange` (month rollover,
      December, week boundaries, startDate clamp, explicit endDate) and status
      classification through `getBudgetProgress`.

### Phase 2 — Correct thresholds + ranking (F3, F5) — DONE
- [x] Classify status from the budget's own `alertThreshold` via
      `_getThresholds` (global pair only as the default); `getBudgetAlerts` /
      `getStats` follow since they derive from `getBudgetProgress`.
- [x] Rank the watch by status severity, then utilization, and tag each row
      with its period so percentages are comparable.
- [x] Return the real (unclamped) percentage; show it in the rail while keeping
      the bar clamped to 100%.

### Phase 3 — Consolidate the budget UI (F4) — DONE
- [x] Chose `budgets-modal.js` as the editor and deleted the dead
      `budget-progress.js` plus its unused CSS, precache entry, and the
      unused `Events.BUDGET_CLICKED`.

### Phase 4 — Polish (optional) — DONE
- [x] Open the budget editor from the card: a "Manage" button in the card head
      when budgets exist, and a "Set a budget" CTA in the empty state, both
      reused from `budgets-modal.js` via the rail's click delegation.
      Deviation: individual rows are not tappable because the only editor
      (`budgets-modal.js`) is monthly-scoped, so per-row taps would be
      misleading for daily/weekly/yearly budgets — a card-level entry is used
      instead.
- [x] Narrow-screen behavior documented: the rail is `display: none` by default
      and shown at `≥1360px` (`css/layout.css:300,465`), noted in the
      `rail.js` module header.

## 5. Test plan

Automated coverage for the Phase 1 cases lives in `tests/budget.test.js`
(`npm test`). The remaining rows are manual.

| Case | Expected | Coverage |
| --- | --- | --- |
| Create budget while on dashboard | Rail card updates without a transaction | manual (event wiring) |
| Reload with budgets, zero transactions | Card shows budgets, not empty state | manual (event wiring) |
| Monthly budget created last month | Spent reflects the current month | automated |
| Budget with 50% threshold at 60% spent | Marked warning | automated |
| Budget with default threshold at 60% spent | Still on-track | automated |
| Budget spent 150% of limit | Real 150% shown, danger | automated |
| Guest → login | Budgets re-scope and re-render | manual |
| Empty state "Set a budget" | Opens `budgets-modal.js` | manual |
| Budgets in 2+ periods | Grouped by period, ≤2 rows per period | automated (`groupBudgetWatch`) |

## 6. Open questions

1. Should the watch rank by percentage or by absolute remaining sats?
   Decided: status severity first, then utilization. Revisit if users prefer
   absolute remaining.
2. Should over-budget entries be pinned first regardless of slice order?
   Decided: yes — danger entries sort first.
3. Is `alertThreshold` intended to be per-budget or global? The UI lets users
   pick it, so writing it and ignoring it looks unintentional.
   Decided: per-budget; global `0.7`/`0.9` are only defaults.
4. Should the watch group rows into period sections once more than one period is
   in use?
   Decided: yes — grouped under period headers, most-urgent-first within each
   group, with a 2-rows-per-period cap when several periods are present.
