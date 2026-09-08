import { atom } from 'nanostores';

const KEY = 'nouse.theme';

function initial(): 'dark' | 'light' {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {}
  return 'dark';
}

export const $theme = atom<'dark' | 'light'>(initial());

export function setTheme(t: 'dark' | 'light') {
  $theme.set(t);
  try { localStorage.setItem(KEY, t); } catch {}
  document.documentElement.dataset.theme = t;
}

// apply on module load
document.documentElement.dataset.theme = $theme.get();
