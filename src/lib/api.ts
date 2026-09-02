import type { ModelEntry, ModelsResponse } from './types';
import { resolvePricing } from './pricing';

const ENDPOINT = 'https://inference-api.nousresearch.com/v1/models';
const CACHE_KEY = 'nme.models.cache.v1';
const TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachePayload {
  fetchedAt: number;
  models: ModelEntry[];
}

export function readCache(): CachePayload | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachePayload;
    if (!parsed?.fetchedAt || !Array.isArray(parsed.models)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCache(models: ModelEntry[]): CachePayload {
  const payload: CachePayload = { fetchedAt: Date.now(), models };
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // localStorage may be unavailable (private mode quota, etc.) — silently ignore
  }
  return payload;
}

export function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

export async function fetchModels(force = false): Promise<CachePayload> {
  if (!force) {
    const cached = readCache();
    if (cached && Date.now() - cached.fetchedAt < TTL_MS) {
      return cached;
    }
  }
  const res = await fetch(ENDPOINT, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Nous API responded ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as ModelsResponse;
  if (!json?.data || !Array.isArray(json.data)) {
    throw new Error('Nous API returned unexpected shape (no data[])');
  }
  return writeCache(json.data);
}

export function resolvedFor(m: ModelEntry) {
  return resolvePricing(m.pricing, new Date());
}