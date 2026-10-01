/**
 * Entry Prefs - remember the last-used entry choices so repeat entries are fast.
 *
 * Stores the sats/fiat unit and the last category per direction ('out' | 'in').
 * Local-only, like the other UI preferences (storageService LocalStorage keys).
 *
 * @module services/entry-prefs
 */

import { storageService } from './storage-service.js';

const UNIT_KEY = 'app_entry_unit';
const CAT_KEY = 'app_entry_cat';
const DIRS = ['out', 'in'];

class EntryPrefs {
  /** Last chosen amount unit: 'sats' | 'fiat'. */
  lastUnit() {
    return storageService.getLocal(UNIT_KEY, 'sats') === 'fiat' ? 'fiat' : 'sats';
  }

  setUnit(unit) {
    storageService.setLocal(UNIT_KEY, unit === 'fiat' ? 'fiat' : 'sats');
  }

  /** Last category id chosen for a direction, or null when none saved. */
  lastCategory(dir) {
    if (!DIRS.includes(dir)) return null;
    const map = storageService.getLocal(CAT_KEY, null);
    const id = map && typeof map === 'object' ? map[dir] : null;
    return typeof id === 'string' && id ? id : null;
  }

  setCategory(dir, id) {
    if (!DIRS.includes(dir) || !id) return;
    const map = storageService.getLocal(CAT_KEY, null);
    const next = map && typeof map === 'object' ? { ...map } : {};
    next[dir] = id;
    storageService.setLocal(CAT_KEY, next);
  }
}

export const entryPrefs = new EntryPrefs();
export default entryPrefs;
