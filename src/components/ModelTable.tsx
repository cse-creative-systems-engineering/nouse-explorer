import { useEffect, useMemo, useState } from 'react';
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

type SortKey = 'name' | 'provider' | 'prompt' | 'completion' | 'discount' | 'context' | 'coding' | 'intelligence' | 'agentic' | 'speed' | 'scicode' | 'popular';

interface ColumnDef {
  key: SortKey | null;
  label: string; // spelled out
  tip: string;   // tooltip
  align?: 'left' | 'right';
}

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Model', tip: 'Sort by model name (A–Z)' },
  { key: 'provider', label: 'Provider', tip: 'Sort by provider (A–Z)' },
  { key: 'prompt', label: 'Input $ / 1M', tip: 'Input price per 1M tokens — sort ascending for cheapest', align: 'right' },
  { key: 'completion', label: 'Output $ / 1M', tip: 'Output price per 1M tokens — sort ascending for cheapest', align: 'right' },
  { key: 'discount', label: 'Discount', tip: 'Discount % vs list price — sort for biggest savings', align: 'right' },
  { key: 'context', label: 'Context', tip: 'Max context window in tokens', align: 'right' },
  { key: 'coding', label: 'Coding', tip: 'Artificial Analysis coding index (embedded)', align: 'right' },
  { key: 'intelligence', label: 'Intelligence', tip: 'Artificial Analysis intelligence index (embedded)', align: 'right' },
  { key: 'agentic', label: 'Agentic', tip: 'Artificial Analysis agentic index (embedded)', align: 'right' },
  { key: 'speed', label: 'Speed t/s', tip: 'Output speed, tokens/sec (researched via Artificial Analysis)', align: 'right' },
  { key: 'scicode', label: 'SciCode', tip: 'SciCode benchmark score (researched via Artificial Analysis)', align: 'right' },
  { key: null, label: '', tip: '' },
];

function valueFor(m: ModelEntry, key: SortKey, extra?: Record<string, number>): number | string | null {
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
    case 'speed': return extra?.median_output_tokens_per_second ?? -1;
    case 'scicode': return extra?.scicode ?? -1;
    case 'popular': return extra?.hf_downloads ?? -1;
  }
}

interface ModelTableProps {
  models: ModelEntry[];
  extra?: Record<string, Record<string, number>>;
}

const STORAGE_KEY = 'nouse.table.colWidths.v1';
const MIN_COL_W = 56;

/** Sensible defaults so `table-layout: fixed` is fully determined on first load. */
const DEFAULT_WIDTHS: Record<SortKey, number> = {
  name: 260,
  provider: 110,
  prompt: 96,
  completion: 104,
  discount: 92,
  context: 92,
  coding: 82,
  intelligence: 108,
  agentic: 84,
  speed: 96,
  scicode: 88,
  popular: 100,
};

/** Load persisted column-width overrides (per column key, in px). */
function loadWidths(): Partial<Record<SortKey, number>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<SortKey, number>>) : {};
  } catch {
    return {};
  }
}

