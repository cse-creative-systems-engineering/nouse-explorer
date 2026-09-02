import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import type { ModelEntry } from '../lib/types';
import { $selectedId } from '../lib/store';
import {
  DAY_LABELS,
  fmtScore,
  formatContext,
  formatPerToken,
  formatUsd,
  hasBenchmark,
  isBatch,
  isFreeVariant,
  isMultimodal,
  perMillion,
  providerFromId,
  resolvePricing,
} from '../lib/pricing';
import { DiscountBadge } from './DiscountBadge';

interface ModelDetailProps {
  model: ModelEntry | undefined;
}

function PricingCell({ label, value }: { label: string; value?: string }) {
  if (!value || value === '' ) return null;
  const perM = perMillion(value);
  return (
    <div className="kv">
      <span className="kv-label">{label}</span>
      <span className="kv-value big">{formatUsd(perM)} <span style={{ color: 'var(--text-muted)', fontSize: 11, marginLeft: 4 }}>/ 1M</span></span>
      <span className="kv-per-token">{formatPerToken(value)} / token</span>
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
  const bench = model.benchmarks;
  const hasBench = hasBenchmark(model);
  const designArena = bench?.design_arena ?? [];
  const aa = bench?.artificial_analysis;
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
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div className="modal-body">
          {model.description && (
            <div className="modal-section">
              <p className="modal-desc">{model.description}</p>
            </div>
          )}

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

          <div className="modal-section">
            <h3 className="modal-section-title">Benchmarks <span className="badge" style={{ marginLeft: 6 }}>embedded</span></h3>
            {!hasBench && (
              <div style={{ padding: '12px', borderRadius: 12, border: '1px dashed rgba(255,255,255,0.20)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Benchmarks pending — the research engine will fetch these from external sources.
              </div>
            )}
            {hasBench && aa && (
              <div className="kv-grid">
                <div className="kv">
                  <span className="kv-label">Intelligence index</span>
                  <span className="kv-value big">{fmtScore(aa.intelligence_index)}</span>
                </div>
                <div className="kv">
                  <span className="kv-label">Coding index</span>
                  <span className="kv-value big">{fmtScore(aa.coding_index)}</span>
                </div>
                <div className="kv">
                  <span className="kv-label">Agentic index</span>
                  <span className="kv-value big">{fmtScore(aa.agentic_index)}</span>
                </div>
              </div>
            )}
            {designArena.length > 0 && (
              <div className="bench-list">
                <div className="bench-row head">
                  <span>arena / category</span>
                  <span>elo</span>
                  <span>win %</span>
                  <span>rank</span>
                </div>
                {designArena.slice(0, 50).map((d, i) => (
                  <div key={`${d.arena}-${d.category}-${i}`} className="bench-row">
                    <span>{d.arena} · {d.category}</span>
                    <span>{d.elo}</span>
                    <span>{fmtScore(d.win_rate)}</span>
                    <span>{d.rank}</span>
                  </div>
                ))}
                {designArena.length > 50 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, padding: '4px 8px' }}>
                    + {designArena.length - 50} more…
                  </div>
                )}
              </div>
            )}
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