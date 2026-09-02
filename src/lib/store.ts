import { atom, computed } from 'nanostores';
import type { ModelEntry, SortDir, SortKey, ViewMode } from './types';
import { applyFilters, defaultFilters, sortModels, type FilterState } from './filters';

export const $models = atom<ModelEntry[]>([]);
export const $loading = atom<boolean>(false);
export const $error = atom<string | null>(null);
export const $fetchedAt = atom<number | null>(null);

export const $filters = atom<FilterState>({ ...defaultFilters });
export const $sortKey = atom<SortKey>('name');
export const $sortDir = atom<SortDir>('asc');
export const $view = atom<ViewMode>('cards');
export const $selectedId = atom<string | null>(null);

export const $autoRefresh = atom<boolean>(true);
export const $refreshInterval = atom<number>(30); // minutes

export interface ResearchProgress {
  running: boolean;
  pending: number;
  done: number;
  failed: number;
  current: string | null;
  tier: number | null;
}

export const $research = atom<ResearchProgress>({
  running: false,
  pending: 0,
  done: 0,
  failed: 0,
  current: null,
  tier: null,
});

export const $filtered = computed(
  [$models, $filters, $sortKey, $sortDir],
  (models, filters, key, dir) => sortModels(applyFilters(models, filters), key, dir),
);

export const $stats = computed([$models, $fetchedAt], (models, fetchedAt) => {
  let free = 0;
  let discounted = 0;
  let benchmarked = 0;
  for (const m of models) {
    const prompt = parseFloat(m.pricing.prompt);
    const completion = parseFloat(m.pricing.completion);
    const isFreeV = m.id.endsWith(':free') || ((isFinite(prompt) && prompt === 0) && (isFinite(completion) && completion === 0));
    if (isFreeV) free += 1;
    if (m.pricing.original) {
      const orig = parseFloat(m.pricing.original.prompt);
      if (isFinite(prompt) && isFinite(orig) && orig > 0 && prompt < orig) discounted += 1;
    }
    if (m.benchmarks) {
      const hasDA = Array.isArray(m.benchmarks.design_arena) && m.benchmarks.design_arena.length > 0;
      const hasAA = !!m.benchmarks.artificial_analysis &&
        (m.benchmarks.artificial_analysis.intelligence_index !== undefined ||
          m.benchmarks.artificial_analysis.coding_index !== undefined ||
          m.benchmarks.artificial_analysis.agentic_index !== undefined);
      if (hasDA || hasAA) benchmarked += 1;
    }
  }
  return {
    total: models.length,
    free,
    discounted,
    benchmarked,
    fetchedAt,
  };
});