import { atom } from 'nanostores';
import { DEFAULT_ORDER, COLUMNS, COLUMN_BY_ID } from './columns';

/**
 * User-configured table column state: ordered ids of visible columns.
 * Persisted to localStorage. A column id missing from storage but present
 * in the registry is appended (new metrics appear automatically); ids in
 * storage but not in the registry are dropped (metrics removed cleanly).
 */

const ORDER_KEY = 'nouse.table.columns.v1';

function loadOrder(): string[] {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return DEFAULT_ORDER;
    const saved = JSON.parse(raw) as string[];
    const valid = saved.filter((id) => COLUMN_BY_ID[id]);
    const missing = DEFAULT_ORDER.filter((id) => !valid.includes(id));
    return [...valid, ...missing];
  } catch {
    return DEFAULT_ORDER;
  }
}

export const $columnOrder = atom<string[]>(loadOrder());

// Persist on change (skip first synchronous evaluation).
let columnInit = false;
$columnOrder.subscribe((order) => {
  if (!columnInit) { columnInit = true; return; }
  try { localStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch { /* non-fatal */ }
});

export function setVisibleColumns(ids: string[]) {
  // Always keep pinned columns visible.
  const pinned = COLUMNS.filter((c) => c.pinned).map((c) => c.id);
  const next = [...new Set([...ids, ...pinned])].filter((id) => COLUMN_BY_ID[id]);
  // Respect registry order for any newly added columns; keep user order otherwise.
  const ordered = [
    ...next.filter((id) => $columnOrder.get().includes(id)),
    ...next.filter((id) => !$columnOrder.get().includes(id)),
  ];
  $columnOrder.set(ordered);
}

export function moveColumn(id: string, toBeforeId: string | null) {
  const cur = $columnOrder.get().filter((x) => x !== id);
  if (toBeforeId == null) {
    cur.push(id);
  } else {
    const i = cur.indexOf(toBeforeId);
    cur.splice(i === -1 ? cur.length : i, 0, id);
  }
  $columnOrder.set(cur);
}

export function resetColumns() {
  $columnOrder.set(DEFAULT_ORDER);
}
