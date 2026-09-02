import type { ModelEntry } from '../lib/types';

export type Axis =
  | 'coding' | 'intelligence' | 'agentic' | 'speed' | 'latency'
  | 'cost_in' | 'cost_out' | 'context' | 'free' | 'popularity';

export interface QueryAxis {
  axis: Axis;
  /** 1 = higher is better, -1 = lower is better (cost, latency) */
  dir: 1 | -1;
  /** relative weight (default 1) */
  weight: number;
}

export interface ScoredModel {
  model: ModelEntry;
  /** normalized 0..1 score per axis (higher always better after dir applied) */
  scores: Partial<Record<Axis, number>>;
  /** overall weighted score 0..1 */
  total: number;
  /** number of axes with real data */
  covered: number;
  missing: Axis[];
}

/** Extract the numeric value of an axis for a model, or null if unavailable. */
function axisValue(m: ModelEntry, axis: Axis): number | null {
  const aa = m.benchmarks?.artificial_analysis;
  const prompt = parseFloat(m.pricing.prompt);
  const completion = parseFloat(m.pricing.completion);
  switch (axis) {
    case 'coding': return aa?.coding_index ?? null;
    case 'intelligence': return aa?.intelligence_index ?? null;
    case 'agentic': return aa?.agentic_index ?? null;
    case 'speed': return null; // from AA speed metrics (DB) — injected via enrich
    case 'latency': return null;
    case 'cost_in': return isFinite(prompt) ? prompt : null;
    case 'cost_out': return isFinite(completion) ? completion : null;
    case 'context': return m.context_length ?? null;
    case 'free': return (isFinite(prompt) && prompt === 0 && isFinite(completion) && completion === 0) ? 1 : 0;
    case 'popularity': return null; // hf_downloads — injected via enrich
  }
}

export interface ExtraMetrics {
  /** model id -> metric -> value */
  [modelId: string]: Record<string, number>;
}

/**
 * Score models against axes. Each axis is normalized to [0,1] across the
 * population (min-max), then direction applied. Models missing data on an
 * axis are excluded from that axis but not zero-scored — they simply carry
 * fewer covered axes (honest "insufficient data").
 */
export function scoreModels(
  models: ModelEntry[],
  axes: QueryAxis[],
  extra: ExtraMetrics = {},
): ScoredModel[] {
  // value extraction with optional extra-metric injection
  const vals: Array<Partial<Record<Axis, number>>> = models.map((m) => {
    const v: Partial<Record<Axis, number>> = {};
    for (const { axis } of axes) {
      let n = axisValue(m, axis);
      if (n === null && extra[m.id] && axis in extra[m.id]) {
        n = extra[m.id][axis];
      }
      if (axis === 'speed' && extra[m.id]) n = extra[m.id].median_output_tokens_per_second ?? null;
      if (axis === 'popularity' && extra[m.id]) n = extra[m.id].hf_downloads ?? null;
      if (axis === 'latency' && extra[m.id]) n = extra[m.id].median_time_to_first_token_seconds ?? null;
      if (n !== null && Number.isFinite(n)) v[axis] = n;
    }
    return v;
  });

  // min/max per axis for normalization
  const mins: Partial<Record<Axis, number>> = {};
  const maxs: Partial<Record<Axis, number>> = {};
  for (const { axis } of axes) {
    const present = vals.map((v) => v[axis]).filter((x): x is number => x !== undefined);
    if (present.length === 0) continue;
    mins[axis] = Math.min(...present);
    maxs[axis] = Math.max(...present);
  }

  const out: ScoredModel[] = [];
  for (let i = 0; i < models.length; i++) {
    const m = models[i];
    const v = vals[i];
    const scores: Partial<Record<Axis, number>> = {};
    let total = 0;
    let covered = 0;
    let weightSum = 0;
    const missing: Axis[] = [];
    for (const { axis, dir, weight } of axes) {
      const raw = v[axis];
      if (raw === undefined || !(axis in mins) || mins[axis] === maxs[axis]) {
        missing.push(axis);
        continue;
      }
      const norm = (raw - mins[axis]!) / (maxs[axis]! - mins[axis]!);
      scores[axis] = dir === 1 ? norm : 1 - norm;
      total += (scores[axis] ?? 0) * weight;
      weightSum += weight;
      covered += 1;
    }
    out.push({
      model: m,
      scores,
      total: weightSum > 0 ? total / weightSum : 0,
      covered,
      missing,
    });
  }

  // Models with more covered axes rank above equal-scored partial ones
  return out.sort((a, b) => b.total - a.total || b.covered - a.covered);
}

/** Parse a natural-language magic query into axes. */
export function parseMagicQuery(q: string): QueryAxis[] {
  const s = q.toLowerCase();
  const axes: QueryAxis[] = [];
  const push = (axis: Axis, dir: 1 | -1, weight = 1) => {
    if (!axes.some((a) => a.axis === axis)) axes.push({ axis, dir, weight });
  };
  // capability
  if (/\bcod(e|ing|er|es)\b/.test(s)) push('coding', 1, 2);
  if (/\b(agentic|autonomous)\b/.test(s)) push('agentic', 1, 1.5);
  if (/\b(smart|intelligen|capable|best)\b/.test(s)) push('intelligence', 1, 1.5);
  if (/\breasoning\b/.test(s)) push('intelligence', 1, 1.5);
  // speed
  if (/\b(fast|speed|quick|rapid)\b/.test(s)) push('speed', 1, 2);
  if (/\b(latency|low.latency|responsive)\b/.test(s)) push('latency', -1, 1.5);
  // cost
  if (/\b(cheap|cheapest|affordable|low.cost|budget|value)\b/.test(s)) push('cost_out', -1, 1.5);
  if (/\b(expensive|premium)\b/.test(s)) push('cost_out', 1, 1);
  if (/\bfree\b/.test(s)) push('free', 1, 3);
  // context
  if (/\b(context|long.window|big.window)\b/.test(s)) push('context', 1, 1);
  // popularity
  if (/\b(popular|most used|adopted|downloads)\b/.test(s)) push('popularity', 1, 1);
  if (axes.length === 0) push('intelligence', 1, 1); // default: "best"
  return axes;
}
