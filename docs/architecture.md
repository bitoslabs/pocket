# Nostr Zap Journal - Architecture Documentation

## Overview

This is a Progressive Web App (PWA) built with **pure HTML, CSS, and JavaScript** following clean architecture principles for maintainability and scalability.

## Architecture Layers

```
┌─────────────────────────────────────────────────┐
│                 Presentation                     │
│  (Pages, Components, Router)                    │
├─────────────────────────────────────────────────┤
│                 Application                      │
│  (Services, State Management, Event Bus)        │
├─────────────────────────────────────────────────┤
│                Infrastructure                    │
│  (Storage, Nostr Protocol, Crypto)              │
└─────────────────────────────────────────────────┘
```

## Directory Structure

```
/bitos-pure-web-app/
├── index.html              # Entry point
├── manifest.json           # PWA manifest
├── service-worker.js       # Offline support
├── css/
│   ├── variables.css       # Design tokens
│   ├── base.css            # Reset & typography
│   ├── layout.css          # Grid & flexbox utilities
│   └── components.css      # UI components
├── js/
│   ├── app.js              # Main orchestrator
│   ├── config.js           # Centralized config
│   ├── router.js           # SPA routing
│   ├── core/
│   │   ├── event-bus.js    # Pub/sub events
│   │   ├── state.js        # Reactive state
│   │   └── component.js    # Base component class
│   ├── services/
│   │   ├── storage-service.js
│   │   ├── auth-service.js
│   │   ├── nostr-service.js
│   │   ├── zap-service.js
│   │   └── journal-service.js
│   ├── utils/
│   │   ├── dom.js          # DOM helpers
│   │   └── format.js       # Formatting utils
│   ├── components/
│   │   ├── header.js
│   │   ├── sidebar.js
│   │   ├── modal.js
│   │   └── toast.js
│   └── pages/
│       ├── dashboard.js
│       ├── transactions.js
│       ├── journal.js
│       └── settings.js
└── docs/
    └── architecture.md     # This file
```

## Core Patterns

### 1. Event-Driven Architecture

Modules communicate through a centralized event bus:

```javascript
import { eventBus, Events } from "./core/event-bus.js";
eventBus.emit(Events.AUTH_LOGIN, { user });
eventBus.on(Events.AUTH_LOGIN, handler);
```

### 2. Reactive State Management

Single source of truth with subscriptions:

```javascript
import { store } from "./core/state.js";
store.set("user", userData);
store.subscribe("user", (newVal, oldVal) => {});
```

### 3. Component-Based UI

Base component class with lifecycle hooks:

```javascript
class MyComponent extends Component {
  template() {
    return "<div>...</div>";
  }
  mounted() {
    /* DOM ready */
  }
  bindEvents() {
    /* Event handlers */
  }
}
```

### 4. Service Layer

Singleton services for business logic:

- **authService** - NIP-07 authentication
- **nostrService** - WebSocket relay connections
- **zapService** - Lightning zap handling
- **journalService** - Encrypted notes
- **storageService** - IndexedDB/LocalStorage

## Design System

CSS uses design tokens for consistency:

- `--color-primary` - Bitcoin orange (#f7931a)
- `--space-*` - Spacing scale (4px increments)
- `--radius-*` - Border radius scale
- `--transition-*` - Animation timing

## Running the App

```bash
# Serve with any static server
npx serve .
# or
python -m http.server 8000
```

Open `http://localhost:8000` in browser.

## Requirements

- Modern browser with ES6 module support
- NIP-07 extension (Alby, nos2x) for Nostr login
