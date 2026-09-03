import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { ModelEntry } from '../lib/types';
import { $models, $loading, $error, $selectedId, $view, $autoRefresh, $research } from '../lib/store';
import { TitleBar } from './TitleBar';
import { HeroStats } from './HeroStats';
import { GlassToggle } from './GlassToggle';
import { ShowpieceCard } from './ShowpieceCard';
import { ModelTable } from './ModelTable';
import { ModelDetail } from './ModelDetail';
import { SettingsPanel } from './SettingsPanel';
import { WatchesPanel } from './WatchesPanel';
import { FilterBar } from './FilterBar';
import {
  applyVariant,
  buildSortOptions,
  buildVariantOptions,
  sortDirection,
  sortValue,
} from '../lib/filterbar';
import { nouse } from '../lib/nouse';

function isFree(m: ModelEntry): boolean {
  if (m.id.endsWith(':free')) return true;
  const p = parseFloat(m.pricing.prompt);
  const c = parseFloat(m.pricing.completion);
  return (isFinite(p) && p === 0) && (isFinite(c) && c === 0);
}

function hasBench(m: ModelEntry): boolean {
  const b = m.benchmarks;
  if (!b) return false;
  if (Array.isArray(b.design_arena) && b.design_arena.length > 0) return true;
  return !!b.artificial_analysis;
}