export function ModelTable({ models, extra }: ModelTableProps) {
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [widths, setWidths] = useState<Partial<Record<SortKey, number>>>(() => loadWidths());
  const [drag, setDrag] = useState<{ key: SortKey; startX: number; startW: number } | null>(null);

  // Live column resize while a header drag handle is active.
  useEffect(() => {
    if (!drag) return;
    function onMove(e: MouseEvent) {
      if (!drag) return;
      e.preventDefault(); // keep text selection off while dragging
      const next = Math.max(MIN_COL_W, drag.startW + e.clientX - drag.startX);
      setWidths((w) => ({ ...w, [drag.key]: next }));
    }
    function onUp() {
      setDrag(null);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag]);

  // Persist widths once a drag finishes.
  useEffect(() => {
    if (drag) return; // save on drag end, not every move
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widths));
    } catch { /* storage unavailable — non-fatal */ }
  }, [widths, drag]);

  const sorted = useMemo(() => {
    if (!sortKey) return models;
    return [...models].sort((a, b) => {
      const va = valueFor(a, sortKey, extra?.[a.id]);
      const vb = valueFor(b, sortKey, extra?.[b.id]);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      let cmp: number;
      if (typeof va === 'string' && typeof vb === 'string') cmp = va.localeCompare(vb);
      else cmp = (va as number) - (vb as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [models, sortKey, sortDir, extra]);

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
              {COLUMNS.map((c, ci) => {
                const colKey = c.key;
                if (!colKey) return <th key={c.label} style={{ width: 90 }} />;
                const active = sortKey === colKey;
                return (
                  <th
                    key={colKey}
                    className="sortable"
                    onClick={() => setSort(colKey)}
                    onDoubleClick={(e) => {
                      // double-click on the label (not the handle) resets this column
                      if ((e.target as HTMLElement).closest('.col-resizer')) return;
                      setWidths((w) => {
                        const { [colKey]: _drop, ...rest } = w;
                        return rest;
                      });
                    }}
                    title={`${c.tip} — click to sort, drag edge to resize, double-click to reset (${active ? `currently ${sortDir === 'asc' ? 'ascending' : 'descending'}` : 'click to sort'})`}
                    style={{ textAlign: c.align ?? 'left', width: widths[colKey] ?? DEFAULT_WIDTHS[colKey] }}
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    {c.label}
                    <span className={`chev ${active ? (sortDir === 'asc' ? 'up' : 'down') : ''}`}>▾</span>
                    {ci < COLUMNS.length - 1 && (
                      <span
                        className={`col-resizer${drag?.key === colKey ? ' active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDrag({ key: colKey, startX: e.clientX, startW: widths[colKey] ?? DEFAULT_WIDTHS[colKey] });
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setWidths((w) => {
                            const { [colKey]: _drop, ...rest } = w;
                            return rest;
                          });
                        }}
                        title="Drag to resize — double-click to reset"
                      />
                    )}
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
              const mExtra = extra?.[m.id];
              return (
                <tr key={m.id} onClick={() => open(m.id)} title={`${m.name} — click for details`}>
                  <td className="cell-name">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                      <DiscountBadge pricing={m.pricing} />
                      {isFreeVariant(m.id) && <span className="badge success" title="Free model">free</span>}
                      {isBatch(m.id) && <span className="badge info" title="Batch/offline variant">batch</span>}
                    </div>
                    <div className="cell-id" style={{ marginTop: 2 }}>{m.id}</div>
                  </td>
                  <td className="cell-provider" title={providerFromId(m.id)}>{providerFromId(m.id)}</td>
                  <td className="cell-num" style={{ textAlign: 'right' }} title={`Input $${formatUsd(prompt)} / 1M tokens`}>{formatUsd(prompt)}</td>
                  <td className="cell-num" style={{ textAlign: 'right' }} title={`Output $${formatUsd(completion)} / 1M tokens`}>{formatUsd(completion)}</td>
                  <td className="cell-num" style={{ textAlign: 'right' }}>
                    {m.pricing.original ? <DiscountBadge pricing={m.pricing} /> : <span style={{ color: 'var(--text-muted)' }} title="No discount">—</span>}
                  </td>
                  <td className="cell-num" style={{ textAlign: 'right' }} title={`Context window: ${m.context_length?.toLocaleString() ?? 'n/a'} tokens`}>{formatContext(m.context_length)}</td>
                  <td className="cell-num" style={{ textAlign: 'right' }} title="Artificial Analysis coding index (embedded)">
                    {fmtScore(bench?.coding_index)}
                  </td>
                  <td className="cell-num" style={{ textAlign: 'right' }} title="Artificial Analysis intelligence index (embedded)">
                    {fmtScore(bench?.intelligence_index)}
                  </td>
                  <td className="cell-num" style={{ textAlign: 'right' }} title="Artificial Analysis agentic index (embedded)">
                    {fmtScore(bench?.agentic_index)}
                  </td>
                  <td className="cell-num" style={{ textAlign: 'right' }} title="Output speed, tokens/sec (researched via Artificial Analysis)">
                    {mExtra?.median_output_tokens_per_second != null
                      ? Math.round(mExtra.median_output_tokens_per_second!)
                      : <span className="na">—</span>}
                  </td>
                  <td className="cell-num" style={{ textAlign: 'right' }} title="SciCode benchmark score (researched via Artificial Analysis)">
                    {mExtra?.scicode != null
                      ? (mExtra.scicode!).toFixed(2)
                      : <span className="na">—</span>}
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
                      title="Open details"
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
