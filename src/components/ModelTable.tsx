import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ModelEntry } from '../lib/types';
import { $selectedId } from '../lib/store';
import { COLUMN_BY_ID, modalityIcon } from '../lib/columns';
import { $columnOrder } from '../lib/columnStore';
import { $compare, toggleCompare } from '../lib/compareStore';
import { useStore as useStore2 } from '@nanostores/react';
import { useStore } from '@nanostores/react';
import { DiscountBadge } from './DiscountBadge';
import { isBatch, isFreeVariant } from '../lib/pricing';

type SortKey = string;

const STORAGE_KEY = 'nouse.table.colWidths.v1';
const MIN_COL_W = 56;

/** Load persisted column-width overrides (per column id, in px). */
function loadWidths(): Partial<Record<SortKey, number>> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Record<SortKey, number>>) : {};
  } catch {
    return {};
  }
}

interface ModelTableProps {
  models: ModelEntry[];
  extra?: Record<string, Record<string, number>>;
  sources?: Record<string, Record<string, string>>;
}

export function ModelTable({ models, extra, sources }: ModelTableProps) {
  const compareIds = useStore2($compare);
  const order = useStore($columnOrder);
  const cols = useMemo(() => order.map((id) => COLUMN_BY_ID[id]).filter(Boolean), [order]);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [widths, setWidths] = useState<Partial<Record<SortKey, number>>>(() => loadWidths());
  const [drag, setDrag] = useState<{ key: SortKey; startX: number; startW: number } | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [headerTip, setHeaderTip] = useState<{ label: string; tip: string; x: number; y: number } | null>(null);

  const visibleCols = useMemo(() => cols.filter((c) => widths[c.id] !== 0), [cols, widths]);

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
    const def = COLUMN_BY_ID[sortKey];
    if (!def) return models;
    return [...models].sort((a, b) => {
      const rawVa = def.value(a, extra?.[a.id]);
      const rawVb = def.value(b, extra?.[b.id]);
      const va = (rawVa === null || rawVa === undefined) && def.providerValue ? (def.providerValue(a, extra?.[a.id]) ?? null) : (rawVa ?? null);
      const vb = (rawVb === null || rawVb === undefined) && def.providerValue ? (def.providerValue(b, extra?.[b.id]) ?? null) : (rawVb ?? null);
      if (va === null && vb === null) return a.name.localeCompare(b.name);
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
      setSortDir(COLUMN_BY_ID[key]?.defaultSortDir ?? 'desc');
    }
  }

  function open(id: string) {
    $selectedId.set(id);
  }

  // Keyboard nav: ↑/↓ move row focus, Enter/Space open, Home/End jump.
  const onBodyKeyDown = (e: React.KeyboardEvent) => {
    const rows = Array.from(bodyRef.current?.querySelectorAll<HTMLTableRowElement>('tr[tabindex]') ?? []);
    if (rows.length === 0) return;
    const cur = rows.indexOf(document.activeElement as HTMLTableRowElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = Math.min(rows.length - 1, cur + 1);
    else if (e.key === 'ArrowUp') next = Math.max(0, cur - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = rows.length - 1;
    else if ((e.key === 'Enter' || e.key === ' ') && cur >= 0) {
      e.preventDefault();
      open(rows[cur].dataset.id!);
      return;
    } else return;
    e.preventDefault();
    rows[next]?.focus();
    rows[next]?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <div className="table-wrap glass">
      <div className="table-scroll">
        <table className="table">
          <thead>
            <tr>
              {visibleCols.map((c, ci) => {
                const colKey = c.id;
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
                    style={{ textAlign: c.align ?? 'left', width: widths[colKey] ?? c.defaultWidth }}
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <span
                      className="th-label"
                      tabIndex={0}
                      onMouseEnter={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setHeaderTip({ label: c.label, tip: c.tip, x: r.left, y: r.bottom });
                      }}
                      onMouseLeave={() => setHeaderTip(null)}
                      onFocus={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setHeaderTip({ label: c.label, tip: c.tip, x: r.left, y: r.bottom });
                      }}
                      onBlur={() => setHeaderTip(null)}
                    >
                      {c.label}
                      <span className={`chev ${active ? (sortDir === 'asc' ? 'up' : 'down') : ''}`}>▾</span>
                    </span>
                    {ci < visibleCols.length - 1 && (
                      <span
                        className={`col-resizer${drag?.key === colKey ? ' active' : ''}`}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDrag({ key: colKey, startX: e.clientX, startW: widths[colKey] ?? c.defaultWidth });
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
              <th style={{ width: 90 }} />
            </tr>
          </thead>
          <tbody ref={bodyRef} onKeyDown={onBodyKeyDown}>
            {sorted.map((m) => {
              const mExtra = extra?.[m.id];
              return (
                <tr key={m.id} data-id={m.id} tabIndex={0} onClick={() => open(m.id)} title={`${m.name} — click for details`}>
                  {visibleCols.map((c) => {
                    if (c.id === 'name') {
                      return (
                        <td key="name" className="cell-name">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
                            <DiscountBadge pricing={m.pricing} />
                            {isFreeVariant(m.id) && <span className="badge success" title="Free model">free</span>}
                            {isBatch(m.id) && <span className="badge info" title="Batch/offline variant">batch</span>}
                          </div>
                          <div className="cell-id" style={{ marginTop: 2 }}>{m.id}</div>
                        </td>
                      );
                    }
                    if (c.render === 'modality-icons') {
                      const dir = c.modalityDir === 'out'
                        ? (m.architecture?.output_modalities ?? [])
                        : (m.architecture?.input_modalities ?? []);
                      const kinds = ['text', 'image', 'video', 'audio', 'file'] as const;
                      const present = kinds.filter((k) => dir.includes(k));
                      const iconsHtml = present.map((k) => modalityIcon(k, 10)).join('');
                      return (
                        <td
                          key={c.id}
                          className="cell-mods"
                          title={`${c.label}: ${present.length ? present.join(', ') : 'none'}`}
                          dangerouslySetInnerHTML={{ __html: iconsHtml || '<span class="mods-none">\u2014</span>' }}
                        />
                      );
                    }
                    let raw = c.value(m, mExtra);
                    let providerFallback = false;
                    if ((raw === null || raw === undefined) && c.providerValue) {
                      const pv = c.providerValue(m, mExtra);
                      if (pv != null) { raw = pv; providerFallback = true; }
                    }
                    const isProvider = providerFallback || ('unofficial' in c && c.unofficial === true);
                    return (
                      <td
                        key={c.id}
                        className={`cell-num${isProvider ? ' provider-reported' : ''}`}
                        style={{ textAlign: c.align ?? 'left' }}
                        title={isProvider
                          ? `${c.label}: ${c.format(raw)} — provider-reported score (self-reported by the model's creator; different scale & harness from independently-benchmarked columns)`
                          : typeof raw === 'number'
                          ? `${c.label}: ${c.format(raw)}${sources?.[m.id]?.[c.id] ? ` — source: ${sources[m.id][c.id] === 'openrouter' ? 'OpenRouter (AA composite)' : sources[m.id][c.id] === 'artificial-analysis' ? 'Artificial Analysis research' : sources[m.id][c.id]}` : ''}`
                          : undefined}
                      >
                        {c.format(raw)}
                      </td>
                    );
                  })}
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className={`btn btn-icon compare-pin${compareIds.includes(m.id) ? ' pinned' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCompare(m.id);
                      }}
                      aria-label={compareIds.includes(m.id) ? `Remove ${m.name} from comparison` : `Pin ${m.name} for comparison`}
                      title={compareIds.includes(m.id) ? 'Remove from comparison' : 'Pin for side-by-side comparison'}
                    >
                      {compareIds.includes(m.id) ? '✓' : '⇄'}
                    </button>
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
      {headerTip && createPortal(
        <div
          className="header-tip-portal"
          style={{ left: Math.min(headerTip.x, window.innerWidth - 370), top: headerTip.y + 8 }}
          role="tooltip"
        >
          <div className="header-tip-label">{headerTip.label}</div>
          <div className="header-tip-body">{headerTip.tip}</div>
        </div>,
        document.body,
      )}
    </div>
  );
}
