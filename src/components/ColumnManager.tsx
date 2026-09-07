import { useRef, useState } from 'react';
import { COLUMNS } from '../lib/columns';
import { $columnOrder, moveColumn, setVisibleColumns, resetColumns } from '../lib/columnStore';
import { useStore } from '@nanostores/react';

/**
 * ColumnManager — customize the table: drag rows to reorder columns,
 * toggle to add/exclude them, grouped by data source. State persists.
 */

const GROUPS = [...new Set(COLUMNS.map((c) => c.group))];

export function ColumnManager({ onClose }: { onClose: () => void }) {
  const order = useStore($columnOrder);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const byId = Object.fromEntries(COLUMNS.map((c) => [c.id, c]));
  const ordered = order.map((id) => byId[id]).filter(Boolean);

  function onDrop(targetId: string | null) {
    if (dragId && dragId !== targetId) moveColumn(dragId, targetId);
    setDragId(null);
    setOverId(null);
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Customize columns">
      <div className="modal colman" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2 className="modal-title">Customize columns</h2>
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button type="button" className="btn" onClick={() => resetColumns()}>Reset</button>
            <button type="button" className="btn" onClick={onClose}>Done</button>
          </div>
        </header>
        <p className="settings-hint" style={{ marginBottom: 10 }}>
          Drag rows to reorder · uncheck to exclude, check to add · saved automatically.
        </p>

        <div className="colman-list" ref={listRef}>
          {ordered.map((c) => (
            <div
              key={c.id}
              className={`colman-row${dragId === c.id ? ' dragging' : ''}${overId === c.id ? ' over' : ''}`}
              draggable={!c.pinned}
              onDragStart={() => setDragId(c.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverId(c.id);
              }}
              onDragLeave={() => setOverId((o) => (o === c.id ? null : o))}
              onDrop={(e) => {
                e.preventDefault();
                onDrop(c.id);
              }}
              onDragEnd={() => onDrop(null)}
            >
              <span className={`colman-grip${c.pinned ? ' pinned' : ''}`} title={c.pinned ? 'Pinned — always visible' : 'Drag to reorder'}>
                ⋮⋮
              </span>
              <label className="colman-label" title={c.tip}>
                <input
                  type="checkbox"
                  checked={true}
                  disabled={c.pinned}
                  onChange={() => setVisibleColumns(order.filter((x) => x !== c.id))}
                />
                <span className="colman-name">{c.label}</span>
                {c.pinned && <span className="colman-pin">pinned</span>}
                <span className="colman-group">{c.group}</span>
              </label>
            </div>
          ))}

          {GROUPS.map((g) => {
            const excluded = COLUMNS.filter((c) => c.group === g && !order.includes(c.id));
            if (excluded.length === 0) return null;
            return (
              <div key={`ex-${g}`} className="colman-ex-group">
                <div className="colman-ex-title">{g} — excluded</div>
                {excluded.map((c) => (
                  <div key={c.id} className="colman-row excluded">
                    <span className="colman-grip" title="Drag to reorder after adding" style={{ opacity: 0.3 }}>⋮⋮</span>
                    <label className="colman-label" title={c.tip}>
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => setVisibleColumns([...order, c.id])}
                      />
                      <span className="colman-name">{c.label}</span>
                      <span className="colman-group">{c.group}</span>
                    </label>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
