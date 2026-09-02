import { useStore } from '@nanostores/react';
import { $stats } from '../lib/store';

function timeAgo(ts: number | null): string {
  if (!ts) return 'never';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function StatsHeader() {
  const stats = useStore($stats);
  return (
    <div className="stats-grid">
      <div className="stat glass">
        <p className="stat-label">Total models</p>
        <p className="stat-value">{stats.total}</p>
        <p className="stat-sub">across all providers</p>
      </div>
      <div className="stat glass">
        <p className="stat-label">Free</p>
        <p className="stat-value">{stats.free}</p>
        <p className="stat-sub">prompt + completion = $0</p>
      </div>
      <div className="stat glass">
        <p className="stat-label">Discounted</p>
        <p className="stat-value">{stats.discounted}</p>
        <p className="stat-sub">below original price</p>
      </div>
      <div className="stat glass">
        <p className="stat-label">Benchmarked</p>
        <p className="stat-value">{stats.benchmarked}</p>
        <p className="stat-sub">embedded scores</p>
      </div>
      <div className="stat glass">
        <p className="stat-label">Last refresh</p>
        <p className="stat-value" style={{ fontSize: 18 }}>{timeAgo(stats.fetchedAt)}</p>
        <p className="stat-sub">localStorage cache · 1h TTL</p>
      </div>
    </div>
  );
}