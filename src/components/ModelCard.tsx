import { useStore } from '@nanostores/react';
import type { ModelEntry } from '../lib/types';
import { $selectedId } from '../lib/store';
import {
  fmtScore,
  formatContext,
  formatUsd,
  hasBenchmark,
  isBatch,
  isFreeVariant,
  perMillion,
  providerFromId,
  resolvePricing,
} from '../lib/pricing';
import { DiscountBadge } from './DiscountBadge';
import { BenchmarkMissing } from './BenchmarkMissing';

interface ModelCardProps {
  model: ModelEntry;
  index: number;
}

export function ModelCard({ model }: ModelCardProps) {
  const selectedId = useStore($selectedId);
  const selected = selectedId === model.id;
  const resolved = resolvePricing(model.pricing);
  const prompt = perMillion(resolved.prompt);
  const completion = perMillion(resolved.completion);
  const hasBench = hasBenchmark(model);
  const bench = model.benchmarks?.artificial_analysis;
  const modality = model.architecture?.modality ?? '—';

  function open() {
    $selectedId.set(model.id);
  }

  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      open();
    }
  }

  return (
    <div
      className="card glass glass-hoverable"
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={open}
      onKeyDown={onKey}
    >
      <div className="card-header">
        <div style={{ minWidth: 0 }}>
          <p className="card-provider">{providerFromId(model.id)}</p>
          <h3 className="card-name" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{model.name}</h3>
          <p className="card-id">{model.id}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
          <DiscountBadge pricing={model.pricing} />
          {isFreeVariant(model.id) && <span className="badge success">Free</span>}
          {isBatch(model.id) && <span className="badge info">Batch</span>}
        </div>
      </div>

      <div className="card-prices">
        <div className="card-price">
          <span className="card-price-label">Input / 1M</span>
          <span className="card-price-value">{formatUsd(prompt)}</span>
          <span className="card-price-sub">{resolved.prompt} / tok</span>
        </div>
        <div className="card-price">
          <span className="card-price-label">Output / 1M</span>
          <span className="card-price-value">{formatUsd(completion)}</span>
          <span className="card-price-sub">{resolved.completion} / tok</span>
        </div>
      </div>

      <div className="card-meta">
        <span className="badge">ctx {formatContext(model.context_length)}</span>
        <span className="badge">{modality}</span>
        {hasBench && bench && (
          <>
            <span className="badge accent" title="Artificial Analysis intelligence_index">II {fmtScore(bench.intelligence_index)}</span>
            <span className="badge accent" title="Artificial Analysis coding_index">CI {fmtScore(bench.coding_index)}</span>
            <span className="badge accent" title="Artificial Analysis agentic_index">AI {fmtScore(bench.agentic_index)}</span>
          </>
        )}
        {!hasBench && <BenchmarkMissing />}
      </div>

      <div className="card-foot">
        <span className="card-foot-meta">Top: {formatContext(model.top_provider?.context_length ?? 0)} ctx</span>
        <span className="card-foot-meta">{model.top_provider?.is_moderated ? 'moderated' : 'open'}</span>
      </div>
    </div>
  );
}