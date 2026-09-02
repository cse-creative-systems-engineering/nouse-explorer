import type { DatabaseSync } from 'node:sqlite';
import { recordMetric, upsertProfile } from './db.js';

export interface Metric {
  model_id: string;
  metric: string;
  value: number;
  source_url: string;
  method: string; // 'provider-api' | 'artificial-analysis' | 'embedded'
}

const AA_URL = 'https://artificialanalysis.ai/api/v2/language/models/free';

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

/** Fetch the free AA data API once per day, cache in-memory. */
export async function artificialAnalysis(): Promise<Array<Record<string, unknown>>> {
  const now = Date.now();
  if (aaCache && now - aaFetchedAt < AA_TTL_MS) return aaCache;
  try {
    const res = await fetch(AA_URL, {
      headers: { 'User-Agent': 'NouseExplorer/0.1' },
      signal: AbortSignal.timeout(20000),
    });
    if (res.status === 401) {
      // Requires an API key (settings page later) — degrade gracefully, don't spam.
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
  const prov = id.split('/')[0];
  const slugPart = id.split('/').slice(1).join('/').split(':')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const r of aa) {
    const rName = String(r.name ?? '').toLowerCase();
    const rSlug = String(r.slug ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const creator = ((r.model_creator as Record<string, unknown> | undefined)?.name ?? '').toString().toLowerCase();
    const creatorSlug = ((r.model_creator as Record<string, unknown> | undefined)?.slug ?? '').toString().toLowerCase();
    const nameMatch = name.toLowerCase().includes(rName) || rName.includes(name.toLowerCase().split(':')[0].trim());
    const slugMatch = rSlug === slugPart || rSlug.includes(slugPart) || slugPart.includes(rSlug);
    const orgMatch = creatorSlug.includes(prov) || prov.includes(creatorSlug) || creator.includes(prov);
    if (slugMatch && orgMatch) return r;
    if (nameMatch && orgMatch) return r;
  }
  return null;
}

export function aaMetrics(modelId: string, rec: Record<string, unknown>): Metric[] {
  const out: Metric[] = [];
  const src = 'https://artificialanalysis.ai/leaderboards/models';
  const evals = (rec.evaluations ?? {}) as Record<string, unknown>;
  const perf = (rec.performance ?? {}) as Record<string, unknown>;
  const pric = (rec.pricing ?? {}) as Record<string, unknown>;
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
    median_output_tokens_per_second: perf.median_output_tokens_per_second,
    median_time_to_first_token_seconds: perf.median_time_to_first_token_seconds,
    price_1m_input: pric.price_1m_input_tokens,
    price_1m_output: pric.price_1m_output_tokens,
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
