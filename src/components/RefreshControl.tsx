import { useStore } from '@nanostores/react';
import { $autoRefresh, $refreshInterval, $error, $loading, $fetchedAt } from '../lib/store';
import { Toggle } from './Toggle';
import { Glass } from './Glass';

interface RefreshControlProps {
  onRefresh: () => void;
}

function formatTime(ts: number | null): string {
  if (!ts) return 'never';
  return new Date(ts).toLocaleTimeString();
}

export function RefreshControl({ onRefresh }: RefreshControlProps) {
  const loading = useStore($loading);
  const error = useStore($error);
  const autoRefresh = useStore($autoRefresh);
  const refreshInterval = useStore($refreshInterval);
  const fetchedAt = useStore($fetchedAt);

  return (
    <Glass className="refresh">
      <button
        type="button"
        className="btn btn-primary"
        onClick={onRefresh}
        disabled={loading}
        aria-label="Refresh models"
      >
        {loading ? <span className="spinner-icon" /> : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        )}
        <span>{loading ? 'Refreshing…' : 'Refresh now'}</span>
      </button>

      <div className="refresh-meta">
        <span className="refresh-pulse" aria-hidden="true" />
        <span>Last fetched {formatTime(fetchedAt)}</span>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        <div className="toggle-row" style={{ minWidth: 200 }}>
          <div>
            <div className="toggle-row-label">Auto-refresh</div>
            <div className="toggle-row-sub">every {refreshInterval}m</div>
          </div>
          <Toggle on={autoRefresh} onToggle={(v) => $autoRefresh.set(v)} label="Toggle auto-refresh" />
        </div>
        <div className="field" style={{ width: 90 }}>
          <label className="field-label" htmlFor="refresh-min">Min</label>
          <input
            id="refresh-min"
            type="number"
            min={1}
            step={1}
            className="input"
            value={refreshInterval}
            onChange={(e) => $refreshInterval.set(Math.max(1, Number(e.target.value) || 30))}
          />
        </div>
      </div>

      {error && (
        <div className="error-banner" style={{ flexBasis: '100%' }}>
          {error}
        </div>
      )}
    </Glass>
  );
}