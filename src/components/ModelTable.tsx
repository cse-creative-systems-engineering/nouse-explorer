import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModelEntry } from '../lib/types';
import { $selectedId } from '../lib/store';
import { COLUMN_BY_ID } from '../lib/columns';
import { $columnOrder } from '../lib/columnStore';
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
}

export function ModelTable({ models, extra }: ModelTableProps) {
  const order = useStore($columnOrder);
  const cols = useMemo(() => order.map((id) => COLUMN_BY_ID[id]).filter(Boolean), [order]);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [widths, setWidths] = useState<Partial<Record<SortKey, number>>>(() => loadWidths());
  const [drag, setDrag] = useState<{ key: SortKey; startX: number; startW: number } | null>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);

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
      const va = def.value(a, extra?.[a.id]);
      const vb = def.value(b, extra?.[b.id]);
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
                    <span className="th-label" tabIndex={0}>
                      {c.label}
                      <span className={`chev ${active ? (sortDir === 'asc' ? 'up' : 'down') : ''}`}>▾</span>
                      <span className="th-tip" role="tooltip">{c.tip}</span>
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
                    const raw = c.value(m, mExtra);
                    return (
                      <td
                        key={c.id}
                        className="cell-num"
                        style={{ textAlign: c.align ?? 'left' }}
                        title={typeof raw === 'number' ? `${c.label}: ${c.format(raw)}` : undefined}
                      >
                        {c.format(raw)}
                      </td>
                    );
                  })}
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
