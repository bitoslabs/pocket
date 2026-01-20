Create a modern, premium Nostr Zap Journal web application using pure HTML, CSS, and JavaScript (no frameworks). The application should be a Progressive Web App (PWA) and should be able to run offline. The application should be able to run in the browser and on mobile devices.

## Features Required:

- Money Management - CRUD operations on transactions
- Money Movement Tracking - Track zap receipts and payments
- Family/Group Money Management - CRUD and track transactions
- Family/Group Inventory Management - Income/Expense tracking for family/group members

### Private Journal Features:

- Encrypted Storage - All journal entries encrypted with NIP-04
- Self-DM Pattern - Store notes as kind 4 events to own pubkey
- Note Tags - Categorize private notes (financial, personal, goals)
- Search - Full-text search on decrypted notes
- Attachments - Link zap transactions to journal entries
- Export - Download encrypted backup

### Core Functionality:

1. **Dashboard** - Overview of zap income/expenses with charts
2. **Transaction List** - Paginated list of all zap events
3. **Categories** - Ability to categorize transactions
4. **Reports** - Monthly/weekly summaries with visual charts
5. **Nostr Login** - Connect with NIP-07 browser extension (nos2x, Alby)

### Nostr Integration:

- Connect to relays (wss://relay.damus.io, wss://nos.lol)
- Fetch zap receipts (kind 9735) for logged-in user
- Parse zap amounts from Lightning invoices
- Display sender/recipient npub addresses
- NIP-04 Encryption - Send encrypted DMs to self for private notes
- NIP-07 Auth - Browser extension signing (Alby, nos2x, Nostr Connect)

### UI/UX Requirements:

- Dark mode with Bitcoin/Lightning orange accents
- Glassmorphism cards for statistics
- Smooth animations and micro-interactions
- Responsive design (mobile-first)
- Clean, minimalist typography (Inter or similar)

### File Structure:

/nostr-zap-journal/
├── index.html # Main entry point
├── css/
│ ├── styles.css # Main styles & design system
│ └── components.css # Component-specific styles
├── js/
│ ├── app.js # Main application orchestration
│ ├── nostr.js # Nostr protocol & relay connections
│ ├── crypto.js # NIP-04 encryption utilities
│ ├── zaps.js # Zap receipt parsing (kind 9735)
│ ├── journal.js # Private journal CRUD operations
│ ├── charts.js # Chart rendering (vanilla canvas)
│ └── storage.js # LocalStorage/IndexedDB cache
└── assets/
└── icons/ # SVG icons (inline)

### Technical Requirements:

- Use ES6+ JavaScript modules
- WebSocket for relay connections
- LocalStorage for caching events
- CSS Grid/Flexbox for layouts
- CSS Variables for theming
- No external dependencies (vanilla only)
