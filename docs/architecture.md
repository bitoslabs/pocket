# ZapJournal — Architecture Documentation

## Overview

ZapJournal is a local-first Progressive Web App (PWA) built with **pure HTML, CSS, and JavaScript** (ES modules, no build step). It is a private journal and Lightning-sats tracker that works **offline** and **without login**, and syncs to Nostr when an account and relays are available.

The guiding principle is **local-first**: every action is written to the local database first and shown immediately. Nostr is a sync/backup target, not a requirement.

## Architecture Layers

```
┌─────────────────────────────────────────────────┐
│                 Presentation                    │
│  (Pages, Components, Router)                    │
├─────────────────────────────────────────────────┤
│                 Application                     │
│  (Services, Outbox, Sync, State, Event Bus)     │
├─────────────────────────────────────────────────┤
│                Infrastructure                   │
│  (IndexedDB/LocalStorage, Nostr, Crypto, price) │
└─────────────────────────────────────────────────┘
```

## Directory Structure

```
/bitos-pure-web-app/
├── index.html              # Entry point, loader, SW registration
├── manifest.json           # PWA manifest
├── service-worker.js       # Offline asset cache (relative paths)
├── package.json            # npm scripts (node --test, icon generation)
├── assets/icons/           # Generated PWA icons (icon-<size>.png)
├── scripts/
│   ├── check-precache.mjs  # Precache/import integrity (`npm run check`)
│   └── generate-icons.mjs  # Regenerates the icon set (`npm run icons`)
├── css/
│   ├── variables.css       # Design tokens
│   ├── base.css            # Reset & typography
│   ├── layout.css          # Grid & flexbox, topbar, sync chip
│   └── components.css      # UI components
├── js/
│   ├── app.js              # Main orchestrator / service wiring
│   ├── config.js           # Centralized config (frozen)
│   ├── router.js           # SPA routing
│   ├── core/
│   │   ├── account.js      # Owner scoping (pubkey vs 'guest')
│   │   ├── event-bus.js    # Pub/sub + Events constants
│   │   ├── state.js        # Reactive state store
│   │   ├── component.js    # Base component class
│   │   └── theme.js        # Dark/light + accent color
│   ├── services/
│   │   ├── storage-service.js      # IndexedDB (+ LocalStorage fallback)
│   │   ├── auth-service.js         # NIP-07 / nsec / generate
│   │   ├── nostr-service.js        # Relay pool, publish (OK acks), subscribe
│   │   ├── outbox.js               # Durable queue of local mutations
│   │   ├── sync-service.js         # Push/pull/merge engine + guest claim
│   │   ├── zap-service.js          # Zap receipts + manual ledger
│   │   ├── journal-service.js      # Local-first encrypted journal
│   │   ├── category-service.js
│   │   ├── budget-service.js
│   │   ├── recurring-service.js
│   │   └── price-service.js        # BTC ⇄ fiat (multi-currency, cached)
│   ├── utils/
│   │   ├── dom.js, format.js, icons.js, ui.js
│   ├── components/
│   │   ├── header.js, sidebar.js, tabbar.js, rail.js, lock.js
│   │   ├── modal.js, toast.js, quick-add.js, tx-modal.js
│   │   ├── journal-composer.js, budgets-modal.js, login-modal.js
│   │   ├── transaction-form.js, category-manager.js
│   └── pages/
│       ├── dashboard.js, transactions.js, journal.js, settings.js
├── tests/
│   ├── account.test.js     # Owner scoping
│   ├── money.test.js       # Balance & month totals
│   ├── outbox.test.js      # Queue coalescing
│   ├── price.test.js       # Sats ⇄ fiat conversion
│   ├── sync.test.js        # Event building
│   └── sync-merge.test.js  # Merge / LWW / claim
└── docs/
    └── architecture.md     # This file
```

## Local-first data model

### Owner scoping

Local storage is partitioned by an `owner` field so a guest workspace and any number of accounts can share one device without mixing or leaking data (`js/core/account.js`):

- `owner = pubkey` for a logged-in account, `owner = 'guest'` when logged out.
- `ownerVisible(record, owner)`:
  - guest: only records with `owner === 'guest'`.
  - account: records with the same `owner`, plus **legacy records with no `owner`** (never shown to guests).
- Services load only records visible to the current owner; `app.js` reloads them on login/logout.

### Storage

`storage-service.js` uses IndexedDB with a LocalStorage fallback. Object stores: `transactions`, `journal`, `events`, `cache`, `categories`, `budgets`, `recurring`, `outbox`, `meta`. Schema is upgraded in place (no destructive delete); `config.storage.dbVersion` is `3`.

Notable LocalStorage keys: `nostr_user`, `nostr_relays`, `app_theme`, `app_btc_rates`, `app_currency`, `app_show_fiat`, `app_rate_source`, `app_manual_rate`, `sync_cursor_<pubkey>`, `auth_privkey`.

## Offline-first sync

### Outbox (`services/outbox.js`)

Every create/update/delete on a synced entity appends an entry to the `outbox` store:

```js
{ entity, entityId, op: 'upsert'|'delete', owner, payload, updatedAt,
  state: 'pending'|'done'|'failed', attempts, nextAttemptAt, lastError }
```

Repeated edits to the same record coalesce. Entries survive reloads and are replayed later.

### Sync engine (`services/sync-service.js`)

