/**
 * Column registry — the single source of truth for every data column the
 * table can show. Each entry carries the display label, a thorough tooltip
 * (what the metric means, where it comes from, how to read it), formatting,
 * and the value getter. The Column Manager reads this to let users add,
 * exclude, and reorder columns; the table reads it to render cells and
 * headers; persistence stores ordered column ids.
 */

import type { ModelEntry } from './types';

export interface ColumnDef {
  id: string;
  label: string;
  /** Thorough explanation shown in the header tooltip. */
  tip: string;
  /** Grouping in the Column Manager (identification / pricing / benchmarks / research). */
  group: 'Model' | 'Pricing' | 'Benchmarks (catalog)' | 'Research (Artificial Analysis)' | 'Research (Hugging Face)';
  align?: 'left' | 'right';
  defaultWidth: number;
  /** true = shown by default */
  defaultOn: boolean;
  /** true = cannot be excluded (Model name) */
  pinned?: boolean;
  value: (m: ModelEntry, extra?: Record<string, number>) => number | string | null;
  format: (v: number | string | null) => string;
  /** Sortable asc by default (text, dates) vs desc (scores, prices). */
  defaultSortDir?: 'asc' | 'desc';
}

const dash = '—';

function num(digits = 1): (v: number | string | null) => string {
  return (v) => (typeof v === 'number' && isFinite(v) ? v.toFixed(digits) : dash);
}

/** Price in $ per 1M tokens, human-formatted. */
function price(v: number | string | null): string {
  if (typeof v !== 'number' || !isFinite(v)) return dash;
  if (v === 0) return 'Free';
  if (v < 0.1) return `$${v.toFixed(4)}`;
  if (v < 100) return `$${v.toFixed(2)}`;
  return `$${v.toFixed(1)}`;
}

/** Raw pricing strings are $/token — convert to $/1M for display consistency. */
function per1M(raw: string | undefined): number | null {
  const n = parseFloat(raw ?? '');
  return isFinite(n) ? n * 1e6 : null;
}

function ctxFmt(v: number | string | null): string {
  if (typeof v !== 'number' || v <= 0) return dash;
  if (v >= 1e6) return `${(v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 1)}M`;
  return `${Math.round(v / 1000)}K`;
}

