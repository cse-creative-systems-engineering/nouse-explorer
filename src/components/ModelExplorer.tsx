import { useStore } from '@nanostores/react';
import type { SortKey } from '../lib/types';
import {
  $error,
  $filtered,
  $filters,
  $loading,
  $models,
  $selectedId,
  $sortDir,
  $sortKey,
  $view,
} from '../lib/store';
import { defaultFilters } from '../lib/filters';
import { useModels } from '../hooks/useModels';
import { StatsHeader } from './StatsHeader';
import { RefreshControl } from './RefreshControl';
import { Filters } from './Filters';
import { ModelCard } from './ModelCard';
import { ModelTable } from './ModelTable';
import { ModelDetail } from './ModelDetail';
import { Glass } from './Glass';
import { Dropdown } from './Dropdown';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'provider', label: 'Provider' },
  { value: 'prompt', label: 'Input price / 1M' },
  { value: 'completion', label: 'Output price / 1M' },
  { value: 'discount', label: 'Discount %' },
  { value: 'context', label: 'Context length' },
  { value: 'coding', label: 'Coding index' },
  { value: 'intelligence', label: 'Intelligence index' },
  { value: 'agentic', label: 'Agentic index' },
];

function Skeleton() {
  return (
    <div className="skeleton-grid">
      {Array.from({ length: 12 }).map((_, idx) => (
        <div key={idx} className="skeleton-card">
          <div className="skeleton-line long" />
          <div className="skeleton-line med" />
          <div className="skeleton-line short" />
          <div className="skeleton-line med" />
          <div className="skeleton-line long" />
        </div>
      ))}
    </div>
  );
}

export function ModelExplorer() {
  const { refresh } = useModels();
  const models = useStore($models);
  const filtered = useStore($filtered);
  const loading = useStore($loading);
  const error = useStore($error);
  const view = useStore($view);
  const sortKey = useStore($sortKey);
  const sortDir = useStore($sortDir);
  const selectedId = useStore($selectedId);
  const selected = models.find((m) => m.id === selectedId);

  return (
    <div className="app-shell">
      <div className="app-bg" aria-hidden="true" />
      <main className="page">
        <header className="page-header">
          <div className="brand">
            <div className="brand-mark" aria-hidden="true">N</div>
            <div>
              <h1 className="brand-title">Nous Model Explorer</h1>
              <p className="brand-sub">Phase 1 MVP · live from inference-api.nousresearch.com</p>
            </div>
          </div>
          <div className="view-toggle" role="tablist" aria-label="View mode">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'cards'}
              className={view === 'cards' ? 'active' : ''}
              onClick={() => $view.set('cards')}
            >
              Cards
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'table'}
              className={view === 'table' ? 'active' : ''}
              onClick={() => $view.set('table')}
            >
              Table
            </button>
          </div>
        </header>

        <StatsHeader />
        <RefreshControl onRefresh={() => void refresh(true)} />
        <Filters models={models} />

        <Glass style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
              Showing <strong style={{ color: 'var(--text-primary)' }}>{filtered.length}</strong> of {models.length} models
            </span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center', minWidth: 220 }}>
              <span style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sort</span>
              <div style={{ flex: 1 }}>
                <Dropdown
                  value={sortKey}
                  onChange={(v) => $sortKey.set(v)}
                  options={SORT_OPTIONS}
                  placeholder="Sort by…"
                />
              </div>
              <button
                type="button"
                className="btn btn-icon"
                onClick={() => $sortDir.set(sortDir === 'asc' ? 'desc' : 'asc')}
                aria-label={`Sort direction: ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
                title={`Sort direction: ${sortDir === 'asc' ? 'ascending' : 'descending'} — click to toggle`}
              >
                {sortDir === 'asc' ? '↑' : '↓'}
              </button>
            </div>
          </div>
        </Glass>

        {loading && models.length === 0 && <Skeleton />}

        {!loading && filtered.length === 0 && (
          <Glass className="empty">
            <p>No models match the current filters.</p>
            <button type="button" className="btn" onClick={() => $filters.set({ ...defaultFilters })}>Reset filters</button>
          </Glass>
        )}

        {filtered.length > 0 && view === 'cards' && (
          <div className="cards-grid stagger" key={`cards-${sortKey}-${sortDir}-${selectedId ?? ''}`}>
            {filtered.map((m, idx) => (
              <ModelCard key={m.id} model={m} index={idx} />
            ))}
          </div>
        )}

        {filtered.length > 0 && view === 'table' && (
          <ModelTable models={filtered} />
        )}

        {error && models.length > 0 && (
          <div className="error-banner">
            Showing cached data — live fetch failed: {error}
          </div>
        )}

        <footer className="app-foot">
          Press <kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>Enter</kbd> on a card to open details · <kbd style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>Esc</kbd> to close.
        </footer>
      </main>

      {selected && <ModelDetail model={selected} />}
    </div>
  );
}