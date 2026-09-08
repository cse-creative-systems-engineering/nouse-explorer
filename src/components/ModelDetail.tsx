import { useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { ModelEntry } from '../lib/types';
import { $selectedId } from '../lib/store';
import { nouse } from '../lib/nouse';
import {
  DAY_LABELS,
  formatContext,
  formatPerToken,
  formatUsd,
  isBatch,
  isFreeVariant,
  isMultimodal,
  perMillion,
  providerFromId,
  resolvePricing,
} from '../lib/pricing';
import { isNonCodingModel } from '../lib/columns';
import { useModalFocus } from '../lib/useModalFocus';
import { DiscountBadge } from './DiscountBadge';

interface ModelDetailProps {
  model: ModelEntry | undefined;
}

function PricingRow({ label, value, plain }: { label: string; value?: string; plain?: boolean }) {
  if (!value || value === '') return null;
  if (plain) {
    return (
      <div className="kv">
        <span className="kv-label">{label}</span>
        <span className="kv-value">{formatUsd(perMillion(value))}</span>
      </div>
    );
  }
  const perM = perMillion(value);
  return (
    <div className="kv">
      <span className="kv-label">{label}</span>
      <span style={{ textAlign: 'right' }}>
        <span className="kv-value">{formatUsd(perM)}</span>
        <span className="kv-sub">{formatPerToken(value)} / token</span>
      </span>
    </div>
  );
}



function CopyableId({ id }: { id: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy-id"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(id);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch { /* clipboard unavailable */ }
      }}
      title="Click to copy the model ID"
    >
      <span className="copy-id-text">{id}</span>
      <span className={`copy-id-badge${copied ? ' copied' : ''}`}>{copied ? '✓ copied' : 'copy'}</span>
    </button>
  );
}

