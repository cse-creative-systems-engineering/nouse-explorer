import type { ModelEntry } from './types';

/**
 * Sort + variant spec for the FilterBar.
 * The sort list mirrors the Nous Portal's own sort options (always present),
 * plus researched axes appended when data exists. The variant dropdown is a
 * secondary single-select filter applied on top of the sort.
 */

export interface SortOption {
  id: string;
  label: string; // exactly as shown (e.g. "Coding: High to Low")
  /** pending = waiting for research data (rendered dashed/disabled) */
  pending?: boolean;
}

/** Researched metric keys we know how to sort by. */
// (metric coverage drives which sort items are enabled)

/** The full sort list, in display order — items marked pending need data we
 *  don't yet have (weekly tokens), so they sit disabled with a "…". */
export function buildSortOptions(metricCoverage: Record<string, number>): SortOption[] {
  const covered = (m: string) => (metricCoverage[m] ?? 0) > 0;
  return [
    { id: 'popular', label: 'Most Popular', pending: !covered('hf_downloads') },
    { id: 'newest', label: 'Newest' },
    { id: 'oldest', label: 'Oldest' },
    { id: 'top_weekly', label: 'Top Weekly', pending: true },
    { id: 'weekly_low', label: 'Weekly Tokens: Low to High', pending: true },
    { id: 'discount_desc', label: 'Discount: High to Low' },
    { id: 'price_asc', label: 'Pricing: Low to High' },
    { id: 'price_desc', label: 'Pricing: High to Low' },
    { id: 'context_desc', label: 'Context: High to Low' },
    { id: 'context_asc', label: 'Context: Low to High' },
    { id: 'throughput_desc', label: 'Throughput: High to Low', pending: !covered('median_output_tokens_per_second') },
    { id: 'throughput_asc', label: 'Throughput: Low to High', pending: !covered('median_output_tokens_per_second') },
    { id: 'latency_asc', label: 'Latency: Low to High', pending: !covered('median_time_to_first_token_seconds') },
    { id: 'latency_desc', label: 'Latency: High to Low', pending: !covered('median_time_to_first_token_seconds') },
    { id: 'intel_desc', label: 'Intelligence: High to Low' },
    { id: 'intel_asc', label: 'Intelligence: Low to High' },
    { id: 'coding_desc', label: 'Coding: High to Low' },
    { id: 'coding_asc', label: 'Coding: Low to High' },
    { id: 'agentic_desc', label: 'Agentic: High to Low' },
    { id: 'agentic_asc', label: 'Agentic: Low to High' },
    { id: 'elo_desc', label: 'Design Arena ELO: High to Low' },
    { id: 'elo_asc', label: 'Design Arena ELO: Low to High' },
    // researched extras beyond the portal list
    { id: 'scicode_desc', label: 'SciCode: High to Low', pending: !covered('scicode') },
    { id: 'livecode_desc', label: 'LiveCodeBench: High to Low', pending: !covered('livecodebench') },
    { id: 'mmlu_desc', label: 'MMLU-Pro: High to Low', pending: !covered('mmlu_pro') },
    { id: 'gpqa_desc', label: 'GPQA: High to Low', pending: !covered('gpqa') },
    { id: 'aime_desc', label: 'AIME: High to Low', pending: !covered('aime') },
    { id: 'math_desc', label: 'AA Math: High to Low', pending: !covered('artificial_analysis_math_index') },
    { id: 'likes_desc', label: 'Most Liked (HF)', pending: !covered('hf_likes') },
  ];
}

export interface VariantOption {
  id: string;
  label: string;
  /** data-inferred variants only exist when the underlying data is present */
  inferred?: boolean;
}

export function buildVariantOptions(metricCoverage: Record<string, number>, profiledCount: number): VariantOption[] {
  const opts: VariantOption[] = [
    { id: 'all', label: 'All models' },
    { id: 'free', label: 'Free' },
    { id: 'vision', label: 'Vision' },
    { id: 'batch', label: 'Batch' },
    { id: 'discounted', label: 'Discounted' },
    { id: 'benchmarked', label: 'Has benchmarks' },
    { id: 'cheap', label: 'Cheap (< $0.50/1M out)' },
    { id: 'multimodal', label: 'Multimodal' },
    { id: 'textonly', label: 'Text-only' },
    // modality selectors — pick exact input/output capability combinations
    { id: 'in_image', label: 'Accepts: Image input' },
    { id: 'in_video', label: 'Accepts: Video input' },
    { id: 'in_audio', label: 'Accepts: Audio input' },
    { id: 'in_file', label: 'Accepts: File input' },
    { id: 'textonly_in', label: 'Accepts: Text input only' },
    { id: 'out_image', label: 'Outputs: Image' },
    { id: 'out_audio', label: 'Outputs: Audio' },
  ];
  // inferred from researched data
  if ((metricCoverage['hf_downloads'] ?? 0) > 0) opts.push({ id: 'popular', label: 'Popular (top 50)', inferred: true });
  if ((metricCoverage['median_output_tokens_per_second'] ?? 0) > 0) {
    opts.push({ id: 'has_speed', label: 'Speed measured', inferred: true });
  }
  if (profiledCount > 0) opts.push({ id: 'profiled', label: 'Research profile', inferred: true });
  return opts;
}

