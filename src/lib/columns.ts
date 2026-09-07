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
  /** One-line plain-language summary shown in the Column Manager. */
  summary: string;
  /** Thorough explanation shown in the header tooltip. */
  tip: string;
  /** Grouping in the Column Manager (identification / pricing / benchmarks / research). */
  group: 'Model' | 'Pricing' | 'Benchmarks (catalog)' | 'Research (Artificial Analysis)' | 'Research (Hugging Face)' | 'Provider-reported';
  align?: 'left' | 'right';
  defaultWidth: number;
  /** true = shown by default */
  defaultOn: boolean;
  /** true = cannot be excluded (Model name) */
  pinned?: boolean;
  /** provider-reported (not independently benchmarked) — renders amber */
  unofficial?: boolean;
  /** provider-reported fallback value when the main source has no data */
  providerValue?: (m: ModelEntry, extra?: Record<string, number>) => number | null;
  value: (m: ModelEntry, extra?: Record<string, number>) => number | string | null;
  format: (v: number | string | null) => string;
  /** Sortable asc by default (text, dates) vs desc (scores, prices). */
  defaultSortDir?: 'asc' | 'desc';
}
const dash = '—';
function num(digits = 1): (v: number | string | null) => string {
  return (v) => {
    if (v === 'N/A') return 'N/A';
    return typeof v === 'number' && isFinite(v) ? v.toFixed(digits) : dash;
  };
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

/** Models that cannot code by design (embedding / audio-only models).
 *  Their benchmark columns render "N/A" — a documented absence, not missing data. */
const NON_CODING_MARKERS = [
  'voyageai/', 'text-embedding', 'gemini-embedding', 'qwen3-embedding', 'pplx-embed',
  'bge-', '/bge-', 'e5-large', 'e5-base', 'multilingual-e5', 'minilm', 'mpnet',
  'paraphrase-', 'gte-base', 'gte-large', 'multi-qa-', 'gte_',
];
const NON_CODING_EXACT = new Set(['openai/gpt-audio', 'openai/gpt-audio-mini']);
export function isNonCodingModel(id: string): boolean {
  const low = id.toLowerCase();
  return NON_CODING_MARKERS.some((m) => low.includes(m)) || NON_CODING_EXACT.has(low);
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
    summary: 'Model name, portal ID, and free/batch badges.',
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
    summary: 'Which company operates the model.',
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
    tip: 'Maximum tokens (input + output combined) the model can attend to in one request.\n\nPRACTICAL: 128K ≈ a 300-page book; 1M ≈ a small codebase or ~20 hours of transcripts. But \'fits in context\' ≠ \'reasons well over it\' — many models degrade on long-context recall even when they accept the tokens.\n\nCHOOSE BY: Hard requirement first: if your documents exceed it, the model is out. Then preference: more context helps RAG, long conversations, and repo-scale analysis — but costs more per request and can dilute attention.',
    summary: 'How much text the model can handle in one request.',
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
    tip: 'What you pay per 1M tokens of input — the text you send (system prompt, documents, conversation history).\n\nPRACTICAL: RAG and long-context workloads are input-dominated: a 50K-token context re-sent every turn at $3/1M costs $0.15/turn. Chat is usually input-light.\n\nCHOOSE BY: The deciding cost column for retrieval/long-document workloads and for agentic loops that re-send history. Compare against completion price for your actual prompt:answer ratio.',
    summary: 'What you pay for the text you send, per million tokens.',
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
    tip: 'What you pay per 1M tokens of output — the text the model generates.\n\nPRACTICAL: Usually 3–5× the input price because generation is compute-heavier. Verbose models + high output price = surprise bills; check the speed column too (slow × expensive is the worst quadrant).\n\nCHOOSE BY: The deciding cost column for generation-heavy work: code generation, long-form writing, agent loops that produce many tokens.',
    summary: 'What you pay for the text the model writes, per million tokens.',
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
    tip: 'Percentage off list price under the provider\'s current promotion.\n\nPRACTICAL: This is real, currently-billable pricing — not a coupon. But promos expire: budget for the \'Original\' price when planning long-term costs.\n\nCHOOSE BY: A -20% on an expensive model can beat a cheap model\'s list price. Compare discounted-against-list when the discount applies to your workload, but check the original prices for your cost projections.',
    summary: 'Current promo pricing vs list price.',
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
    tip: 'AA\'s blended price: (3× input + 1× output) / 4 — one number approximating a typical chat workload\'s cost per 1M tokens.\n\nPRACTICAL: Chat-like workloads (short prompts, longer answers) land near this number. Long-document ingestion (RAG, summarization) costs more (input-heavy); code generation costs less (output-heavy).\n\nCHOOSE BY: The fastest way to compare true cost across models with different input/output ratios. For your exact workload, compute from the Input and Output columns instead.',
    summary: 'Single-number cost estimate for a typical workload (3:1 in:out).',
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
    tip: 'Median output speed in tokens/second, measured independently by AA on standardized prompts.\n\nPRACTICAL: 150+ feels instant for any use; 60–150 is comfortable for chat and coding; 20–60 is fine for background/async work; below 20 makes users watch text appear.\n\nCHOOSE BY: Weight it for interactive products (chat UIs, IDE assistants, live agents) and for high-volume batch jobs where throughput = cost. Ignore for offline pipelines where only price-per-token matters. Batch variants are usually slower but cheaper.',
    summary: 'How fast the model generates text, measured independently.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.median_output_tokens_per_second ?? null),
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
    tip: 'Median time to first token, in seconds — how long until the response starts appearing.\n\nPRACTICAL: <1s feels instant; 1–3s is normal for reasoning models; 5s+ makes users think it\'s broken. Reasoning models are slower here because they think before speaking.\n\nCHOOSE BY: Critical for chat UX and voice pipelines; irrelevant for batch processing. A high-latency high-speed model is fine for long generations but painful for short answers.',
    summary: 'Seconds until the first word appears — perceived responsiveness.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.median_time_to_first_token_seconds ?? null),
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
    tip: 'Time to first ANSWER token — like TTFT but measuring until the model starts its actual answer, skipping reasoning preamble.\n\nPRACTICAL: For reasoning models, TTFT includes thinking time but TFAT doesn\'t — a model with 8s TTFT and 2s TFAT shows \'thinking...\' then answers fast.\n\nCHOOSE BY: Better than TTFT for judging perceived snappiness of reasoning models in chat. Irrelevant for non-reasoning models (values will be similar).',
    summary: 'Seconds until the first token of the actual answer (skips preamble).',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.median_time_to_first_answer_token ?? null),
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
    tip: 'AA\'s composite of code-writing and code-reasoning ability.\n\nPRACTICAL: 70+ handles production coding agents and complex refactors reliably; 50–70 is solid for IDE autocomplete and routine tasks; below 40 will fight you on anything multi-file.\n\nCHOOSE BY: This is your primary column if you\'re picking a coding agent, comparing models for a dev tool, or deciding if a cheap model can handle your repo. Ignore it for pure chat/summarization workloads — a low-coding model can still be an excellent writer.',
    summary: 'Composite code-writing ability score (0–100).',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (m.benchmarks?.artificial_analysis?.coding_index ?? extra?.artificial_analysis_coding_index ?? null),
    format: num(1),
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    group: 'Benchmarks (catalog)',
    defaultOn: true,
    defaultWidth: 108,
    align: 'right',
    tip: 'AA\'s headline \'how smart is this model\' composite across knowledge, math, coding, and analysis evals.\n\nPRACTICAL: 50+ = frontier reasoning for research, planning, and multi-step analysis; 30–50 handles everyday assistant work well; below 20 suits simple routing, classification, extraction.\n\nCHOOSE BY: Best single column when you\'re choosing one general model for mixed workloads. But it averages everything — a model with lower intelligence but a top coding score beats it for coding specifically. Cross-check the specialized columns for your actual workload.',
    summary: 'Headline "how smart is this model" composite score.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (m.benchmarks?.artificial_analysis?.intelligence_index ?? extra?.artificial_analysis_intelligence_index ?? null),
    format: num(1),
  },
  {
    id: 'agentic',
    label: 'Agentic',
    group: 'Benchmarks (catalog)',
    defaultOn: true,
    defaultWidth: 84,
    align: 'right',
    tip: 'AA\'s Agentic Index: multi-step tool-using agent tasks — calling functions, iterating on results, recovering from errors.\n\nPRACTICAL: 55+ powers autonomous agent loops; 35–55 works as a step-by-step assistant; below 25 should only act with a human in the loop.\n\nCHOOSE BY: Key for agent frameworks, MCP/tool-use products, and automation. Note: AA retired this metric, so values only exist for models whose catalog embedded it — newer models will show nothing here regardless of ability.',
    summary: 'Multi-step tool-using agent task ability (no longer updated by AA).',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (m.benchmarks?.artificial_analysis?.agentic_index ?? extra?.artificial_analysis_agentic_index ?? null),
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
    tip: 'Accuracy on PhD-level science questions in biology, physics, chemistry — questions experts designed so skilled non-experts with Google score only ~34%.\n\nPRACTICAL: 85+ can reason through graduate-level scientific problems; 60–85 handles technical Q&A and scientific literature work; below 40 will confidently produce plausible-sounding nonsense on hard science.\n\nCHOOSE BY: Critical for scientific research tools, technical docs assistants, and education products. Skip it for general chat — it correlates with intelligence but adds nothing for non-technical work.',
    summary: 'PhD-level science reasoning exam — frontier models score 60–85%.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.gpqa ?? null),
    providerValue: (_m, extra) => extra?.provider_gpqa_diamond ?? null,
    format: num(1),
  },
  {
    id: 'hle',
    label: 'HLE',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 76,
    align: 'right',
    tip: 'Accuracy on Humanity\'s Last Exam: 2,500+ expert questions at the edge of human knowledge, deliberately harder than any prior benchmark.\n\nPRACTICAL: 30+ is frontier-tier deep reasoning; 10–30 shows real but limited expert reasoning; single digits is normal for most models — this test is brutal by design.\n\nCHOOSE BY: Only relevant when you need maximum reasoning depth on genuinely novel problems (research, novel math, hard science). For everyday workloads ignore it entirely — a model scoring 5 vs 15 here can be identical for chat and coding.',
    summary: 'The hardest expert-written exam; even top models score low.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.hle ?? null),
    format: num(1),
  },
  {
    id: 'mmlu',
    label: 'MMLU-Pro',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 100,
    align: 'right',
    tip: 'Accuracy on MMLU-Pro: 12,000+ ten-choice questions across 14 domains (law, medicine, engineering, humanities) — the harder successor to classic MMLU.\n\nPRACTICAL: 80+ has broad reliable world knowledge; 60–80 is solid general knowledge with occasional gaps; below 45 will misstate facts outside its training focus.\n\nCHOOSE BY: Matters for knowledge-worker assistants (legal, medical, research) where factual breadth is the job. Less predictive for agentic coding or tool use — check the agentic/coding columns for that.',
    summary: 'Broad knowledge + reasoning across 14 domains.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.mmlu_pro ?? null),
    format: num(1),
  },
  {
    id: 'livecodebench',
    label: 'LiveCodeBench',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 118,
    align: 'right',
    tip: 'Pass rate on LiveCodeBench: competitive-programming problems published after each model\'s training cutoff, so scores can\'t be gamed by memorization.\n\nPRACTICAL: 85+ writes correct algorithmic solutions to unseen problems; 60–85 solves most standard problems; below 40 struggles with anything requiring novel logic.\n\nCHOOSE BY: The most contamination-resistant coding column — prefer it over the coding index when comparing models that trained on LeetCode-style data. If you need an algorithmic coder (not tool-using agent), weigh this heavily.',
    summary: 'Fresh competitive-programming problems — can’t be memorized.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.livecodebench ?? null),
    providerValue: (_m, extra) => extra?.provider_livecodebench_v6 ?? extra?.provider_livecodebench ?? null,
    format: num(1),
  },
  {
    id: 'scicode',
    label: 'SciCode',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 88,
    align: 'right',
    tip: 'Score on SciCode: graduate-level scientific computing — writing multi-step numerical/simulation code from real research workflows.\n\nPRACTICAL: 50+ can implement scientific computing pipelines; 25–50 handles simpler computational tasks; below 15 shouldn\'t be trusted with simulation or numerical work.\n\nCHOOSE BY: Niche but decisive for scientific/engineering tooling (physics sims, data analysis pipelines). Ignore entirely for web/app development — it tests a very specific kind of coding.',
    summary: 'Graduate-level scientific computing problems. Very hard.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.scicode ?? null),
    format: num(2),
  },
  {
    id: 'aime',
    label: 'AIME',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 84,
    align: 'right',
    tip: 'Accuracy on AIME 2024: olympiad-qualifier math requiring multi-step symbolic reasoning with exact integer answers.\n\nPRACTICAL: 85+ does elite symbolic math; 50–85 handles advanced applied math reliably; below 20 will make arithmetic and logic slips on multi-step problems.\n\nCHOOSE BY: Decisive for anything math-heavy — financial modeling, quantitative analysis, theorem-like reasoning. Irrelevant for prose, chat, or CRUD coding.',
    summary: 'Olympiad-qualifier math, 2024 set. Elite models score 80–90%+.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.aime ?? null),
    format: num(1),
  },
  {
    id: 'aime_25',
    label: 'AIME 2025',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 100,
    align: 'right',
    tip: 'Same as AIME but the 2025 problem set, released after most training cutoffs.\n\nPRACTICAL: Identical interpretation to AIME, but a model scoring much lower here than on AIME (2024) is likely benefiting from training-data overlap — trust this number more.\n\nCHOOSE BY: Use instead of AIME when comparing recent models; use the AIME-vs-AIME-2025 gap to sniff out memorization.',
    summary: 'The 2025 AIME set — more contamination-resistant.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.aime_25 ?? null),
    format: num(1),
  },
  {
    id: 'math_500',
    label: 'MATH-500',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 100,
    align: 'right',
    tip: 'Accuracy on MATH-500: 500 competition problems spanning algebra, geometry, number theory, counting.\n\nPRACTICAL: 90+ is excellent at structured math; 70–90 reliable for applied math; below 50 means double-check any math output.\n\nCHOOSE BY: Sits between MMLU-Pro (easy) and AIME (hard). Relevant for education tools and applied math; skip for general use.',
    summary: 'Competition math (algebra, geometry, number theory).',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.math_500 ?? null),
    format: num(1),
  },
  {
    id: 'ifbench',
    label: 'IFBench',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 88,
    align: 'right',
    tip: 'Score on IFBench: how precisely the model obeys explicit constraints in the prompt — exact formats, lengths, forbidden words, structural rules.\n\nPRACTICAL: 80+ follows complex specs without drift; 55–80 needs you to double-check format compliance; below 35 will \'helpfully\' ignore your constraints.\n\nCHOOSE BY: Underrated and decisive for structured-output work (JSON pipelines, report generators, template filling, agent systems that must emit valid tool calls). A brilliant model with a low IFBench score is a bad choice for automation.',
    summary: 'How precisely the model follows explicit instructions.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.ifbench ?? null),
    format: num(1),
  },
  {
    id: 'tau2',
    label: '\u03c4\u00b2-Bench',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 92,
    align: 'right',
    tip: 'Score on τ²-Bench: simulated customer-service scenarios where the model must use tools, follow policy, and drive a multi-turn conversation to resolution.\n\nPRACTICAL: 75+ runs agentic workflows with discipline; 50–75 works with good guardrails; below 30 needs heavy human oversight.\n\nCHOOSE BY: The best proxy for \'can it power a support bot / booking agent / internal tool agent\'. Weigh it for any product where the model takes actions on behalf of users.',
    summary: 'Simulated customer-service agent tasks with tools.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.tau2 ?? null),
    format: num(1),
  },
  {
    id: 'terminalbench',
    label: 'TerminalBench',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 112,
    align: 'right',
    tip: 'Score on Terminal-Bench (hard split): real terminal tasks — navigating filesystems, installing dependencies, debugging, editing files, running builds.\n\nPRACTICAL: 55+ can drive devtools and coding agents competently; 30–55 works with a tight harness; below 15 will flounder unsupervised in a shell.\n\nCHOOSE BY: The closest benchmark to \'can this model power Claude-Code-style agents\'. Decisive for CLI agents, DevOps automation, and computer-use products.',
    summary: 'Real terminal/shell tasks — "can it operate a computer".',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.terminalbench_hard ?? null),
    providerValue: (_m, extra) => extra?.provider_terminalbench ?? null,
    format: num(1),
  },
  {
    id: 'lcr',
    label: 'LCR',
    group: 'Research (Artificial Analysis)',
    defaultOn: false,
    defaultWidth: 76,
    align: 'right',
    tip: 'AA\'s Live Code Reasoning score: code-reasoning quality on fresh problems, isolated from the composite coding index.\n\nPRACTICAL: Read it alongside the coding index — a high coding index with a low LCR suggests the composite is flattered by other components.\n\nCHOOSE BY: A tiebreaker between models with similar coding indices; also a sanity check on whether a model\'s coding reputation is real.',
    summary: 'AA’s single-skill code-reasoning read.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.lcr ?? null),
    format: num(1),
  },

  // ── SWE-bench (provider-reported) — no AA equivalent exists ──
  {
    id: 'swebench',
    label: 'SWE-bench (provider)',
    group: 'Provider-reported',
    defaultOn: false,
    defaultWidth: 150,
    align: 'right',
    summary: 'Provider-claimed SWE-bench % — self-reported, amber.',
    tip: 'SWE-bench score as reported by the provider itself — percentage of real GitHub issues resolved in the provider\'s own chosen harness.\n\nPRACTICAL: 70+ claims strong agentic coding; 50–70 is solid; below 30 is weak for repo-level work. BUT: providers pick their best scaffold, and scores aren\'t independently verified — treat as marketing-grade until AA confirms.\n\nCHOOSE BY: Only source for models AA hasn\'t benchmarked. When both exist, prefer the AA coding index for comparisons; use this for models with no AA data.',
    value: () => null,
    providerValue: (_m, extra) => extra?.provider_swebench_verified ?? extra?.provider_swebench_pro ?? null,
    format: (v) => (typeof v === 'number' ? `${v.toFixed(1)}%` : dash),
    unofficial: true,
  },

  // ── Hugging Face community signal ────────────────────
  {
    id: 'downloads',
    label: 'HF Downloads',
    group: 'Research (Hugging Face)',
    defaultOn: false,
    defaultWidth: 112,
    align: 'right',
    tip: 'Total lifetime downloads of the model\'s open weights on Hugging Face.\n\nPRACTICAL: High downloads = large community: more fine-tunes, tutorials, and known-edge-cases. But it measures popularity, not quality — marketing and recency inflate it, and it says nothing about closed/API models.\n\nCHOOSE BY: Relevant when choosing an open model to self-host (community support matters). Irrelevant for API-only models — absence of a number here means closed weights, not obscurity.',
    summary: 'Community usage of the open weights on Hugging Face.',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.hf_downloads ?? null),
    format: (v) => (typeof v === 'number' && isFinite(v) ? v.toLocaleString(undefined, { notation: 'compact', maximumFractionDigits: 1 }) : dash),
  },
  {
    id: 'likes',
    label: 'HF Likes',
    group: 'Research (Hugging Face)',
    defaultOn: false,
    defaultWidth: 90,
    align: 'right',
    tip: 'Hugging Face likes on the model\'s repository — closer to GitHub stars than downloads.\n\nPRACTICAL: A denser community-endorsement signal than raw downloads (people like things they rate highly). Still popularity-biased toward recent, well-marketed releases.\n\nCHOOSE BY: A tiebreaker between open models with similar benchmarks. Irrelevant for closed models.',
    summary: 'Community endorsement on Hugging Face (like GitHub stars).',
    value: (m, extra) => isNonCodingModel(m.id) ? 'N/A' : (extra?.hf_likes ?? null),
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