function KeyStats({ model }: { model: ModelEntry }) {
  const resolved = resolvePricing(model.pricing);
  const arch = model.architecture;
  const outputPerM = perMillion(resolved.completion);
  const inputPerM = perMillion(resolved.prompt);
  const modalities = arch?.input_modalities ?? [];
  const modalityChips = [
    ...(modalities.includes('text') ? ['Text'] : []),
    ...(modalities.includes('image') ? ['Image'] : []),
    ...(modalities.includes('video') ? ['Video'] : []),
    ...(modalities.includes('audio') ? ['Audio'] : []),
  ];
  const [speed, setSpeed] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    const b = nouse();
    if (!b?.research?.getModelMetrics) return;
    void b.research.getModelMetrics(model.id).then((rows) => {
      if (cancelled) return;
      const s = (rows ?? []).find((m) => m.metric === 'median_output_tokens_per_second');
      setSpeed(s && s.value > 0 ? s.value : null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [model.id]);

  const stats: Array<{ label: string; value: string; sub?: string; accent?: boolean }> = [];
  if (isFinite(outputPerM)) stats.push({ label: 'Output price', value: formatUsd(outputPerM), sub: 'per 1M tokens', accent: true });
  if (isFinite(inputPerM)) stats.push({ label: 'Input price', value: formatUsd(inputPerM), sub: 'per 1M tokens' });
  if (model.context_length) stats.push({ label: 'Context', value: formatContext(model.context_length), sub: 'tokens' });
  if (speed != null) stats.push({ label: 'Speed', value: `${Math.round(speed)}`, sub: 'tokens/sec' });
  if (modalityChips.length > 0) stats.push({ label: 'Accepts', value: modalityChips.join(' · '), sub: 'modalities' });
  if (model.pricing.original) {
    const disc = Math.round((1 - parseFloat(resolved.prompt) / parseFloat(model.pricing.original.prompt)) * 100);
    if (isFinite(disc) && disc > 0) stats.push({ label: 'Discount', value: `−${disc}%`, sub: 'vs list price', accent: true });
  }

  return (
    <div className="modal-section">
      <div className="key-stats">
        {stats.map((s) => (
          <div className={`key-stat${s.accent ? ' accent' : ''}`} key={s.label}>
            <div className="key-stat-label">{s.label}</div>
            <div className="key-stat-value">{s.value}</div>
            {s.sub && <div className="key-stat-sub">{s.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

interface DistilledProfile {
  summary: string;
  strengths: { text: string; sources: string[] }[];
  weaknesses: { text: string; sources: string[] }[];
  usecase_signals: Record<string, { signal: number; confidence: number; evidence: { text: string; sources: string[] }[] }>;
  trusted: boolean;
  untrusted_claims: string[];
}

function ProfileSection({ modelId }: { modelId: string }) {
  const [profile, setProfile] = useState<DistilledProfile | null>(null);
  const [researchedAt, setResearchedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const b = nouse();
    if (!b?.research) {
      setLoaded(true);
      return;
    }
    void b.research.getProfile(modelId).then((r) => {
      if (cancelled) return;
      setProfile(r ? (r.profile as DistilledProfile) : null);
      setResearchedAt(r?.researched_at ?? null);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [modelId]);

  if (loaded && !profile) return null;

  const signalLabel = (s: number) => (s > 0 ? '+' : '') + s;
  return (
    <div className="modal-section">
      <h3 className="modal-section-title">
        Research profile{' '}
        {profile && (
          <span className={`badge ${profile.trusted ? 'success' : 'warning'}`} style={{ marginLeft: 6 }}>
            {profile.trusted ? 'cited' : 'untrusted'}
          </span>
        )}
        {researchedAt && (
          <span style={{ marginLeft: 8, color: 'var(--text-muted)', fontSize: 10, fontWeight: 400 }}>
            {new Date(researchedAt).toLocaleString()}
          </span>
        )}
      </h3>
      {!profile ? (
        <div style={{ padding: '12px', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.20)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          Researching this model — profile pending (needs the Nous API key in Settings).
        </div>
      ) : (
        <>
          {profile.summary && <p className="modal-desc" style={{ marginTop: 0 }}>{profile.summary}</p>}
          {profile.strengths.length > 0 && (
            <div className="profile-claims">
              {profile.strengths.map((c, i) => (
                <div key={`s${i}`} className="profile-claim good">
                  <span className="claim-mark">▲</span>
                  <div>
                    <div className="claim-text">{c.text}</div>
                    <div className="claim-srcs">{c.sources.map((s) => <a key={s} className="claim-src" href={s} target="_blank" rel="noreferrer">{new URL(s).hostname}</a>)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {profile.weaknesses.length > 0 && (
            <div className="profile-claims">
              {profile.weaknesses.map((c, i) => (
                <div key={`w${i}`} className="profile-claim bad">
                  <span className="claim-mark">▼</span>
                  <div>
                    <div className="claim-text">{c.text}</div>
                    <div className="claim-srcs">{c.sources.map((s) => <a key={s} className="claim-src" href={s} target="_blank" rel="noreferrer">{new URL(s).hostname}</a>)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {Object.entries(profile.usecase_signals).some(([, v]) => v.signal !== 0) && (
            <div className="profile-signals">
              {Object.entries(profile.usecase_signals)
                .filter(([, v]) => v.signal !== 0)
                .map(([uc, v]) => (
                  <span key={uc} className={`signal-chip ${v.signal > 0 ? 'pos' : 'neg'}`} title={`confidence ${Math.round(v.confidence * 100)}%`}>
                    {uc} {signalLabel(v.signal)}
                  </span>
                ))}
            </div>
          )}
          {!profile.trusted && (
            <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: 'rgba(255,205,66,.08)', border: '1px solid rgba(255,205,66,.3)', fontSize: 11.5, color: 'var(--warn)' }}>
              {profile.untrusted_claims.length} claims lack a source and were flagged — not shown as fact.
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Metric display metadata for the benchmarks section. */
const METRIC_DEFS: Array<{ key: string; label: string; tip: string; digits?: number; suffix?: string; provider?: boolean }> = [
  { key: 'artificial_analysis_intelligence_index', label: 'Intelligence index', tip: 'Artificial Analysis composite of reasoning ability across many evaluations. Higher is better; frontier models cluster in the 50–70 range.', digits: 1 },
  { key: 'artificial_analysis_coding_index', label: 'Coding index', tip: 'Artificial Analysis composite of code-writing and code-reasoning ability. Higher is better; frontier models sit in the 60–80 band.', digits: 1 },
  { key: 'artificial_analysis_agentic_index', label: 'Agentic index', tip: 'Multi-step tool-using agent task ability (AA retired this metric — only models whose catalog embeds it show a value).', digits: 1 },
  { key: 'artificial_analysis_math_index', label: 'Math index', tip: 'Artificial Analysis composite of mathematical reasoning. Higher is better.', digits: 1 },
  { key: 'gpqa', label: 'GPQA', tip: 'Graduate-level Google-Proof Q&A: PhD-written science questions. Frontier models score 60–85%.', digits: 1 },
  { key: 'hle', label: 'HLE', tip: 'Humanity\u2019s Last Exam — the hardest expert-written benchmark; even small differences matter.', digits: 1 },
  { key: 'mmlu_pro', label: 'MMLU-Pro', tip: 'Broad knowledge + reasoning across 14 domains. Strong models score 70–85%.', digits: 1 },
  { key: 'livecodebench', label: 'LiveCodeBench', tip: 'Competitive-programming problems released after training cutoffs — can\u2019t be memorized.', digits: 1 },
  { key: 'scicode', label: 'SciCode', tip: 'Graduate-level scientific computing problems. Very hard.', digits: 2 },
  { key: 'aime', label: 'AIME', tip: 'Olympiad-qualifier math (2024 set). Elite models score 80–90%+.', digits: 1 },
  { key: 'aime_25', label: 'AIME 2025', tip: 'The 2025 AIME set — more contamination-resistant than 2024.', digits: 1 },
  { key: 'math_500', label: 'MATH-500', tip: 'Competition mathematics (algebra, geometry, number theory).', digits: 1 },
  { key: 'ifbench', label: 'IFBench', tip: 'How precisely the model follows explicit instruction constraints.', digits: 1 },
  { key: 'tau2', label: 'τ²-Bench', tip: 'Simulated customer-service agent tasks with tools.', digits: 1 },
  { key: 'terminalbench_hard', label: 'TerminalBench', tip: 'Real terminal/shell tasks — closest benchmark to “can it operate a computer”.', digits: 1 },
  { key: 'lcr', label: 'LCR', tip: 'Artificial Analysis\u2019 single-skill code-reasoning read.', digits: 1 },
  { key: 'median_output_tokens_per_second', label: 'Speed', tip: 'Median output tokens per second, measured independently by Artificial Analysis. Below ~20 t/s feels slow for chat.', digits: 0, suffix: ' t/s' },
  { key: 'median_time_to_first_token_seconds', label: 'TTFT', tip: 'Median time to first token, in seconds — perceived responsiveness. Lower is better.', digits: 2, suffix: ' s' },
  { key: 'median_time_to_first_answer_token', label: 'TFAT', tip: 'Time to the first token of the substantive answer (skips reasoning preamble). Lower is better.', digits: 2, suffix: ' s' },
  { key: 'hf_downloads', label: 'HF downloads', tip: 'Total Hugging Face downloads of the open weights — a popularity signal, not a quality measure.', digits: 0 },
  { key: 'hf_likes', label: 'HF likes', tip: 'Hugging Face likes — community endorsement, like GitHub stars.', digits: 0 },
  // provider-reported (self-claimed) scores
  { key: 'provider_swebench_verified', label: 'SWE-bench Verified', tip: 'Provider-reported (self-claimed) SWE-bench Verified score — the provider chose the harness and published the number. Not independently verified; not comparable to AA indices.', digits: 1, suffix: '%', provider: true },
  { key: 'provider_swebench_pro', label: 'SWE-bench Pro', tip: 'Provider-reported SWE-bench Pro score — self-claimed, provider-chosen harness. Indicative only.', digits: 1, suffix: '%', provider: true },
  { key: 'provider_swebench_multilingual', label: 'SWE-bench Multilingual', tip: 'Provider-reported SWE-bench Multilingual score — self-claimed. Indicative only.', digits: 1, suffix: '%', provider: true },
  { key: 'provider_livecodebench_v6', label: 'LiveCodeBench v6', tip: 'Provider-reported LiveCodeBench v6 pass@1 — self-claimed. Indicative only.', digits: 1, suffix: '%', provider: true },
  { key: 'provider_livecodebench', label: 'LiveCodeBench', tip: 'Provider-reported LiveCodeBench pass@1 (version per the provider\u2019s report) — self-claimed. Indicative only.', digits: 1, suffix: '%', provider: true },
  { key: 'provider_terminalbench', label: 'Terminal-Bench', tip: 'Provider-reported Terminal-Bench score — self-claimed. Indicative only.', digits: 1, suffix: '%', provider: true },
];

const SOURCE_LABEL: Record<string, string> = {
  'artificial-analysis': 'Artificial Analysis (independent benchmarking)',
  openrouter: 'OpenRouter (AA composite)',
  'provider-reported': 'the model provider\u2019s own model card / announcement (self-reported)',
  'provider-api': 'the provider\u2019s API (downloads/likes from Hugging Face)',
};


/** Percentile bands across the catalog (computed from the research DB). */
const BANDS: Record<string, [number, number]> = {
  // [p50, p90] — above p90 = top tier, p50..p90 = solid, below p50 = entry
  artificial_analysis_coding_index: [51.5, 76.1],
  artificial_analysis_intelligence_index: [29.7, 53.2],
  median_output_tokens_per_second: [75.7, 205.8],
  gpqa: [85.4, 92.9],
  hle: [27.8, 46.2],
};

function bandOf(metric: string, value: number): 'top' | 'solid' | 'entry' | null {
  const b = BANDS[metric];
  if (!b) return null;
  if (value >= b[1]) return 'top';
  if (value >= b[0]) return 'solid';
  return 'entry';
}

/** "What is this model for" — synthesized from capabilities + benchmark bands
 *  when no distilled research profile exists. */
function UseCaseSynthesis({ model, metrics }: { model: ModelEntry; metrics: Array<{ metric: string; value: number; method: string }> | null }) {
  if (isNonCodingModel(model.id)) {
    const isEmbed = /embed|voyage|bge|e5|minilm|gte|mpnet|paraphrase|text-embedding|pplx/i.test(model.id);
    return (
      <div className="modal-section">
        <h3 className="modal-section-title">What this model is for</h3>
        <div className="profile-claims">
          <div className="profile-claim good">
            <span className="claim-mark">◆</span>
            <div className="claim-text">
              {isEmbed
                ? 'Specialized embedding model — converts text into vectors for search, retrieval (RAG), clustering, and similarity matching. Not a chat or coding model; coding/reasoning benchmarks don\u2019t apply to it.'
                : 'Specialized audio model — built for speech and audio understanding rather than text-based coding or reasoning benchmarks.'}
            </div>
          </div>
        </div>
      </div>
    );
  }
  const researched = new Map((metrics ?? []).map((m) => [m.metric, m.value]));
  const get = (k: string) => researched.get(k) ?? (model.benchmarks?.artificial_analysis as Record<string, number> | undefined)?.[k.replace('artificial_analysis_', '')] ?? null;

  const lines: Array<{ icon: string; text: string }> = [];

  // Coding capability
  const coding = get('artificial_analysis_coding_index');
  if (coding != null) {
    const b = bandOf('artificial_analysis_coding_index', coding);
    if (b === 'top') lines.push({ icon: '▲', text: `Strong coder — handles coding agents, complex refactors, and production dev tooling reliably (AA Coding Index ${coding.toFixed(0)}, top 10% of catalog).` });
    else if (b === 'solid') lines.push({ icon: '▲', text: `Capable coder — reliable for IDE assistance, code review, and routine development (AA Coding Index ${coding.toFixed(0)}, above catalog median).` });
    else lines.push({ icon: '▼', text: `Entry-level coder (AA Coding Index ${coding.toFixed(0)}) — fine for snippets and simple scripts, but expect limits on complex, multi-file work.` });
  }

  // General intelligence
  const intel = get('artificial_analysis_intelligence_index');
  if (intel != null) {
    const b = bandOf('artificial_analysis_intelligence_index', intel);
    if (b === 'top') lines.push({ icon: '▲', text: `Frontier reasoning (AA Intelligence Index ${intel.toFixed(0)}) — good fit for research, planning, and multi-step analysis work.` });
    else if (b === 'solid') lines.push({ icon: '▲', text: `Solid general assistant (AA Intelligence Index ${intel.toFixed(0)}) — dependable across mixed everyday workloads.` });
    else lines.push({ icon: '▼', text: `Light general capability (AA Intelligence Index ${intel.toFixed(0)}) — best for simple routing, classification, or high-volume simple tasks rather than deep reasoning.` });
  }

  // Speed
  const speed = get('median_output_tokens_per_second');
  if (speed != null && speed > 0) {
    const b = bandOf('median_output_tokens_per_second', speed);
    if (b === 'top') lines.push({ icon: '▲', text: `Very fast responses (${Math.round(speed)} tok/s median) — comfortable for live chat, interactive agents, and streaming in an IDE.` });
    else if (b === 'solid') lines.push({ icon: '▲', text: `Comfortable response speed (${Math.round(speed)} tok/s) for chat and interactive use.` });
    else lines.push({ icon: '▼', text: `Slower responses (${Math.round(speed)} tok/s) — better suited to background or batch work where users aren't waiting on each token.` });
  }

  // Science/research reasoning (GPQA)
  const gpqa = get('gpqa');
  if (gpqa != null) {
    if (gpqa >= 85) lines.push({ icon: '▲', text: `Strong at graduate-level science (GPQA ${gpqa.toFixed(0)}% — questions PhD experts designed so skilled non-experts score ~34%) — trustworthy for research assistants and technical Q&A.` });
    else if (gpqa < 45) lines.push({ icon: '▼', text: `Weak at hard science (GPQA ${gpqa.toFixed(0)}% — top models score 85+) — expect confident-sounding mistakes on technical questions; verify outputs or avoid research use.` });
  }

  // Deep reasoning (HLE)
  const hle = get('hle');
  if (hle != null) {
    if (hle >= 30) lines.push({ icon: '▲', text: `Frontier-level deep reasoning (HLE ${hle.toFixed(0)}% on Humanity's Last Exam, the hardest expert benchmark) — capable on genuinely novel problems where most models fail.` });
    else if (hle < 8) lines.push({ icon: '▼', text: `Limited deep reasoning (HLE ${hle.toFixed(0)}% — single digits are normal on this benchmark) — rely on it for well-known problems and standard tasks, not novel ones.` });
  }

  // Math (AIME)
  const aime = get('aime_25') ?? get('aime');
  if (aime != null) {
    if (aime >= 85) lines.push({ icon: '▲', text: `Elite at multi-step math (AIME ${aime.toFixed(0)}% — olympiad-qualifier problems) — reliable for quantitative analysis, financial modeling, and symbolic derivations.` });
    else if (aime < 20) lines.push({ icon: '▼', text: `Weak at multi-step math (AIME ${aime.toFixed(0)}% — top models score 85%+) — double-check arithmetic and logic; slips are likely on longer derivations.` });
  }

  // Structured output (IFBench)
  const ifbench = get('ifbench');
  if (ifbench != null) {
    if (ifbench >= 75) lines.push({ icon: '▲', text: `Follows instructions precisely (IFBench ${ifbench.toFixed(0)}%) — good for JSON pipelines, templated reports, and agents that must emit valid tool calls.` });
    else if (ifbench < 35) lines.push({ icon: '▼', text: `Loose instruction-follower (IFBench ${ifbench.toFixed(0)}% — measures constraint compliance) — it may quietly ignore format requirements; validate outputs or avoid automation use.` });
  }

  // Agent tool-use (tau2)
  const tau2 = get('tau2');
  if (tau2 != null) {
    if (tau2 >= 70) lines.push({ icon: '▲', text: `Disciplined agent behavior (τ²-Bench ${tau2.toFixed(0)}% — simulated tool-using customer-service scenarios) — suited for support bots, booking agents, and tools acting on a user's behalf.` });
    else if (tau2 < 30) lines.push({ icon: '▼', text: `Undisciplined agent behavior (τ²-Bench ${tau2.toFixed(0)}%) — needs heavy human oversight before taking actions autonomously.` });
  }

  // Devtools (TerminalBench)
  const tb = get('terminalbench_hard') ?? get('terminalbench_v2_1');
  if (tb != null) {
    if (tb >= 50) lines.push({ icon: '▲', text: `Competent in live dev environments (Terminal-Bench ${tb.toFixed(0)}% — real shell tasks: filesystems, dependencies, debugging) — can drive CLI agents, DevOps automation, and computer-use workflows.` });
    else if (tb < 15) lines.push({ icon: '▼', text: `Weak in live dev environments (Terminal-Bench ${tb.toFixed(0)}%) — avoid unsupervised shell/agent work; use only with a tight harness.` });
  }

  // Knowledge breadth (MMLU-Pro)
  const mmlu = get('mmlu_pro');
  if (mmlu != null) {
    if (mmlu >= 80) lines.push({ icon: '▲', text: `Broad reliable world knowledge (MMLU-Pro ${mmlu.toFixed(0)}% across 14 domains) — good for knowledge-worker assistants in law, medicine, and research.` });
    else if (mmlu < 45) lines.push({ icon: '▼', text: `Gaps in world knowledge (MMLU-Pro ${mmlu.toFixed(0)}%) — will misstate facts outside its training focus; verify factual claims.` });
  }

  // Context
  if (model.context_length) {
    if (model.context_length >= 900000) lines.push({ icon: '▲', text: `Massive context window (${formatContext(model.context_length)} tokens ≈ a small codebase) — ingest entire codebases, long transcripts, or large document sets in one request.` });
    else if (model.context_length < 32000) lines.push({ icon: '▼', text: `Limited context window (${formatContext(model.context_length)} tokens) — long conversations or large documents will overflow; chunk your inputs.` });
  }

  // Latency
  const ttft = get('median_time_to_first_token_seconds');
  if (ttft != null && ttft > 0) {
    if (ttft <= 1) lines.push({ icon: '▲', text: `Fast first response (${ttft.toFixed(1)}s TTFT) — feels instant in chat and voice pipelines.` });
    else if (ttft >= 5) lines.push({ icon: '▼', text: `Slow first response (${ttft.toFixed(1)}s TTFT) — users will wait; fine for async work, poor for live chat.` });
  }

  // Provider-claimed note
  if (metrics?.some((m) => m.method === 'provider-reported')) {
    lines.push({ icon: '◆', text: 'Includes provider-reported (self-claimed) scores below — shown in amber; not independently verified.' });
  }

  if (lines.length === 0) return null;

  return (
    <div className="modal-section">
      <h3 className="modal-section-title">What this model is for</h3>
      <div className="profile-claims">
        {lines.map((l, i) => (
          <div key={i} className={`profile-claim ${l.icon === '▲' ? 'good' : l.icon === '▼' ? 'bad' : 'good'}`}>
            <span className="claim-mark">{l.icon}</span>
            <div className="claim-text">{l.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

const fmtNum = (v: number, digits: number, suffix?: string) =>
  `${digits === 0 ? Math.round(v).toLocaleString() : v.toFixed(digits)}${suffix ?? ''}`;

function BenchmarksSection({ modelId, model }: { modelId: string; model: ModelEntry }) {
  const [metrics, setMetrics] = useState<Array<{ metric: string; value: number; method: string; source_url: string }> | null>(null);
  const bench = model.benchmarks;
  const aa = bench?.artificial_analysis;

  useEffect(() => {
    let cancelled = false;
    const b = nouse();
    if (!b?.research?.getModelMetrics) { setMetrics([]); return; }
    void b.research.getModelMetrics(modelId).then((rows) => {
      if (!cancelled) setMetrics(rows ?? []);
    }).catch(() => { if (!cancelled) setMetrics([]); });
    return () => { cancelled = true; };
  }, [modelId]);

  const researched = new Map((metrics ?? []).map((m) => [m.metric, m]));
  const nonCoding = isNonCodingModel(model.id);

  // merge: catalog-embedded AA first, then researched values, then provider-reported
  const rows: Array<{ label: string; value: string; tip: string; provider?: boolean; source: string | null }> = [];
  for (const def of METRIC_DEFS) {
    let value: number | null = null;
    let source: string | null = null;
    if (def.key.startsWith('artificial_analysis') && aa && typeof (aa as Record<string, unknown>)[def.key.replace('artificial_analysis_', '')] === 'number') {
      value = (aa as Record<string, unknown>)[def.key.replace('artificial_analysis_', '')] as number;
      source = 'catalog (embedded)';
    }
    if (value === null && researched.has(def.key)) {
      const m = researched.get(def.key)!;
      value = m.value;
      source = SOURCE_LABEL[m.method] ?? m.method;
    }
    if (value === null) continue;
    rows.push({ label: def.label, value: fmtNum(value, def.digits ?? 1, def.suffix), tip: def.tip, provider: def.provider, source });
  }

  const providerRows = rows.filter((r) => r.provider);
  const indepRows = rows.filter((r) => !r.provider);

  return (
    <div className="modal-section">
      <h3 className="modal-section-title">Benchmarks &amp; measurements</h3>
      <UseCaseSynthesis model={model} metrics={metrics} />
      {nonCoding && (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(245,245,245,.04)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
          This is an embedding / audio model — coding and reasoning benchmarks don\u2019t apply to it (shown as N/A in the table).
        </div>
      )}
      {!nonCoding && !rows.some((r) => r.label === 'Agentic index') && researched.has('artificial_analysis_intelligence_index') && (
        <div style={{ padding: '8px 12px', borderRadius: 10, background: 'rgba(245,245,245,.04)', border: '1px solid var(--border)', fontSize: 11.5, color: 'var(--text3)', marginBottom: 10 }}>
          No Agentic Index shown — Artificial Analysis retired this metric from their API, so only models whose catalog entry embedded it (earlier releases) carry a value. Its absence says nothing about this model's agentic ability.
        </div>
      )}
      {!nonCoding && rows.length === 0 && (
        <div style={{ padding: '12px', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.20)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No benchmark data from any source yet — this model hasn\u2019t been scored by Artificial Analysis, isn\u2019t covered by OpenRouter, and its provider hasn\u2019t published verified scores.
        </div>
      )}
      {indepRows.length > 0 && (
        <div>
          {indepRows.map((r) => (
            <div className="bench-kv" key={r.label} title={`${r.tip}${r.source ? ` — source: ${r.source}` : ''}`}>
              <span>
                <span className="bench-kv-label">{r.label}</span>
                {r.source && <span className="bench-kv-src">{r.source}</span>}
              </span>
              <span className="bench-kv-value">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {providerRows.length > 0 && (
        <>
          <div style={{ margin: '12px 0 8px', fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#f0c14b' }}>
            Provider-reported (self-claimed, not independently verified)
          </div>
          <div>
            {providerRows.map((r) => (
              <div className="bench-kv" key={r.label} title={`${r.tip}${r.source ? ` — source: ${r.source}` : ''}`}>
                <span>
                  <span className="bench-kv-label">{r.label}</span>
                  {r.source && <span className="bench-kv-src">{r.source}</span>}
                </span>
                <span className="bench-kv-value provider-reported">{r.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {(bench?.design_arena?.length ?? 0) > 0 && (
        <div className="bench-list" style={{ marginTop: 12 }}>
          <div className="bench-row head">
            <span>arena / category</span>
            <span>elo</span>
            <span>win %</span>
            <span>rank</span>
          </div>
          {bench!.design_arena!.slice(0, 50).map((d, i) => (
            <div key={`${d.arena}-${d.category}-${i}`} className="bench-row">
              <span>{d.arena} · {d.category}</span>
              <span>{d.elo}</span>
              <span>{d.win_rate != null ? d.win_rate.toFixed(1) : '—'}</span>
              <span>{d.rank}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ModelDetail({ model }: ModelDetailProps) {
  const selectedId = useStore($selectedId);
  const active = !!model;
  const focusRef = useModalFocus(active);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && selectedId) {
        $selectedId.set(null);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [selectedId]);

  if (!model) return null;

  const resolved = resolvePricing(model.pricing);
  const arch = model.architecture;
  const hasOverrides = Array.isArray(model.pricing.overrides) && model.pricing.overrides.length > 0;

  return (
    <div className="modal-backdrop" onClick={() => $selectedId.set(null)} role="dialog" aria-modal="true" aria-label={`${model.name} details`}>
      <div className="modal" onClick={(e) => e.stopPropagation()} ref={focusRef} tabIndex={-1} style={{ outline: 'none' }}>
        <header className="modal-head">
          <div style={{ minWidth: 0 }}>
            <h2 className="modal-title">{model.name}</h2>
            <p className="modal-sub">{model.id}</p>
            <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
              <span className="badge">{providerFromId(model.id)}</span>
              {isFreeVariant(model.id) && <span className="badge success">Free</span>}
              {isBatch(model.id) && <span className="badge info">Batch</span>}
              <DiscountBadge pricing={model.pricing} />
              {hasOverrides && <span className="badge warning">Time-based pricing</span>}
              {arch?.instruct_type && arch.instruct_type.toLowerCase().includes('reason') && (
                <span className="badge accent">Reasoning</span>
              )}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-icon"
            onClick={() => $selectedId.set(null)}
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="6" />
              <line x1="6" y1="18" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="modal-body">
          {model.description && (
            <div className="modal-section">
              <p className="modal-desc">{model.description}</p>
            </div>
          )}

          <KeyStats model={model} />

          <BenchmarksSection modelId={model.id} model={model} />

          <ProfileSection modelId={model.id} />

          <div className="modal-section">
            <h3 className="modal-section-title">Pricing detail</h3>
            <div className="kv-grid">
              <PricingRow label="Prompt (per 1M tokens)" value={resolved.prompt} />
              <PricingRow label="Completion (per 1M tokens)" value={resolved.completion} />
              <PricingRow label="Web search (per 1M tokens)" value={resolved.web_search} />
              <PricingRow label="Cache read (per 1M tokens)" value={resolved.input_cache_read} />
              <PricingRow label="Cache write (per 1M tokens)" value={resolved.input_cache_write} />
              <PricingRow label="Cache write 1h (per 1M tokens)" value={resolved.input_cache_write_1h} />
              <PricingRow label="Image (per 1M tokens)" value={resolved.image} />
              <PricingRow label="Request" value={resolved.request} plain />
            </div>
            {model.pricing.original && (
              <>
                <PricingRow label="Original prompt (before discount)" value={model.pricing.original.prompt} />
                <PricingRow label="Original completion (before discount)" value={model.pricing.original.completion} />
              </>
            )}
          </div>

          {hasOverrides && model.pricing.overrides && (
            <div className="modal-section">
              <h3 className="modal-section-title">Time-based overrides ({model.pricing.overrides.length})</h3>
              <div className="overrides-list">
                {model.pricing.overrides.map((o, idx) => {
                  const days = o.utc_days?.map((d) => DAY_LABELS[d.toLowerCase()] ?? d).join(', ') || 'Every day';
                  const start = o.utc_start ?? 0;
                  const end = o.utc_end ?? 0;
                  const window = start === end ? 'all day' : `${start}m–${end}m UTC`;
                  return (
                    <div key={idx} className="override-row">
                      <div className="override-meta">{days} · {window}</div>
                      <div>prompt: <span style={{ color: 'var(--accent)' }}>{formatPerToken(o.prompt)}</span> / completion: <span style={{ color: 'var(--accent)' }}>{formatPerToken(o.completion)}</span></div>
                      {o.input_cache_read && (
                        <div style={{ color: 'var(--text-muted)' }}>cache read: {formatPerToken(o.input_cache_read)} / tok</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="modal-section">
            <h3 className="modal-section-title">Architecture</h3>
            <div className="kv-grid">
              <div className="kv">
                <span className="kv-label">Modality</span>
                <span className="kv-value">{arch?.modality ?? '—'}</span>
              </div>
              <div className="kv">
                <span className="kv-label">Tokenizer</span>
                <span className="kv-value">{arch?.tokenizer ?? '—'}</span>
              </div>
              <div className="kv">
                <span className="kv-label">Instruct type</span>
                <span className="kv-value">{arch?.instruct_type ?? '—'}</span>
              </div>
              <div className="kv">
                <span className="kv-label">Input modalities</span>
                <span className="kv-value">{arch?.input_modalities?.join(', ') ?? '—'}</span>
              </div>
              <div className="kv">
                <span className="kv-label">Output modalities</span>
                <span className="kv-value">{arch?.output_modalities?.join(', ') ?? '—'}</span>
              </div>
              <div className="kv">
                <span className="kv-label">Multimodal</span>
                <span className="kv-value">{isMultimodal(arch) ? 'yes' : 'no'}</span>
              </div>
            </div>
          </div>

          <div className="modal-section">
            <h3 className="modal-section-title">Limits</h3>
            <div className="kv-grid">
              <div className="kv">
                <span className="kv-label">Context length (catalog)</span>
                <span className="kv-value">{formatContext(model.context_length)}</span>
              </div>
              <div className="kv">
                <span className="kv-label">Provider max context</span>
                <span className="kv-value">{formatContext(model.top_provider?.context_length ?? 0)}</span>
              </div>
              <div className="kv" title="Maximum tokens the model can generate in a single response — caps how long any one answer can be. Long-form generation (full files, long reports) needs a high limit; chat needs far less.">
                <span className="kv-label">Max completion</span>
                <span className="kv-value">{formatContext(model.top_provider?.max_completion_tokens ?? 0)}</span>
              </div>
              <div className="kv">
                <span className="kv-label">Moderated</span>
                <span className="kv-value">{model.top_provider?.is_moderated ? 'yes' : 'no'}</span>
              </div>
            </div>
          </div>

          {model.canonical_slug && (
            <div className="modal-section">
              <h3 className="modal-section-title">Metadata</h3>
              <div className="kv-grid">
                <div className="kv">
                  <span className="kv-label">Model ID (click to copy)</span>
                  <CopyableId id={model.id} />
                </div>
                <div className="kv">
                  <span className="kv-label">Canonical slug</span>
                  <span className="kv-value">{model.canonical_slug}</span>
                </div>
                {model.hugging_face_id && (
                  <div className="kv">
                    <span className="kv-label">Hugging Face</span>
                    <span className="kv-value">{model.hugging_face_id}</span>
                  </div>
                )}
              </div>
              <div className="detail-links">
                <a className="detail-link" href={`https://openrouter.ai/${model.id.split(':')[0]}`} target="_blank" rel="noreferrer" title="Open this model on OpenRouter — pricing, providers, and playground">OpenRouter ↗</a>
                <a className="detail-link" href={`https://artificialanalysis.ai/models?search=${encodeURIComponent(model.name ?? '')}`} target="_blank" rel="noreferrer" title="Search Artificial Analysis for this model's benchmark profile">Artificial Analysis ↗</a>
                {model.hugging_face_id && (
                  <a className="detail-link" href={`https://huggingface.co/${model.hugging_face_id}`} target="_blank" rel="noreferrer" title="Open the Hugging Face model card — weights, docs, and community">Hugging Face ↗</a>
                )}
                <a className="detail-link" href={`https://duckduckgo.com/?q=${encodeURIComponent((model.name ?? '') + ' ' + providerFromId(model.id) + ' model documentation')}`} target="_blank" rel="noreferrer" title="Search for this model's official documentation">Docs search ↗</a>
              </div>
              <div className="kv-grid">
                <div className="kv">
                  <span className="kv-label">Created</span>
                  <span className="kv-value">{model.created ? new Date(model.created * 1000).toISOString().slice(0, 10) : '—'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
