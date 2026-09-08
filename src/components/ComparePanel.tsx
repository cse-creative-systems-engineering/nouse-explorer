import { useStore } from '@nanostores/react';
import { $compare, clearCompare, toggleCompare } from '../lib/compareStore';
import { $models } from '../lib/store';
import { COLUMNS } from '../lib/columns';
import type { ModelEntry } from '../lib/types';

/** Which columns make sense side-by-side (skip icon/name-only columns). */
const COMPARE_COLUMNS = COLUMNS.filter(
  (c) => !['name', 'input_mods', 'output_mods'].includes(c.id) && c.value !== undefined,
);

const ALWAYS_ROWS = ['provider', 'context', 'prompt', 'completion', 'blended_price', 'speed', 'intelligence', 'coding'];

export function ComparePanel({ onClose }: { onClose: () => void }) {
  const ids = useStore($compare);
  const models = useStore($models);
  const pinned = ids
    .map((id) => models.find((m) => m.id === id))
    .filter((m): m is ModelEntry => !!m);

  if (pinned.length === 0) {
    return (
      <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Compare models">
        <div className="modal compare-modal" onClick={(e) => e.stopPropagation()}>
          <header className="modal-head">
            <h2 className="modal-title">Compare models</h2>
            <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Close" style={{ marginLeft: 'auto' }}>✕</button>
          </header>
          <p className="settings-hint">Pin models from the table (pin icon on each row) or cards (compare button), then open this panel to see them side-by-side.</p>
        </div>
      </div>
    );
  }

  const rows: Array<{ label: string; tip?: string; cells: string[] }> = [];
  for (const col of COMPARE_COLUMNS) {
    const values = pinned.map((m) => col.value(m, undefined));
    // skip rows where every model lacks data
    if (values.every((v) => v === null)) continue;
    rows.push({ label: col.label, tip: col.tip, cells: values.map((v) => col.format(v)) });
  }
  // order: put ALWAYS_ROWS first, rest after
  rows.sort((a, b) => {
    const ai = ALWAYS_ROWS.indexOf(a.label);
    const bi = ALWAYS_ROWS.indexOf(b.label);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Compare models">
      <div className="modal compare-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 className="modal-title">Compare models</h2>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button type="button" className="btn" onClick={() => clearCompare()}>Clear all</button>
            <button type="button" className="btn" onClick={onClose}>Done</button>
          </div>
        </header>
        <p className="settings-hint" style={{ marginBottom: 10 }}>
          Hover a metric name for its full explanation. Unpin from the table or card.
        </p>
        <div className="compare-scroll">
          <table className="compare-table">
            <thead>
              <tr>
                <th className="compare-metric-col">Metric</th>
                {pinned.map((m) => (
                  <th key={m.id}>
                    <div className="compare-name">{m.name}</div>
                    <button
                      type="button"
                      className="compare-unpin"
                      onClick={() => toggleCompare(m.id)}
                      title="Remove from comparison"
                    >
                      unpin
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} title={r.tip}>
                  <td className="compare-metric-col">{r.label}</td>
                  {r.cells.map((v, i) => (
                    <td key={i}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
