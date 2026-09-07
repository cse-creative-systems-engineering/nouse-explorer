import type { DatabaseSync } from 'node:sqlite';
import { recordMetric, upsertProfile } from './db.js';

export interface Metric {
  model_id: string;
  metric: string;
  value: number;
  source_url: string;
  method: string; // 'provider-api' | 'artificial-analysis' | 'embedded'
}

const AA_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models'; // docs: /api/v2/data/llms/models, x-api-key header

/** Provider-first rule: query the model's own provider API before aggregators. */
const PROVIDER_SOURCES: Record<string, { url: (model: string) => string; kind: string }> = {
  openai: { url: (m) => `https://api.openai.com/v1/models/${m}`, kind: 'openai-api' }, // needs key
  anthropic: { url: (m) => `https://api.anthropic.com/v1/models/${m}`, kind: 'anthropic-api' }, // needs key
  deepseek: { url: (m) => `https://api.deepseek.com/models/${m}`, kind: 'deepseek-api' },
  'z-ai': { url: (m) => `https://api.z.ai/api/v1/models/${m}`, kind: 'zai-api' },
  qwen: { url: (m) => `https://dashscope.aliyuncs.com/api/v1/models/${m}`, kind: 'qwen-api' },
  moonshotai: { url: (m) => `https://api.moonshot.cn/v1/models/${m}`, kind: 'moonshot-api' },
  mistralai: { url: (m) => `https://api.mistral.ai/v1/models/${m}`, kind: 'mistral-api' },
  google: { url: (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}`, kind: 'google-api' },
  xai: { url: (m) => `https://api.x.ai/v1/models/${m}`, kind: 'xai-api' },
  // HF is the generic machine-readable fallback for any org
  hf: { url: (m) => `https://huggingface.co/api/models/${m}`, kind: 'huggingface' },
};

export async function providerFirst(id: string, hfId?: string | null): Promise<Metric[]> {
  const prov = id.split('/')[0];
  const model = id.split('/').slice(1).join('/');
  const out: Metric[] = [];

  const direct = PROVIDER_SOURCES[prov];
  if (direct) {
    try {
      const res = await fetch(direct.url(model), {
        headers: { 'User-Agent': 'NouseExplorer/0.1' },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const j = (await res.json()) as Record<string, unknown>;
        // model id field confirms identity; capture whatever structured fields exist
        const idField = (j.id ?? j.model ?? j.name) as string | undefined;
        if (idField) {
          out.push({
            model_id: id,
            metric: 'provider_confirms_identity',
            value: 1,
            source_url: direct.url(model),
            method: 'provider-api',
          });
        }
      }
    } catch {
      /* provider unreachable — fall through to aggregators */
    }
  }

  // HF fallback — prefer the catalog's authoritative hugging_face_id
  const hfModel = (hfId && !hfId.startsWith('http')) ? hfId : model.split(':')[0];
  try {
    const res = await fetch(PROVIDER_SOURCES.hf.url(hfModel), {
      headers: { 'User-Agent': 'NouseExplorer/0.1' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const j = (await res.json()) as { downloads?: number; likes?: number; id?: string; context_length?: number };
      if (typeof j.downloads === 'number') {
        out.push({ model_id: id, metric: 'hf_downloads', value: j.downloads, source_url: `https://huggingface.co/${hfModel}`, method: 'provider-api' });
      }
      if (typeof j.likes === 'number') {
        out.push({ model_id: id, metric: 'hf_likes', value: j.likes, source_url: `https://huggingface.co/${hfModel}`, method: 'provider-api' });
      }
    }
  } catch {
    /* hf unavailable */
  }

  return out;
}

let aaCache: Array<Record<string, unknown>> | null = null;
let aaFetchedAt = 0;
const AA_TTL_MS = 24 * 60 * 60 * 1000;

/** Drop the cached AA snapshot so the next queue run refetches (e.g. after a key save). */
export function invalidateAaCache(): void {
  aaCache = null;
  aaFetchedAt = 0;
}

/** Fetch the free AA data API once per day, cache in-memory. */
/** Fetch the free AA data API once per day, cached in-memory. Pass the AA API key when available. */
export async function artificialAnalysis(apiKey?: string | null): Promise<Array<Record<string, unknown>>> {
  const now = Date.now();
  if (aaCache && now - aaFetchedAt < AA_TTL_MS) return aaCache;
  try {
    const headers: Record<string, string> = { 'User-Agent': 'NouseExplorer/0.1' };
    if (apiKey) headers['x-api-key'] = apiKey;
    const res = await fetch(AA_URL, { headers, signal: AbortSignal.timeout(20000) });
    if (res.status === 401) {
      // Requires an API key (settings page) — degrade gracefully, don't spam.
      console.error('[research] Artificial Analysis API needs a key (401) — skipping AA tier');
      aaCache = [];
      aaFetchedAt = now;
      return aaCache;
    }
    if (!res.ok) throw new Error(`AA API ${res.status}`);
    const j = (await res.json()) as { data?: Array<Record<string, unknown>> };
    aaCache = j.data ?? [];
    aaFetchedAt = now;
    return aaCache;
  } catch (e) {
    console.error('[research] AA fetch failed', (e as Error).message);
    aaCache = [];
    aaFetchedAt = now;
    return aaCache;
  }
}

/** Resolve a Nous id against AA records (name/creator fuzzy match + context fingerprint). */
export function matchAaRecord(
  id: string,
  name: string,
  contextLength: number | null,
  aa: Array<Record<string, unknown>>,
): Record<string, unknown> | null {
  const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // Portal provider prefixes vs AA creator slugs often differ — map them.
  const CREATOR_ALIASES: Record<string, string[]> = {
    qwen: ['alibaba', 'qwen'],
    'z-ai': ['zai', 'zhipu'],
    moonshotai: ['kimi', 'moonshot'],
    'x-ai': ['xai'],
    'meta-llama': ['meta'],
    mistralai: ['mistral'],
    'bytedance-seed': ['bytedance', 'seed'],
    amazon: ['aws', 'amazon'],
    meituan: ['longcat', 'meituan'],
    kwaipilot: ['kwaikat', 'kwaipilot'],
    deepseek: ['deepseek'],
    google: ['google'],
    openai: ['openai'],
    anthropic: ['anthropic'],
  };
  const rawProv = id.split('/')[0].replace(/^~/, '');
  const prov = rawProv;
  const creatorCandidates = CREATOR_ALIASES[rawProv] ?? [rawProv];
  const portalOrgs = creatorCandidates.map(norm);
  const base = id.split('/').slice(1).join('/').split(':')[0];
  const slugPart = norm(base);

  const creatorOf = (r: Record<string, unknown>): string => {
    const mc = (r.model_creator as Record<string, unknown> | undefined) ?? {};
    return norm(mc.slug ?? mc.name);
  };
  const orgMatches = (r: Record<string, unknown>): boolean => {
    const org = creatorOf(r);
    if (!org) return false;
    return portalOrgs.some((p) => p === org || org.includes(p) || p.includes(org));
  };

  // 1a) exact slug match with creator agreement
  for (const r of aa) {
    if (norm(r.slug) === slugPart && orgMatches(r)) return r;
  }
  // 1b) containment match — prefer benchmarked records and exact-ish variants:
  //     'gemini-3-5-flash' should hit the bare record (coding: 70.1), not the
  //     unbenchmarked '-medium'/'-non-reasoning' variants that merely contain it.
  const variantTokens = ['nonreasoning', 'reasoning', 'low', 'medium', 'high', 'xhigh', 'minimal', 'thinking'];
  const scoreOf = (r: Record<string, unknown>): number => {
    const slug = norm(r.slug);
    let s = 0;
    if (slug === slugPart) s += 100;
    const extra = slug.slice(slugPart.length).replace(/[^a-z0-9]/g, '');
    if (extra && !variantTokens.some((v) => extra.startsWith(v))) s -= 50; // unrelated containment (e.g. '-lite') deprioritized
    const evals = (r.evaluations as Record<string, unknown> | undefined) ?? {};
    s += Object.values(evals).filter((v) => typeof v === 'number').length;
    const d = String(r.release_date ?? '');
    s += d > '2026-01-01' ? 2 : 0;
    return s;
  };
  {
    let best: Record<string, unknown> | null = null;
    let bestScore = -Infinity;
    for (const r of aa) {
      const rSlug = norm(r.slug);
      const slugMatch = rSlug.includes(slugPart) || slugPart.includes(rSlug);
      if (slugMatch && orgMatches(r)) {
        const s = scoreOf(r);
        if (s > bestScore) { bestScore = s; best = r; }
      }
    }
    if (best) return best;
  }
  // 2) name-based match with creator agreement
  for (const r of aa) {
    const rName = norm(r.name);
    if (rName && (rName.includes(norm(name).split(':')[0]) || norm(name).split(':')[0].includes(rName)) && orgMatches(r)) return r;
  }
  // 3) progressive slug prefixes (strip trailing version/variant tokens)
  const toks = base.toLowerCase().split(/[-_.]/).filter(Boolean);
  for (let i = toks.length - 1; i > 0; i--) {
    const cand = norm(toks.slice(0, i).join('-'));
    if (!cand) continue;
    for (const r of aa) {
      if (norm(r.slug) === cand && orgMatches(r)) return r;
    }
  }
  // 4) rolling aliases ("*-latest"): resolve to the newest AA release of the
  // same creator whose model family matches (glm-latest → newest GLM, etc.)
  if (base.endsWith('-latest')) {
    const family = norm(base.slice(0, -'-latest'.length));
    const familyRoot = family.split('-')[0]; // 'glm', 'gpt', 'claude', 'grok', 'kimi', 'gemini', 'nova'
    let best: Record<string, unknown> | null = null;
    let bestDate = '';
    for (const r of aa) {
      if (!orgMatches(r) && creatorOf(r) !== portalOrgs[0]) continue;
      const rName = norm(r.name);
      const rSlug = norm(r.slug);
      if (rSlug.startsWith(familyRoot) || rName.startsWith(familyRoot)) {
        const d = String(r.release_date ?? '');
        if (d > bestDate) { bestDate = d; best = r; }
      }
    }
    if (best) return best;
  }
  // 5) token-order matching: portal "claude-opus-4.1" vs AA "claude-4-1-opus"
  //    (same tokens, different order — containment matching can't see these)
  const tokSet = (s: unknown): Set<string> => new Set(String(s ?? '').toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const portalToks = tokSet(base);
  if (portalToks.size > 0) {
    let best: Record<string, unknown> | null = null;
    let bestExtra = Infinity;
    for (const r of aa) {
      const org = creatorOf(r);
      if (!portalOrgs.some((p) => p === org || org.includes(p) || p.includes(org))) continue;
      const aaToks = tokSet(r.slug);
      aaToks.delete('reasoning'); aaToks.delete('nonreasoning');
      if (portalToks.size <= aaToks.size && [...portalToks].every((t) => aaToks.has(t))) {
        const extra = aaToks.size - portalToks.size;
        if (extra < bestExtra) { bestExtra = extra; best = r; }
      }
    }
    if (best) return best;
  }
  // 6) sibling-variant inheritance: AA benchmarks the reasoning variant of a
  //    model family with coding but not the non-reasoning variant — match the
  //    family's benchmarked record so metrics inherit.
  const familyOf = (s: unknown): string => {
    let x = norm(s);
    for (const suf of ['nonreasoning', 'reasoning', 'adaptive', 'thinking', 'low', 'medium', 'high', 'xhigh', 'maxeffort', 'instruct']) x = x.replace(suf, '');
    return x.replace(/-+$/, '');
  };
  const fam = familyOf(base);
  let famBest: Record<string, unknown> | null = null;
  let famScore = -1;
  for (const r of aa) {
    if (!orgMatches(r)) continue;
    if (familyOf(r.slug) !== fam && familyOf(r.name) !== fam) continue;
    const v = (r.evaluations as Record<string, unknown> | undefined)?.artificial_analysis_coding_index;
    const score = typeof v === 'number' ? v : 0;
    if (score > famScore) { famScore = score; famBest = r; }
  }
  if (famBest) return famBest;
  return null;
}


export function aaMetrics(modelId: string, rec: Record<string, unknown>): Metric[] {
  const out: Metric[] = [];
  const src = 'https://artificialanalysis.ai/leaderboards/models';
  const evals = (rec.evaluations ?? {}) as Record<string, unknown>;
  const pric = (rec.pricing ?? {}) as Record<string, unknown>;
  // NOTE: live API returns speed/latency at TOP level (not under performance)
  const map: Record<string, unknown> = {
    artificial_analysis_intelligence_index: evals.artificial_analysis_intelligence_index,
    artificial_analysis_coding_index: evals.artificial_analysis_coding_index,
    artificial_analysis_agentic_index: evals.artificial_analysis_agentic_index,
    artificial_analysis_math_index: evals.artificial_analysis_math_index,
    mmlu_pro: evals.mmlu_pro,
    gpqa: evals.gpqa,
    livecodebench: evals.livecodebench,
    scicode: evals.scicode,
    aime: evals.aime,
    aime_25: evals.aime_25,
    hle: evals.hle,
    lcr: evals.lcr,
    ifbench: evals.ifbench,
    tau2: evals.tau2,
    terminalbench_hard: evals.terminalbench_hard,
    terminalbench_v2_1: evals.terminalbench_v2_1,
    math_500: evals.math_500,
    median_output_tokens_per_second: rec.median_output_tokens_per_second,
    median_time_to_first_token_seconds: rec.median_time_to_first_token_seconds,
    median_time_to_first_answer_token: rec.median_time_to_first_answer_token,
    price_1m_input: pric.price_1m_input_tokens,
    price_1m_output: pric.price_1m_output_tokens,
    price_1m_blended_3_to_1: pric.price_1m_blended_3_to_1,
  };
  for (const [metric, v] of Object.entries(map)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.push({ model_id: modelId, metric, value: v, source_url: src, method: 'artificial-analysis' });
    }
  }
  return out;
}

export function persistMetrics(d: DatabaseSync, metrics: Metric[]): void {
  for (const m of metrics) recordMetric(d, m);
}

// ── OpenRouter tier ─────────────────────────────────────────────────
// OpenRouter exposes the AA composite indices for models AA's own endpoint
// doesn't cover (and is what powers the Portal's embedded benchmarks).
// Same scale as AA indices; stored with method 'openrouter' for provenance.
const OR_URL = 'https://openrouter.ai/api/v1/models';
let orCache: Array<Record<string, unknown>> | null = null;
let orFetchedAt = 0;
const OR_TTL_MS = 24 * 60 * 60 * 1000;

export async function openRouterCatalog(apiKey?: string | null): Promise<Array<Record<string, unknown>>> {
  const now = Date.now();
  if (orCache && now - orFetchedAt < OR_TTL_MS) return orCache;
  try {
    const headers: Record<string, string> = { 'User-Agent': 'NouseExplorer/0.1' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
    const res = await fetch(OR_URL, { headers, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
    const j = (await res.json()) as { data?: Array<Record<string, unknown>> };
    orCache = j.data ?? [];
    orFetchedAt = now;
    return orCache;
  } catch (e) {
    console.error('[research] OpenRouter fetch failed', (e as Error).message);
    orCache = [];
    orFetchedAt = now;
    return orCache;
  }
}

export function orMetrics(modelId: string, orModel: Record<string, unknown>): Metric[] {
  const out: Metric[] = [];
  const src = `https://openrouter.ai/${modelId}`;
  const aa = (orModel.benchmarks as Record<string, unknown> | undefined)?.artificial_analysis as Record<string, unknown> | undefined;
  if (!aa) return out;
  const map: Record<string, unknown> = {
    artificial_analysis_intelligence_index: aa.intelligence_index,
    artificial_analysis_coding_index: aa.coding_index,
    artificial_analysis_agentic_index: aa.agentic_index,
  };
  for (const [metric, v] of Object.entries(map)) {
    if (typeof v === 'number' && Number.isFinite(v)) {
      out.push({ model_id: modelId, metric, value: v, source_url: src, method: 'openrouter' });
    }
  }
  return out;
}
