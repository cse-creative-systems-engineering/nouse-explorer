import { atom, computed } from 'nanostores';

/**
 * Compare mode: pin up to 3 models, then view them side-by-side across
 * every metric. The comparison answers "which of these is right for me"
 * — the core job of the app.
 */

const MAX_PINS = 3;
const KEY = 'nouse.compare';

function load(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]).slice(0, MAX_PINS) : [];
  } catch {
    return [];
  }
}

export const $compare = atom<string[]>(load());

let init = false;
$compare.subscribe((ids) => {
  if (!init) { init = true; return; }
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* non-fatal */ }
});

export function toggleCompare(id: string) {
  const cur = $compare.get();
  if (cur.includes(id)) {
    $compare.set(cur.filter((x) => x !== id));
  } else if (cur.length < MAX_PINS) {
    $compare.set([...cur, id]);
  }
}

export function clearCompare() {
  $compare.set([]);
}

export const $compareCount = computed($compare, (ids) => ids.length);
