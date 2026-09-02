import type { Pricing, PricingOverride } from './types';

const DAY_NAMES: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export const DAY_LABELS: Record<string, string> = {
  sunday: 'Sun',
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
};

function minutesSinceMidnightUtc(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

function matchesDay(day: string, jsDay: number): boolean {
  return DAY_NAMES[day.toLowerCase()] === jsDay;
}

function overrideAppliesAt(o: PricingOverride, now: Date): boolean {
  if (o.utc_days && o.utc_days.length > 0) {
    const jsDay = now.getUTCDay();
    if (!o.utc_days.some((d) => matchesDay(d, jsDay))) return false;
  }
  const start = o.utc_start;
  const end = o.utc_end;
  if (start === undefined && end === undefined) return true;
  const minutes = minutesSinceMidnightUtc(now);
  const s = start ?? 0;
  const e = end ?? 0;
  if (s === e) return false;
  if (s < e) {
    return minutes >= s && minutes < e;
  }
  // window wraps past midnight (e.g. 1000..0)
  return minutes >= s || minutes < e;
}

export interface ResolvedPricing {
  prompt: string;
  completion: string;
  web_search?: string;
  input_cache_read?: string;
  input_cache_write?: string;
  input_cache_write_1h?: string;
  request?: string;
  image?: string;
}

export function resolvePricing(
  pricing: Pricing,
  now: Date = new Date(),
): ResolvedPricing {
  if (pricing.overrides && pricing.overrides.length > 0) {
    for (const o of pricing.overrides) {
      if (overrideAppliesAt(o, now)) {
        return {
          prompt: o.prompt,
          completion: o.completion,
          web_search: o.web_search ?? pricing.web_search,
          input_cache_read: o.input_cache_read ?? pricing.input_cache_read,
          input_cache_write: o.input_cache_write ?? pricing.input_cache_write,
          input_cache_write_1h: o.input_cache_write_1h ?? pricing.input_cache_write_1h,
          request: o.request ?? pricing.request,
          image: o.image ?? pricing.image,
        };
      }
    }
  }
  return {
    prompt: pricing.prompt,
    completion: pricing.completion,
    web_search: pricing.web_search,
    input_cache_read: pricing.input_cache_read,
    input_cache_write: pricing.input_cache_write,
    input_cache_write_1h: pricing.input_cache_write_1h,
    request: pricing.request,
    image: pricing.image,
  };
}

export function perMillion(perToken: string | number | undefined): number {
  if (perToken === undefined || perToken === null || perToken === '') return 0;
  const n = typeof perToken === 'string' ? parseFloat(perToken) : perToken;
  if (!isFinite(n)) return 0;
  return n * 1_000_000;
}

export function discountPercent(
  pricing: Pricing,
  resolvedPrompt: string,
): number {
  const orig = pricing.original;
  if (!orig) return 0;
  const cur = parseFloat(resolvedPrompt);
  const o = parseFloat(orig.prompt);
  if (!isFinite(cur) || !isFinite(o) || o <= 0) return 0;
  if (cur >= o) return 0;
  return (1 - cur / o) * 100;
}

export function isFree(resolved: ResolvedPricing): boolean {
  const p = parseFloat(resolved.prompt);
  const c = parseFloat(resolved.completion);
  return (isFinite(p) && p === 0) && (isFinite(c) && c === 0);
}

export function formatUsd(n: number): string {
  if (!isFinite(n)) return '$0.00';
  if (n === 0) return 'Free';
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  if (n >= 0.0001) return `$${n.toFixed(4)}`;
  return `$${n.toExponential(2)}`;
}

export function formatPerToken(perToken: string | undefined): string {
  if (!perToken) return '—';
  const n = parseFloat(perToken);
  if (!isFinite(n)) return '—';
  if (n === 0) return 'Free';
  // readable decimal, never scientific notation
  if (n >= 1) return `$${n.toFixed(3)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(8)}`;
}

export function formatContext(tokens: number): string {
  if (!tokens) return '—';
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 === 0 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(0)}K`;
  return String(tokens);
}

export function fmtScore(v: number | null | undefined, digits = 1): string {
  return typeof v === 'number' && isFinite(v) ? v.toFixed(digits) : '—';
}

export function hasBenchmark(m: { benchmarks?: unknown }): boolean {
  if (!m.benchmarks) return false;
  const b = m.benchmarks as { design_arena?: unknown[]; artificial_analysis?: unknown };
  if (b.design_arena && Array.isArray(b.design_arena) && b.design_arena.length > 0) return true;
  if (b.artificial_analysis) return true;
  return false;
}

export function providerFromId(id: string): string {
  const slash = id.indexOf('/');
  return slash === -1 ? id : id.slice(0, slash);
}

export function isBatch(id: string): boolean {
  return id.endsWith(':batch');
}

export function isFreeVariant(id: string): boolean {
  return id.endsWith(':free');
}

export function isMultimodal(arch: { input_modalities?: string[] } | undefined): boolean {
  if (!arch?.input_modalities) return false;
  const mods = arch.input_modalities;
  return mods.length > 1 || (mods.length === 1 && mods[0] !== 'text');
}