- **Push:** pending entries for the current account are built into signed events and published. A publish is only marked `done` when at least one relay acknowledges it via `OK` (`nostr-service.publish` waits per-relay with `config.relays.publishTimeout`).
- **Backoff:** failures get `nextAttemptAt` (5s doubling, capped at 5m). After 8 attempts an entry is parked as `failed`. `retryNow()` clears backoff and retries.
- **Pull:** subscribes with `since = sync_cursor_<pubkey>` and merges remote records, then advances the cursor on `EOSE`.
- **Merge:** last-write-wins by `updatedAt`; tombstones delete locally.
- **Triggers:** `online`/`offline`, relay `CONNECTION_CHANGED`, `OUTBOX_CHANGED` (debounced), `AUTH_LOGIN`, and app start.
- **Claim on login:** all `owner:'guest'` records are reassigned to the account and queued, then published automatically.

### Nostr event mapping

- **Finance records** (transaction, budget, category, recurring): NIP-78 app-data, `kind 30078` parameterized-replaceable with `d = "zapjournal:<entity>:<id>"` and an `app` tag; content is NIP-04 self-encrypted. Replaceable events make re-publishing idempotent; deletes publish a tombstone record.
- **Journal:** encrypted NIP-78 app-data, `kind 30078` with `d = "zapjournal:journal:<id>"`. Because the record is replaceable, edits are idempotent upserts and deletes are tombstones — the same model as finance data. Legacy entries published as self-DM `kind 4` are still read and reconciled (the `client` tag dedupes your own echoes).
- Zap receipts (`kind 9735`) remain inbound-only.

### Relays (`services/nostr-service.js`)

WebSocket relay pool with reconnect using capped exponential backoff (never permanently gives up). The relay list is persisted under `nostr_relays` and managed from Settings (`savedRelays`, `addRelay`, `removeRelay`).

## Guest mode

- Guests can use the whole app: dashboard, money, budgets, categories, recurring, journal, and the sats/LAK converter. Everything is stored locally with `owner:'guest'` and queued.
- Guest journal entries are stored **unencrypted on the device** until the account is connected, when they are claimed, encrypted, and published.
- Status is surfaced as "Local only" in the header and a Sync card in Settings.

## Core patterns

### Event bus

```js
import { eventBus, Events } from "./core/event-bus.js";
eventBus.emit(Events.AUTH_LOGIN, { user });
eventBus.on(Events.OUTBOX_CHANGED, ({ pending }) => {});
```

Sync-related events: `OUTBOX_CHANGED`, `SYNC_STARTED`, `SYNC_DONE`, `SYNC_ERROR`, `CONNECTION_CHANGED`.

### Reactive state

```js
import { store } from "./core/state.js";
store.set("transactions", list);
store.subscribe("sync", (s) => {});
```

`store` holds `user`, `isAuthenticated`, `transactions`, `journal`, `categories`, `price`, `sync`, and relay state.

### Components

```js
class MyComponent extends Component {
  template() { return "<div>...</div>"; }
  mounted() { this.watchStore("transactions", () => this.render()); }
  bindEvents() { /* handlers */ }
}
```

## PWA / offline

- `service-worker.js` precaches the full module graph (relative paths, so it works under a sub-path). Navigation uses the network when available and falls back to the cached `index.html` offline. App assets are cache-first within each release. The deploy script hashes published files into the worker cache name so a changed release replaces the old cache.
- External resources (`nostr-tools` from a CDN, Google Fonts) are intentionally not cached by the SW. `nostr-tools` is required for signing/encryption, so offline authentication needs a cached/self-hosted copy.
- IndexedDB persists all local data across offline reloads.
- PWA icons are generated with `npm run icons` (`scripts/generate-icons.mjs`, dependency-free PNG writer); `icon-192`/`icon-512` are precached.

## Authentication

- NIP-07 browser extension (Alby, nos2x), `nsec` import, or a generated account (`auth-service.js`).
- Signing/encryption use a locally stored key when present, otherwise the NIP-07 extension.

## Design system

CSS design tokens: `--color-primary` (Bitcoin orange), `--space-*`, `--radius-*`, `--transition-*`, plus dark/light themes and an accent color (`core/theme.js`).

## Running

```bash
npx serve .
# or
python -m http.server 8000
```

Open `http://localhost:8000`. A PIN lock is optional and off by default.

## Testing

Pure/browser-independent logic is covered by Node's built-in test runner:

```bash
npm run check   # static integrity: precache entries exist, all js/css precached, imports resolve
npm test        # runs the check, then node --test
```

Tests live in `tests/` and cover account scoping (`ownerVisible`/`filterOwned`),
outbox coalescing, sats ⇄ fiat conversion, balance math, sync event building, and
the sync engine's merge (last-write-wins + tombstones) and guest-claim paths.
They stub browser-only storage/encryption, so no build step or browser is required.

## Requirements

- Modern browser with ES module support and IndexedDB.
- PWA/offline: a secure context (HTTPS or localhost) for the service worker.
- NIP-07 extension (Alby, nos2x) or an imported nsec to sync with Nostr.

## Known limitations

- Merge is last-write-wins; no per-field merge or CRDT.
- Journal entries created before the kind-30078 migration remain self-DMs; editing one republishes it as a replaceable record, so on a fresh device the old kind-4 copy may also appear (duplicate until re-edited).
- Guest data at rest is unencrypted until the account is connected (surfaced by a dismissible "Local mode" notice on Home and in Journal).
- Tests stub storage and cover pure logic plus the sync merge/claim paths; there are no real IndexedDB, DOM, or end-to-end tests.
- No build/lint tooling; the app ships as plain ES modules.