export function ModelExplorer() {
  const models = useStore($models);
  const loading = useStore($loading);
  const error = useStore($error);
  const view = useStore($view);
  const autoRefresh = useStore($autoRefresh);
  const selectedId = useStore($selectedId);
  const research = useStore($research);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('coding_desc');
  const [variant, setVariant] = useState('all');
  const [extra, setExtra] = useState<Record<string, Record<string, number>>>({});
  const [profiledIds, setProfiledIds] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [watchesOpen, setWatchesOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const prevDone = useRef(0);
  const prevRunning = useRef(false);

  // ⌘K / Ctrl+K focuses search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const loadResearch = () => {
    const b = nouse();
    if (!b?.research) return;
    void b.research.getMetrics().then(setExtra).catch(() => {});
    void b.research.getProfiled().then((ids) => setProfiledIds(new Set(ids))).catch(() => {});
  };
  useEffect(() => {
    loadResearch();
    const b = nouse();
    if (b?.alerts) void b.alerts.setCatalog(models);
  }, []);

  useEffect(() => {
    if (research.done > prevDone.current) {
      prevDone.current = research.done;
      loadResearch();
    }
    if (prevRunning.current && !research.running) {
      loadResearch();
    }
    prevRunning.current = research.running;
  }, [research.done, research.running]);

  // metric coverage drives which sort/variant items are enabled
  const metricCoverage: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of Object.values(extra)) {
      for (const [k, v] of Object.entries(m)) {
        if (typeof v === 'number' && isFinite(v)) counts[k] = (counts[k] ?? 0) + 1;
      }
    }
    return counts;
  }, [extra]);

  const sortOptions = useMemo(() => buildSortOptions(metricCoverage), [metricCoverage]);
  const variantOptions = useMemo(
    () => buildVariantOptions(metricCoverage, profiledIds.size),
    [metricCoverage, profiledIds.size],
  );

  const filtered = useMemo(() => {
    let list = applyVariant(models, variant, extra, profiledIds);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          (m.name ?? '').toLowerCase().includes(q) ||
          m.id.split('/')[0].toLowerCase().includes(q),
      );
    }

    const dir = sortDirection(sort);
    list = [...list]
      .map((m) => ({ m, v: sortValue(m, sort, extra[m.id]) }))
      .sort((a, b) => {
        if (a.v === null && b.v === null) return 0;
        if (a.v === null) return 1;
        if (b.v === null) return -1;
        if (typeof a.v === 'string' && typeof b.v === 'string') {
          return dir === 'asc' ? a.v.localeCompare(b.v) : b.v.localeCompare(a.v);
        }
        const an = a.v as number;
        const bn = b.v as number;
        return dir === 'asc' ? an - bn : bn - an;
      })
      .map((x) => x.m);

    return list;
  }, [models, variant, query, sort, extra, profiledIds]);

  // Catalog totals — always the real numbers, independent of filters
  const stats = useMemo(() => {
    let free = 0;
    let discounted = 0;
    let benchmarked = 0;
    for (const m of models) {
      if (isFree(m)) free += 1;
      const p = parseFloat(m.pricing.prompt);
      const orig = m.pricing.original ? parseFloat(m.pricing.original.prompt) : 0;
      if (isFinite(p) && isFinite(orig) && orig > 0 && p < orig) discounted += 1;
      if (hasBench(m)) benchmarked += 1;
    }
    return { total: models.length, free, discounted, benchmarked };
  }, [models]);

  const activeSortLabel = sortOptions.find((o) => o.id === sort)?.label ?? 'Sort…';
  const selected = models.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="app">
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />

      <div className="hero">
        <div>
          <div className="htitle">
            Every model. Live prices.
            <br />
            <em>Zero surprises.</em>
          </div>
          <div className="hsub">The complete Nous Portal catalog — ranked, priced, benchmarked</div>
        </div>
        <HeroStats
          total={stats.total}
          discounted={stats.discounted}
          benchmarked={stats.benchmarked}
          free={stats.free}
        />
      </div>

      <FilterBar
        total={models.length}
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        sortOptions={sortOptions}
        variant={variant}
        onVariant={setVariant}
        variantOptions={variantOptions}
        searchRef={searchRef}
      />

      <div className="deck deck-utils">
        <span className="filter-label" style={{ marginLeft: 28 }} title="Results shown">
          {filtered.length} of {models.length} models
        </span>
        <span style={{ flex: 1 }} />
        <GlassToggle
          on={autoRefresh}
          onChange={(v) => $autoRefresh.set(v)}
          label="AUTO-REFRESH"
        />
        <button
          type="button"
          className="magic-btn bell-btn"
          onClick={() => setWatchesOpen(true)}
          title="Alerts & watches — track price drops, discounts, and model changes"
        >
          🔔
        </button>
        <div className="vt">
          <button
            type="button"
            className={view === 'cards' ? 'on' : ''}
            onClick={() => $view.set('cards')}
            title="Card view"
          >
            Cards
          </button>
          <button
            type="button"
            className={view === 'table' ? 'on' : ''}
            onClick={() => $view.set('table')}
            title="Table view — sortable columns"
          >
            Table
          </button>
        </div>
      </div>

      <div className="results">
        {loading && models.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>
            Loading the catalog…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <p>No models match{query ? ` “${query}”` : ''} the current filters.</p>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setQuery('');
                setSort('coding_desc');
                setVariant('all');
              }}
            >
              Clear search &amp; filters
            </button>
          </div>
        )}
        {filtered.length > 0 && view === 'cards' && (
          <div className="grid" key={`${variant}-${query}-${sort}`}>
            {filtered.map((m, i) => (
              <ShowpieceCard
                key={m.id}
                model={m}
                index={i}
                extra={extra[m.id]}
                onOpen={() => $selectedId.set(m.id)}
              />
            ))}
          </div>
        )}
        {filtered.length > 0 && view === 'table' && (
          <ModelTable models={filtered} extra={extra} />
        )}
        {error && models.length > 0 && (
          <div style={{ padding: '10px 28px', color: 'var(--warn)', fontSize: 12 }}>
            Live fetch failed — showing cached data: {error}
          </div>
        )}
        {filtered.length > 8 && (
          <div className="results-fade" aria-hidden="true" />
        )}
      </div>
      {filtered.length > 8 && (
        <div className="scroll-hint">
          Showing {filtered.length} of {models.length} models — {activeSortLabel.toLowerCase()} · scroll for more
        </div>
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {watchesOpen && <WatchesPanel onClose={() => setWatchesOpen(false)} />}
      {selected && <ModelDetail model={selected} />}
    </div>
  );
}
