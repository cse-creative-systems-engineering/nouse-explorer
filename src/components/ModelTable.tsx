import { useMemo, useState } from 'react';
import type { ModelEntry } from '../lib/types';
import { $selectedId } from '../lib/store';
import {
  fmtScore,
  formatContext,
  formatUsd,
  isBatch,
  isFreeVariant,
  perMillion,
  providerFromId,
  resolvePricing,
} from '../lib/pricing';
import { DiscountBadge } from './DiscountBadge';

type SortKey = 'name' | 'provider' | 'prompt' | 'completion' | 'discount' | 'context' | 'coding' | 'intelligence' | 'agentic';

interface ColumnDef {
  key: SortKey | null;
  label: string;
  align?: 'left' | 'right';
}

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Model' },
  { key: 'provider', label: 'Provider' },
  { key: 'prompt', label: 'In / 1M', align: 'right' },
  { key: 'completion', label: 'Out / 1M', align: 'right' },
  { key: 'discount', label: 'Disc', align: 'right' },
  { key: 'context', label: 'Ctx', align: 'right' },
  { key: 'coding', label: 'CI', align: 'right' },
  { key: 'intelligence', label: 'II', align: 'right' },
  { key: 'agentic', label: 'AI', align: 'right' },
  { key: null, label: '' },
];

function valueFor(m: ModelEntry, key: SortKey): number | string | null {
  const r = resolvePricing(m.pricing);
  switch (key) {
    case 'name': return (m.name ?? m.id).toLowerCase();
    case 'provider': return providerFromId(m.id);
    case 'prompt': return perMillion(r.prompt);
    case 'completion': return perMillion(r.completion);
    case 'discount': {
      const p = parseFloat(r.prompt);
      const o = m.pricing.original ? parseFloat(m.pricing.original.prompt) : 0;
      if (isFinite(p) && isFinite(o) && o > 0 && p < o) return (1 - p / o) * 100;
      return -1; // no discount sorts last
    }
    case 'context': return m.context_length ?? 0;
    case 'coding': return m.benchmarks?.artificial_analysis?.coding_index ?? -1;
    case 'intelligence': return m.benchmarks?.artificial_analysis?.intelligence_index ?? -1;
    case 'agentic': return m.benchmarks?.artificial_analysis?.agentic_index ?? -1;
  }
}

interface ModelTableProps {
  models: ModelEntry[];
}

export function ModelTable({ models }: ModelTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    if (!sortKey) return models;
    return [...models].sort((a, b) => {
      const va = valueFor(a, sortKey);
      const vb = valueFor(b, sortKey);
      // nulls last
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      let cmp: number;
      if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb);
      else cmp = (va as number) - (vb as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [models, sortKey, sortDir]);

  function setSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'provider' || key === 'name' ? 'asc' : 'desc');
    }
  }

  function open(id: string) {
    $selectedId.set(id);
  }

  return (
    <div className="table-wrap glass">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                if (!c.key) return <th key={c.label} style={{ width: 90 }} />;
                const active = sortKey === c.key;
                return (
                  <th
                    key={c.key}
                    className="sortable"
                    onClick={() => setSort(c.key!)}
                    style={{ textAlign: c.align ?? 'left' }}
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    {c.label}
                    <span className={`chev ${active ? (sortDir === 'asc' ? 'up' : 'down') : ''}`}>▾</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m) => {
              const r = resolvePricing(m.pricing);
              const prompt = perMillion(r.prompt);
              const completion = perMillion(r.completion);
              const bench = m.benchmarks?.artificial_analysis;
              return (
                <tr key={m.id} onClick={() => open(m.id)}>
                  <td className="cell-name">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                      <DiscountBadge pricing={m.pricing} />
                      {isFreeVariant(m.id) && <span className="badge success">free</span>}
                      {isBatch(m.id) && <span className="badge info">batch</span>}
                    </div>
                    <div className="cell-id" style={{ marginTop: 2 }}>{m.id}</div>
                  </td>
                  <td className="cell-provider">{providerFromId(m.id)}</td>
                  <td className="cell-num" style={{ textAlign: 'right' }}>{formatUsd(prompt)}</td>
                  <td className="cell-num" style={{ textAlign: 'right' }}>{formatUsd(completion)}</td>
                  <td className="cell-num" style={{ textAlign: 'right' }}>
                    {m.pricing.original ? <DiscountBadge pricing={m.pricing} /> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  </td>
                  <td className="cell-num" style={{ textAlign: 'right' }}>{formatContext(m.context_length)}</td>
                  <td className="cell-num" style={{ textAlign: 'right' }}>
                    {fmtScore(bench?.coding_index)}
                  </td>
                  <td className="cell-num" style={{ textAlign: 'right' }}>
                    {fmtScore(bench?.intelligence_index)}
                  </td>
                  <td className="cell-num" style={{ textAlign: 'right' }}>
                    {fmtScore(bench?.agentic_index)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        open(m.id);
                      }}
                      aria-label={`Open ${m.name} details`}
                      title="Details"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
