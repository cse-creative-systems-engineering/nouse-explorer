import { useEffect, useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { ModelEntry } from '../lib/types';
import { $models, $selectedId } from '../lib/store';
import { parseMagicQuery, scoreModels, type Axis } from '../lib/magic';
import { nouse } from '../lib/nouse';

const SUGGESTIONS = [
  'best cheap coding model',
  'fastest capable model',
  'best free model for research',
  'most popular cheap model',
  'best model with huge context',
];

const AXIS_LABELS: Record<Axis, string> = {
  coding: 'Coding',
  intelligence: 'Intelligence',
  agentic: 'Agentic',
  speed: 'Speed',
  latency: 'Latency',
  cost_in: 'Cost in',
  cost_out: 'Cost out',
  context: 'Context',
  free: 'Free',
  popularity: 'Popularity',
};

const fmt = (n: number): string =>
  n >= 100 ? n.toFixed(0) : n >= 1 ? n.toFixed(2) : n.toFixed(4);

export function MagicPanel({ onClose }: { onClose: () => void }) {
  const models = useStore($models);
  const [query, setQuery] = useState('');
  const [extra, setExtra] = useState<Record<string, Record<string, number>>>({});

  useEffect(() => {
    const b = nouse();
    if (!b?.research) return;
    void b.research.getMetrics().then(setExtra).catch(() => {});
  }, []);

  const results = useMemo(() => {
    const axes = parseMagicQuery(query || 'best model');
    const scored = scoreModels(models, axes, extra);
    return { axes, scored };
  }, [query, models, extra]);

  const shown = results.scored.filter((s) => s.covered >= Math.max(1, results.axes.length - 1)).slice(0, 8);

  return (
    <div className="magic-panel">
      <div className="magic-head">
        <div className="magic-title">✦ Magic query</div>
        <button type="button" className="magic-close" onClick={onClose} aria-label="Close magic panel">✕</button>
      </div>
      <div className="magic-input">
        <span className="ic">⌕</span>
        <input
          autoFocus
          placeholder="e.g. fastest capable model under $1 / 1M output…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="magic-chips">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" className="magic-chip" onClick={() => setQuery(s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="magic-axes">
        {results.axes.map((a) => (
          <span key={a.axis} className="magic-axis">
            {AXIS_LABELS[a.axis]} {a.dir === 1 ? '↑' : '↓'}
          </span>
        ))}
      </div>
      {shown.length === 0 ? (
        <div className="magic-empty">No models have data on all requested axes — try fewer criteria.</div>
      ) : (
        <div className="magic-results">
          {shown.map((s, i) => (
            <button
              type="button"
              key={s.model.id}
              className="magic-row"
              onClick={() => $selectedId.set(s.model.id)}
            >
              <span className="magic-rank">#{i + 1}</span>
              <span className="magic-name">
                <span className="magic-mname">{s.model.name}</span>
                <span className="magic-mid">{s.model.id}</span>
              </span>
              <span className="magic-scores">
                {results.axes.map((a) => (
                  <span key={a.axis} className="magic-score" title={`${AXIS_LABELS[a.axis]}: ${s.scores[a.axis]?.toFixed(2) ?? '—'}`}>
                    {s.scores[a.axis] !== undefined
                      ? `${AXIS_LABELS[a.axis].split(' ')[0]} ${fmt(s.model.pricing ? axisRaw(s.model, a.axis, extra[s.model.id]) : 0)}`
                      : `${AXIS_LABELS[a.axis].split(' ')[0]} —`}
                  </span>
                ))}
              </span>
              <span className="magic-total">{Math.round(s.total * 100)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function axisRaw(m: ModelEntry, axis: Axis, extra: Record<string, number> | undefined): number {
  const aa = m.benchmarks?.artificial_analysis;
  switch (axis) {
    case 'coding': return aa?.coding_index ?? 0;
    case 'intelligence': return aa?.intelligence_index ?? 0;
    case 'agentic': return aa?.agentic_index ?? 0;
    case 'speed': return extra?.median_output_tokens_per_second ?? 0;
    case 'latency': return extra?.median_time_to_first_token_seconds ?? 0;
    case 'popularity': return extra?.hf_downloads ?? 0;
    case 'cost_in': return parseFloat(m.pricing.prompt) * 1e6;
    case 'cost_out': return parseFloat(m.pricing.completion) * 1e6;
    case 'context': return m.context_length ?? 0;
    case 'free': return 0;
  }
}
