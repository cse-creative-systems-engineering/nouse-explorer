import { useRef, useState } from 'react';
import { COLUMNS } from '../lib/columns';
import { $columnOrder, moveColumn, setVisibleColumns, resetColumns } from '../lib/columnStore';
import { useStore } from '@nanostores/react';

/**
 * ColumnManager — customize the table: drag rows to reorder columns,
 * toggle to add/exclude them, grouped by data source. State persists.
 * Each row shows a plain-language summary so users can decide what to
 * display without hovering; the full explanation stays on hover/title.
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

  const Row = ({ c, excluded }: { c: (typeof COLUMNS)[number]; excluded?: boolean }) => (
    <div
      className={`colman-row${dragId === c.id ? ' dragging' : ''}${overId === c.id ? ' over' : ''}${excluded ? ' excluded' : ''}`}
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
          checked={!excluded}
          disabled={c.pinned}
          onChange={() =>
            excluded
              ? setVisibleColumns([...order, c.id])
              : setVisibleColumns(order.filter((x) => x !== c.id))
          }
        />
        <span className="colman-text">
          <span className="colman-name">{c.label}</span>
          <span className="colman-summary">{c.summary}</span>
        </span>
        {c.pinned && <span className="colman-pin">pinned</span>}
      </label>
    </div>
  );

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
          Drag rows to reorder · uncheck to exclude, check to add · saved automatically. Hover a row for the full explanation.
        </p>

        <div className="colman-list" ref={listRef}>
          {GROUPS.map((g) => {
            const inGroup = ordered.filter((c) => c.group === g);
            const excludedInGroup = COLUMNS.filter((c) => c.group === g && !order.includes(c.id));
            if (inGroup.length === 0 && excludedInGroup.length === 0) return null;
            return (
              <div key={g} className="colman-group-block">
                <div className="colman-group-title">{g}</div>
                {inGroup.map((c) => <Row key={c.id} c={c} />)}
                {excludedInGroup.map((c) => <Row key={c.id} c={c} excluded />)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