/** Numeric sort value for a model under a given sort id; null = missing (sorts last). */
export function sortValue(m: ModelEntry, sortId: string, extra: Record<string, number> | undefined): number | string | null {
  const aa = m.benchmarks?.artificial_analysis;
  const da = m.benchmarks?.design_arena ?? [];
  const elo = da.length > 0 ? da[0].elo : null;
  const prompt = parseFloat(m.pricing.prompt);
  const completion = parseFloat(m.pricing.completion);
  const orig = m.pricing.original ? parseFloat(m.pricing.original.prompt) : 0;
  const discount = isFinite(prompt) && isFinite(orig) && orig > 0 && prompt < orig ? (1 - prompt / orig) * 100 : null;

  switch (sortId) {
    case 'popular': return extra?.hf_downloads ?? null;
    case 'newest': return m.created ?? null;
    case 'oldest': return m.created ?? null;
    case 'discount_desc': return discount;
    case 'price_asc': case 'price_desc': return isFinite(completion) ? completion : null;
    case 'context_desc': case 'context_asc': return m.context_length ?? null;
    case 'throughput_desc': case 'throughput_asc': return extra?.median_output_tokens_per_second ?? null;
    case 'latency_asc': case 'latency_desc': return extra?.median_time_to_first_token_seconds ?? null;
    // AA indices: prefer embedded catalog value, fall back to researched data
    case 'intel_desc': case 'intel_asc': return aa?.intelligence_index ?? extra?.artificial_analysis_intelligence_index ?? null;
    case 'coding_desc': case 'coding_asc': return aa?.coding_index ?? extra?.artificial_analysis_coding_index ?? null;
    case 'agentic_desc': case 'agentic_asc': return aa?.agentic_index ?? extra?.['artificial_analysis_agentic_index'] ?? null;
    case 'elo_desc': case 'elo_asc': return elo;
    case 'scicode_desc': return extra?.scicode ?? null;
    case 'livecode_desc': return extra?.livecodebench ?? null;
    case 'mmlu_desc': return extra?.mmlu_pro ?? null;
    case 'gpqa_desc': return extra?.gpqa ?? null;
    case 'aime_desc': return extra?.aime ?? null;
    case 'math_desc': return extra?.artificial_analysis_math_index ?? null;
    case 'likes_desc': return extra?.hf_likes ?? null;
    default: return null;
  }
}

export function sortDirection(sortId: string): 'asc' | 'desc' {
  return /asc$|_asc$|low_to_high|low_to_high$/.test(sortId) ? 'asc' : 'desc';
}

/** Apply a variant filter. Returns a new array. */
export function applyVariant(
  list: ModelEntry[],
  variant: string,
  extra: Record<string, Record<string, number>>,
  profiledIds: Set<string> = new Set(),
): ModelEntry[] {
  const isFree = (m: ModelEntry) => m.id.endsWith(':free') ||
    (parseFloat(m.pricing.prompt) === 0 && parseFloat(m.pricing.completion) === 0);
  const hasBench = (m: ModelEntry) => {
    const b = m.benchmarks;
    if (!b) return false;
    if (Array.isArray(b.design_arena) && b.design_arena.length > 0) return true;
    return !!b.artificial_analysis;
  };
  switch (variant) {
    case 'all': return list;
    case 'free': return list.filter(isFree);
    case 'vision': return list.filter((m) => (m.architecture?.input_modalities ?? []).includes('image'));
    case 'batch': return list.filter((m) => m.id.endsWith(':batch'));
    case 'discounted': return list.filter((m) => m.pricing.original && parseFloat(m.pricing.original.prompt) > parseFloat(m.pricing.prompt));
    case 'benchmarked': return list.filter(hasBench);
    case 'cheap': return list.filter((m) => { const c = parseFloat(m.pricing.completion); return isFinite(c) && c > 0 && c * 1e6 <= 0.5; });
    case 'multimodal': return list.filter((m) => (m.architecture?.input_modalities ?? []).some((x) => x !== 'text'));
    case 'textonly': return list.filter((m) => {
      const mods = m.architecture?.input_modalities ?? [];
      return mods.length === 0 || (mods.length === 1 && mods[0] === 'text');
    });
    case 'in_image': return list.filter((m) => (m.architecture?.input_modalities ?? []).includes('image'));
    case 'in_video': return list.filter((m) => (m.architecture?.input_modalities ?? []).includes('video'));
    case 'in_audio': return list.filter((m) => (m.architecture?.input_modalities ?? []).includes('audio'));
    case 'in_file': return list.filter((m) => (m.architecture?.input_modalities ?? []).includes('file'));
    case 'textonly_in': return list.filter((m) => {
      const mods = m.architecture?.input_modalities ?? [];
      return mods.length === 0 || (mods.length === 1 && mods[0] === 'text');
    });
    case 'out_image': return list.filter((m) => (m.architecture?.output_modalities ?? []).includes('image'));
    case 'out_audio': return list.filter((m) => (m.architecture?.output_modalities ?? []).includes('audio'));
    case 'popular': return list.filter((m) => extra[m.id]?.hf_downloads != null).sort((a, b) => (extra[b.id]?.hf_downloads ?? 0) - (extra[a.id]?.hf_downloads ?? 0)).slice(0, 50);
    case 'has_speed': return list.filter((m) => extra[m.id]?.median_output_tokens_per_second != null);
    case 'profiled': return list.filter((m) => profiledIds.has(m.id));
    default: return list;
  }
}
