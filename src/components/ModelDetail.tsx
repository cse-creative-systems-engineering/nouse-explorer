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
import { DiscountBadge } from './DiscountBadge';

interface ModelDetailProps {
  model: ModelEntry | undefined;
}

function PricingCell({ label, value }: { label: string; value?: string }) {
  if (!value || value === '') return null;
  const perM = perMillion(value);
  return (
    <div className="kv">
      <span className="kv-label">{label}</span>
      <span className="kv-value big">{formatUsd(perM)} <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>/ 1M</span></span>
      <span className="kv-per-token">{formatPerToken(value)} / token</span>
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
      {nonCoding && (
        <div style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(245,245,245,.04)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
          This is an embedding / audio model — coding and reasoning benchmarks don\u2019t apply to it (shown as N/A in the table).
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
              <span className="bench-kv-label">{r.label}</span>
              <span>
                <span className="bench-kv-value">{r.value}</span>
                {r.source && <span className="bench-kv-src">{r.source}</span>}
              </span>
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
                <span className="bench-kv-label">{r.label}</span>
                <span>
                  <span className="bench-kv-value provider-reported">{r.value}</span>
                  {r.source && <span className="bench-kv-src">{r.source}</span>}
                </span>
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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

          <ProfileSection modelId={model.id} />

          <BenchmarksSection modelId={model.id} model={model} />

          <div className="modal-section">
            <h3 className="modal-section-title">Pricing (effective now)</h3>
            <div className="kv-grid">
              <PricingCell label="Prompt" value={resolved.prompt} />
              <PricingCell label="Completion" value={resolved.completion} />
              <PricingCell label="Web search" value={resolved.web_search} />
              <PricingCell label="Cache read" value={resolved.input_cache_read} />
              <PricingCell label="Cache write" value={resolved.input_cache_write} />
              <PricingCell label="Cache write 1h" value={resolved.input_cache_write_1h} />
              <PricingCell label="Image" value={resolved.image} />
              <PricingCell label="Request" value={resolved.request} />
            </div>
            {model.pricing.original && (
              <div className="kv-grid" style={{ marginTop: 10 }}>
                <div className="kv">
                  <span className="kv-label">Original prompt</span>
                  <span className="kv-value big">{formatUsd(perMillion(model.pricing.original.prompt))} <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>/ 1M</span></span>
                  <span className="kv-value" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatPerToken(model.pricing.original.prompt)} / tok</span>
                </div>
                <div className="kv">
                  <span className="kv-label">Original completion</span>
                  <span className="kv-value big">{formatUsd(perMillion(model.pricing.original.completion))} <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>/ 1M</span></span>
                  <span className="kv-value" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatPerToken(model.pricing.original.completion)} / tok</span>
                </div>
              </div>
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
                <span className="modal-modality">{arch?.modality ?? '—'}</span>
              </div>
              <div className="kv">
                <span className="kv-label">Tokenizer</span>
                <span className="kv-value">{arch?.tokenizer ?? '—'}</span>
              </div>
              <div className="kv">
                <span className="kv-label">Instruct type</span>
                <span className="kv-value">{arch?.instruct_type ?? 'not provided'}</span>
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
                <span className="kv-label">Context length</span>
                <span className="kv-value big">{formatContext(model.context_length)}</span>
                <span className="kv-per-token">catalog</span>
              </div>
              <div className="kv">
                <span className="kv-label">Provider max context</span>
                <span className="kv-value big">{formatContext(model.top_provider?.context_length ?? 0)}</span>
                <span className="kv-per-token">provider limit</span>
              </div>
              <div className="kv">
                <span className="kv-label">Max completion</span>
                <span className="kv-value big">{formatContext(model.top_provider?.max_completion_tokens ?? 0)}</span>
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
                  <span className="kv-label">Canonical slug</span>
                  <span className="kv-value">{model.canonical_slug}</span>
                </div>
                <div className="kv">
                  <span className="kv-label">Hugging Face</span>
                  <span className="kv-value">{model.hugging_face_id ?? '—'}</span>
                </div>
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