export const COLUMNS: ColumnDef[] = [
  // ── Model ────────────────────────────────────────────
  {
    id: 'name',
    label: 'Model',
    group: 'Model',
    pinned: true,
    defaultOn: true,
    defaultWidth: 260,
    defaultSortDir: 'asc',
    tip: 'The model\u2019s display name as listed on the Nous Portal, with its full portal identifier (provider/model-id) underneath. Batch variants (offline processing at a discount) and free variants are badged on the name. Click any row to open the full profile.',
    value: (m) => (m.name ?? m.id).toLowerCase(),
    format: () => '', // rendered specially (name + id + badges)
  },
  {
    id: 'provider',
    label: 'Provider',
    group: 'Model',
    defaultOn: true,
    defaultWidth: 110,
    defaultSortDir: 'asc',
    tip: 'The organization operating the model, derived from the portal identifier prefix (e.g. \u201canthropic/\u201d, \u201copenai/\u201d). Models from the same provider often share pricing structure and context limits.',
    value: (m) => m.id.split('/')[0] ?? '',
    format: (v) => String(v ?? dash).toUpperCase(),
  },
  {
    id: 'context',
    label: 'Context',
    group: 'Model',
    defaultOn: true,
    defaultWidth: 92,
    align: 'right',
    tip: 'Maximum context window in tokens — how much text (prompt + response combined) the model can attend to in one request. Larger is better for long documents or conversations: 128K tokens \u2248 a 300-page book. Models marked 1M can hold roughly 1,500 pages.',
    value: (m) => m.context_length ?? null,
    format: ctxFmt,
  },

  // ── Pricing ──────────────────────────────────────────
  {
    id: 'prompt',
    label: 'Input $/1M',
    group: 'Pricing',
    defaultOn: true,
    defaultWidth: 96,
    align: 'right',
    tip: 'Cost per 1,000,000 input (prompt) tokens — what you pay for the text you send to the model. Compare across providers at the same scale: a model at $2.00/1M input costs $2 to process ~1,500 pages of prompts. Cheaper isn\u2019t always better; weigh against the intelligence columns.',
    value: (m) => per1M(m.pricing.prompt),
    format: price,
  },
  {
    id: 'completion',
    label: 'Output $/1M',
    group: 'Pricing',
    defaultOn: true,
    defaultWidth: 104,
    align: 'right',
    tip: 'Cost per 1,000,000 output (completion) tokens — what you pay for the text the model generates. Output is usually 3\u20135\u00d7 the input price because generation is compute-heavier. For chat-heavy workloads this is often the dominant cost.',
    value: (m) => per1M(m.pricing.completion),
    format: price,
  },
  {
    id: 'discount',
    label: 'Discount',
    group: 'Pricing',
    defaultOn: true,
    defaultWidth: 92,
    align: 'right',
    tip: 'Percentage off the model\u2019s list price, when the provider is running a promotion (hover a badge for the was/now breakdown). Promotional pricing can change or expire; the \u201cwas\u201d price is the number to expect when the promo ends.',
    value: (m) => {
      const r = m.pricing.original;
      if (!r) return null;
      const p = parseFloat(m.pricing.prompt);
      const o = parseFloat(r.prompt);
      if (isFinite(p) && isFinite(o) && o > 0 && p < o) return (1 - p / o) * 100;
      return null;
    },
    format: (v) => (typeof v === 'number' ? `\u2212${v.toFixed(0)}%` : dash),
  },
  {
    id: 'blended_price',
    label: 'Blended $/1M',
    group: 'Pricing',
    defaultOn: false,
    defaultWidth: 110,
    align: 'right',
    tip: 'Artificial Analysis\u2019 blended price per 1M tokens, weighting input and output 3:1 — a single number approximating the cost of a typical workload (3 input tokens per 1 output token). Useful for quick cross-model cost comparison without picking a side of the input/output split.',
    value: (_m, extra) => extra?.price_1m_blended_3_to_1 ?? null,
    format: price,
  },

  // ── Speed / latency ──────────────────────────────────
  {
    id: 'speed',
    label: 'Speed t/s',
    group: 'Research (Artificial Analysis)',
    defaultOn: true,
    defaultWidth: 96,
    align: 'right',
    tip: 'Median output generation speed in tokens per second, measured by Artificial Analysis\u2019 independent benchmarking. Higher is a snappier experience; below ~20 t/s a streaming response starts to feel slow for interactive use. This is median across their standardized test prompts, not a provider-advertised number.',
    value: (_m, extra) => extra?.median_output_tokens_per_second ?? null,
    format: (v) => (typeof v === 'number' ? String(Math.round(v)) : dash),
  },
  {
    id: 'latency',
    label: 'TTFT s',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 84,
    align: 'right',
    defaultSortDir: 'asc',
    tip: 'Median Time To First Token, in seconds — how long until the first word of the response appears after you hit send. This is the \u201cperceived responsiveness\u201d number for chat: lower is better. A model can stream fast (high t/s) but still feel sluggish if TTFT is high.',
    value: (_m, extra) => extra?.median_time_to_first_token_seconds ?? null,
    format: num(2),
  },
  {
    id: 'tfat',
    label: 'TFAT s',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 84,
    align: 'right',
    defaultSortDir: 'asc',
    tip: 'Median Time To First Answer Token (Artificial Analysis). Similar to TTFT but specifically the first token of the substantive answer — models that emit a long reasoning preamble before answering score worse here. Lower is better for \u201cstraight to the point\u201d interactions.',
    value: (_m, extra) => extra?.median_time_to_first_answer_token ?? null,
    format: num(2),
  },

  // ── Benchmarks: catalog-embedded, fallback to researched ──
  {
    id: 'coding',
    label: 'Coding',
    group: 'Benchmarks (catalog)',
    defaultOn: true,
    defaultWidth: 82,
    align: 'right',
    tip: 'Artificial Analysis Coding Index — a composite score of how well the model writes and reasons about code across standard coding evaluations. Higher is better; the scale roughly runs 0\u2013100 with frontier models in the 60\u201380 band. Values come from the catalog when embedded, otherwise from live AA research.',
    value: (m, extra) => m.benchmarks?.artificial_analysis?.coding_index ?? extra?.artificial_analysis_coding_index ?? null,
    format: num(1),
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    group: 'Benchmarks (catalog)',
    defaultOn: true,
    defaultWidth: 108,
    align: 'right',
    tip: 'Artificial Analysis Intelligence Index — their headline composite of reasoning ability across many evaluations (knowledge, math, coding, analysis). Higher is better; think of it as a single \u201chow smart is this model\u201d number. Frontier models cluster in the 50\u201370 range; the scale is normalized so cross-model comparison is direct.',
    value: (m, extra) => m.benchmarks?.artificial_analysis?.intelligence_index ?? extra?.artificial_analysis_intelligence_index ?? null,
    format: num(1),
  },
  {
    id: 'agentic',
    label: 'Agentic',
    group: 'Benchmarks (catalog)',
    defaultOn: true,
    defaultWidth: 84,
    align: 'right',
    tip: 'Artificial Analysis Agentic Index — how well the model handles multi-step tool-using agent tasks (calling functions, iterating on results, recovering from errors). Higher is better. Only models whose catalog entry embeds this index show a value: Artificial Analysis retired this metric from their live API, so no new data is being collected.',
    value: (m, extra) => m.benchmarks?.artificial_analysis?.agentic_index ?? extra?.artificial_analysis_agentic_index ?? null,
    format: num(1),
  },

  // ── Research-only benchmarks ─────────────────────────
  {
    id: 'gpqa',
    label: 'GPQA',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 84,
    align: 'right',
    tip: 'GPQA (Graduate-Level Google-Proof Q&A) — extremely hard multiple-choice science questions written by PhD domain experts, designed so that even skilled non-experts with web access score ~34%. A top-tier test of deep scientific reasoning: frontier models score 60\u201385%, older models fall below 50%. Higher is better.',
    value: (_m, extra) => extra?.gpqa ?? null,
    format: num(1),
  },
  {
    id: 'hle',
    label: 'HLE',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 76,
    align: 'right',
    tip: 'Humanity\u2019s Last Exam — a frontier benchmark of 2,500+ expert-written questions across mathematics, physics, and other hard sciences, deliberately harder than any prior benchmark (many models score in single digits). Designed to be the \u201clast exam\u201d before AI exceeds expert-level human performance. Higher is better; even small differences are meaningful here.',
    value: (_m, extra) => extra?.hle ?? null,
    format: num(1),
  },
  {
    id: 'mmlu',
    label: 'MMLU-Pro',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 100,
    align: 'right',
    tip: 'MMLU-Pro — the harder, reasoning-focused successor to the classic MMLU knowledge exam: 12,000+ ten-choice questions across 14 domains (law, medicine, engineering, humanities). Measures broad world knowledge plus reasoning. Higher is better; strong models score 70\u201385%. Note: knowledge-heavy, so it saturates less than older MMLU but rewards memorization more than GPQA.',
    value: (_m, extra) => extra?.mmlu_pro ?? null,
    format: num(1),
  },
  {
    id: 'livecodebench',
    label: 'LiveCodeBench',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 118,
    align: 'right',
    tip: 'LiveCodeBench — competitive-programming problems (from LeetCode/AtCoder/Codeforces) published continuously after the model\u2019s training cutoff, so scores can\u2019t be gamed by memorization. Measures genuine algorithmic problem-solving: read the problem, write correct code. Higher is better.',
    value: (_m, extra) => extra?.livecodebench ?? null,
    format: num(1),
  },
  {
    id: 'scicode',
    label: 'SciCode',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 88,
    align: 'right',
    tip: 'SciCode — research-grade scientific computing problems (physics simulation, numerical methods) drawn from real graduate-level science workflows, requiring multi-step code synthesis. One of the hardest coding benchmarks; even frontier models historically scored below 30%. Higher is better.',
    value: (_m, extra) => extra?.scicode ?? null,
    format: num(2),
  },
  {
    id: 'aime',
    label: 'AIME',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 84,
    align: 'right',
    tip: 'AIME (American Invitational Mathematics Examination) — olympiad-qualifier math problems requiring multi-step symbolic reasoning with exact integer answers. AA reports the AIME 2024 set here. Elite math benchmark: top models score 80\u201390%+, mid-tier models below 40%. Higher is better.',
    value: (_m, extra) => extra?.aime ?? null,
    format: num(1),
  },
  {
    id: 'aime_25',
    label: 'AIME 2025',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 100,
    align: 'right',
    tip: 'AIME 2025 — the newer AIME problem set, released after most training cutoffs and therefore more contamination-resistant than AIME 2024. Same olympiad-qualifier format and scoring; a model scoring much lower here than on AIME 2024 is likely benefiting from training-data overlap on the older set. Higher is better.',
    value: (_m, extra) => extra?.aime_25 ?? null,
    format: num(1),
  },
  {
    id: 'math_500',
    label: 'MATH-500',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 100,
    align: 'right',
    tip: 'MATH-500 — a 500-problem subset of the MATH dataset covering competition mathematics (algebra, geometry, number theory, counting & probability). Sits between MMLU-Pro and AIME in difficulty. Higher is better; strong models exceed 90%.',
    value: (_m, extra) => extra?.math_500 ?? null,
    format: num(1),
  },
  {
    id: 'ifbench',
    label: 'IFBench',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 88,
    align: 'right',
    tip: 'IFBench (Instruction-Following Benchmark) — measures how precisely a model obeys explicit constraints in the prompt: formats, lengths, forbidden words, structural requirements. High intelligence with poor instruction-following still produces unusable answers; this is the \u201cdoes what you asked\u201d score. Higher is better.',
    value: (_m, extra) => extra?.ifbench ?? null,
    format: num(1),
  },
  {
    id: 'tau2',
    label: '\u03c4\u00b2-Bench',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 92,
    align: 'right',
    tip: '\u03c4\u00b2-Bench (Tau-Bench 2) — agentic customer-service simulations: the model plays an agent with tools (refunds, bookings, account changes) against a simulated user, scored on completing the task while respecting policy. Measures tool-use discipline, not raw knowledge. Higher is better.',
    value: (_m, extra) => extra?.tau2 ?? null,
    format: num(1),
  },
  {
    id: 'terminalbench',
    label: 'TerminalBench',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 112,
    align: 'right',
    tip: 'Terminal-Bench (hard split) — real terminal/shell tasks: navigate an unfamiliar filesystem, install dependencies, debug, edit files, run builds. This is the closest benchmark to \u201ccan it actually operate a computer\u201d and the agentic coding workflows built on that. Higher is better.',
    value: (_m, extra) => extra?.terminalbench_hard ?? null,
    format: num(1),
  },
  {
    id: 'lcr',
    label: 'LCR',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 76,
    align: 'right',
    tip: 'LCR (Live Code Reasoning) — Artificial Analysis\u2019 evaluation of code-reasoning quality on fresh problems. Complements the composite Coding Index with a single-skill read; useful for spotting models whose composite score hides weak code reasoning. Higher is better.',
    value: (_m, extra) => extra?.lcr ?? null,
    format: num(1),
  },

  // ── Hugging Face community signal ────────────────────
  {
    id: 'downloads',
    label: 'HF Downloads',
    group: 'Research (Hugging Face)',
    defaultOn: false,
    defaultWidth: 112,
    align: 'right',
    tip: 'Total downloads of the model\u2019s weights on Hugging Face — a raw popularity/usage signal for open-weight models. High downloads mean a large community, more fine-tunes, and more battle-tested behavior. Not a quality measure: marketing and recency inflate it. Closed models (API-only) have no HF page and show a dash.',
    value: (_m, extra) => extra?.hf_downloads ?? null,
    format: (v) => (typeof v === 'number' && isFinite(v) ? v.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 }) : dash),
  },
  {
    id: 'likes',
    label: 'HF Likes',
    group: 'Research (Hugging Face)',
    defaultOn: false,
    defaultWidth: 90,
    align: 'right',
    tip: 'Hugging Face \u201clikes\u201d on the model\u2019s repository — community endorsement, closer to GitHub stars than to downloads. A denser quality signal than raw downloads (people like things they rate highly, not merely use), but still popularity-biased toward recent, well-marketed releases. Closed models show a dash.',
    value: (_m, extra) => extra?.hf_likes ?? null,
    format: (v) => (typeof v === 'number' && isFinite(v) ? v.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 }) : dash),
  },
];

export const COLUMN_BY_ID: Record<string, ColumnDef> = Object.fromEntries(
  COLUMNS.map((c) => [c.id, c]),
);

export const DEFAULT_ORDER: string[] = COLUMNS.map((c) => c.id);

/** Sort value for the table header sort. Returns string | number | null. */
export function columnSortValue(id: string, m: ModelEntry, extra?: Record<string, number>): number | string | null {
  const def = COLUMN_BY_ID[id];
  return def ? def.value(m, extra) : null;
}
