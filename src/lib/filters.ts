import type { ModelEntry, SortDir, SortKey } from './types';
import {
  discountPercent,
  hasBenchmark,
  isBatch,
  isFree,
  isFreeVariant,
  isMultimodal,
  perMillion,
  providerFromId,
  resolvePricing,
} from './pricing';

export interface FilterState {
  freeOnly: boolean;
  multimodalOnly: boolean;
  hasDiscount: boolean;
  hasBenchmark: boolean;
  noBenchmark: boolean;
  batchOnly: boolean;
  search: string;
  provider: string;
  modality: string;
  contextMin: number;
  priceMax: number; // per 1M prompt tokens
}

export const defaultFilters: FilterState = {
  freeOnly: false,
  multimodalOnly: false,
  hasDiscount: false,
  hasBenchmark: false,
  noBenchmark: false,
  batchOnly: false,
  search: '',
  provider: '',
  modality: '',
  contextMin: 0,
  priceMax: 0,
};

function matchesSearch(m: ModelEntry, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return (
    m.id.toLowerCase().includes(needle) ||
    m.name.toLowerCase().includes(needle) ||
    (m.description?.toLowerCase().includes(needle) ?? false)
  );
}

function modalityMatches(m: ModelEntry, target: string): boolean {
  if (!target) return true;
  const arch = m.architecture?.modality ?? '';
  return arch === target;
}

export function applyFilters(models: ModelEntry[], f: FilterState): ModelEntry[] {
  return models.filter((m) => {
    if (f.batchOnly && !isBatch(m.id)) return false;
    if (f.provider && providerFromId(m.id) !== f.provider) return false;
    if (f.modality && !modalityMatches(m, f.modality)) return false;
    if (f.contextMin && (m.context_length ?? 0) < f.contextMin) return false;

    const resolved = resolvePricing(m.pricing);
    const promptPerM = perMillion(resolved.prompt);
    if (f.priceMax > 0 && promptPerM > f.priceMax) return false;

    if (f.freeOnly && !(isFree(resolved) || isFreeVariant(m.id))) return false;
    if (f.multimodalOnly && !isMultimodal(m.architecture)) return false;

    if (f.hasDiscount) {
      const d = discountPercent(m.pricing, resolved.prompt);
      if (d <= 0) return false;
    }

    const bench = hasBenchmark(m);
    if (f.hasBenchmark && !bench) return false;
    if (f.noBenchmark && bench) return false;

    if (!matchesSearch(m, f.search)) return false;

    return true;
  });
}

export function sortModels(
  models: ModelEntry[],
  key: SortKey,
  dir: SortDir,
): ModelEntry[] {
  const factor = dir === 'asc' ? 1 : -1;
  const sorted = [...models];
  sorted.sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb) * factor;
    }
    const na = typeof va === 'number' ? va : -Infinity;
    const nb = typeof vb === 'number' ? vb : -Infinity;
    if (na === nb) return 0;
    return (na - nb) * factor;
  });
  return sorted;
}

function sortValue(m: ModelEntry, key: SortKey): string | number {
  switch (key) {
    case 'name':
      return m.name;
    case 'provider':
      return providerFromId(m.id);
    case 'prompt': {
      const r = resolvePricing(m.pricing);
      return perMillion(r.prompt);
    }
    case 'completion': {
      const r = resolvePricing(m.pricing);
      return perMillion(r.completion);
    }
    case 'discount': {
      const r = resolvePricing(m.pricing);
      return discountPercent(m.pricing, r.prompt);
    }
    case 'context':
      return m.context_length ?? 0;
    case 'coding':
      return m.benchmarks?.artificial_analysis?.coding_index ?? -Infinity;
    case 'intelligence':
      return m.benchmarks?.artificial_analysis?.intelligence_index ?? -Infinity;
    case 'agentic':
      return m.benchmarks?.artificial_analysis?.agentic_index ?? -Infinity;
  }
}

export function uniqueProviders(models: ModelEntry[]): string[] {
  const set = new Set<string>();
  for (const m of models) set.add(providerFromId(m.id));
  return Array.from(set).sort();
}

export function uniqueModalities(models: ModelEntry[]): string[] {
  const set = new Set<string>();
  for (const m of models) {
    if (m.architecture?.modality) set.add(m.architecture.modality);
  }
  return Array.from(set).sort();
}