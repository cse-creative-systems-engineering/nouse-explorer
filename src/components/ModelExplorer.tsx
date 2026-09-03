import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { ModelEntry } from '../lib/types';
import { $models, $loading, $error, $selectedId, $view, $autoRefresh, $research } from '../lib/store';
import { TitleBar } from './TitleBar';
import { HeroStats } from './HeroStats';
import { UsecasePills, type UsecaseDef } from './UsecasePills';
import { GlassToggle } from './GlassToggle';
import { ShowpieceCard } from './ShowpieceCard';
import { ModelTable } from './ModelTable';
import { ModelDetail } from './ModelDetail';
import { SettingsPanel } from './SettingsPanel';
import { WatchesPanel } from './WatchesPanel';
import { nouse, type ResearchAxis } from '../lib/nouse';

const USECASES: UsecaseDef[] = [
  { id: 'all', label: 'All' },
  { id: 'coding', label: 'Coding' },
  { id: 'research', label: 'Research' },
  { id: 'free', label: 'Free' },
  { id: 'vision', label: 'Vision' },
];

/** Catalog-derived filter chips — always available (from /v1/models). */
type FilterId = 'free' | 'vision' | 'cheap' | 'benchmarked' | 'batch';
const FILTER_DEFS: { id: FilterId; label: string }[] = [
  { id: 'free', label: 'Free' },
  { id: 'vision', label: 'Vision' },
  { id: 'cheap', label: 'Cheap' },
  { id: 'benchmarked', label: 'Benchmarked' },
  { id: 'batch', label: 'Batch' },
];

/** Embedded rank axes — always available (208 models carry them in the API). */
interface RankAxis {
  id: string;
  label: string;
  dir: 'desc' | 'asc';
  metric: string | null; // null → embedded benchmark key
}

const EMBEDDED_RANKS: RankAxis[] = [
  { id: 'coding', label: 'Coding', dir: 'desc', metric: null },
  { id: 'intelligence', label: 'Intelligence', dir: 'desc', metric: null },
  { id: 'agentic', label: 'Agentic', dir: 'desc', metric: null },
];

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

const CHEAP_CAP = 0.5; // $ / 1M output

/** Read an axis value from a model: embedded benchmarks or researched metrics. */
function axisValue(m: ModelEntry, axis: RankAxis, extra: Record<string, number> | undefined): number | null {
  if (axis.metric) {
    const v = extra?.[axis.metric];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  }
  const aa = m.benchmarks?.artificial_analysis;
  switch (axis.id) {
    case 'coding': return aa?.coding_index ?? null;
    case 'intelligence': return aa?.intelligence_index ?? null;
    case 'agentic': return aa?.agentic_index ?? null;
  }
  return null;
}

export function ModelExplorer() {
  const models = useStore($models);
  const loading = useStore($loading);
  const error = useStore($error);
  const view = useStore($view);
  const autoRefresh = useStore($autoRefresh);
  const selectedId = useStore($selectedId);
  const research = useStore($research);

  const [usecase, setUsecase] = useState('all');
  const [query, setQuery] = useState('');
  const [constraints, setConstraints] = useState<Set<FilterId>>(new Set());
  const [rank, setRank] = useState<string>('coding');
  const [extra, setExtra] = useState<Record<string, Record<string, number>>>({});
  const [researchedAxes, setResearchedAxes] = useState<ResearchAxis[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [watchesOpen, setWatchesOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const prevDone = useRef(0);

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

  // Load researched metrics + axes; refresh whenever research completes batches
  // (research results DETERMINE which rank chips are available — user directive)
  const loadResearch = () => {
    const b = nouse();
    if (!b?.research) return;
    void b.research.getMetrics().then(setExtra).catch(() => {});
    void b.research.getAxes().then(setResearchedAxes).catch(() => {});
  };
  useEffect(() => {
    loadResearch();
    // Give the alert engine a fresh catalog snapshot (scheduler diffs against it)
    const b = nouse();
    if (b?.alerts) void b.alerts.setCatalog(models);
  }, []);
  useEffect(() => {
    if (research.done > prevDone.current) {
      prevDone.current = research.done;
      loadResearch();
    }
  }, [research.done]);

  // Rank axes = embedded (always) + researched (as data lands; pending → disabled chip)
  const rankAxes: RankAxis[] = useMemo(() => {
    const embedded: RankAxis[] = [...EMBEDDED_RANKS];
    const researched: RankAxis[] = researchedAxes.map((a) => ({
      id: a.id,
      label: a.label,
      dir: a.dir,
      metric: a.metric,
    }));
    return [...embedded, ...researched];
  }, [researchedAxes]);

  const researchedPending = (axisId: string): boolean =>
    researchedAxes.find((a) => a.id === axisId)?.pending ?? false;

  const toggleConstraint = (id: FilterId) => {
    setConstraints((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => {
    let list = models;

    if (constraints.has('free')) list = list.filter(isFree);
    if (constraints.has('vision')) list = list.filter((m) => (m.architecture?.input_modalities ?? []).includes('image'));
    if (constraints.has('cheap')) {
      list = list.filter((m) => {
        const c = parseFloat(m.pricing.completion);
        return isFinite(c) && c > 0 && c * 1_000_000 <= CHEAP_CAP;
      });
    }
    if (constraints.has('benchmarked')) list = list.filter(hasBench);
    if (constraints.has('batch')) list = list.filter((m) => m.id.endsWith(':batch'));

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          (m.name ?? '').toLowerCase().includes(q) ||
          m.id.split('/')[0].toLowerCase().includes(q),
      );
    }

    // rank axis: use-case presets map to embedded axes; "All" uses the chip
    const activeAxis: RankAxis =
      usecase === 'coding' ? { id: 'coding', label: 'Coding', dir: 'desc', metric: null }
      : usecase === 'research' ? { id: 'intelligence', label: 'Intelligence', dir: 'desc', metric: null }
      : (rankAxes.find((r) => r.id === rank) ?? EMBEDDED_RANKS[0]);

    list = [...list]
      .map((m) => ({ m, v: axisValue(m, activeAxis, extra[m.id]) }))
      .sort((a, b) => {
        // models with no data on the active axis go LAST — never dropped
        if (a.v === null && b.v === null) return 0;
        if (a.v === null) return 1;
        if (b.v === null) return -1;
        return activeAxis.dir === 'desc' ? b.v! - a.v! : a.v! - b.v!;
      })
      .map((x) => x.m);

    return list;
  }, [models, usecase, query, constraints, rank, rankAxes, extra]);

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

  const activeRankLabel =
    usecase !== 'all'
      ? (USECASES.find((u) => u.id === usecase)?.label ?? '')
      : (rankAxes.find((r) => r.id === rank)?.label ?? '');

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

      <div className="deck">
        <div className="deck-group">
          <div className="cmdbar">
            <span className="ic">⌕</span>
            <input
              ref={searchRef}
              placeholder={`Search ${models.length} models — name, provider…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button
                type="button"
                className="search-clear"
                aria-label="Clear search"
                onClick={() => {
                  setQuery('');
                  searchRef.current?.focus();
                }}
              >
                ✕
              </button>
            )}
            <span className="kbd">⌘K</span>
          </div>
          <UsecasePills options={USECASES} value={usecase} onChange={setUsecase} />
        </div>
        <div className="deck-divider" aria-hidden="true" />
        <div className="deck-group deck-utils">
          <GlassToggle
            on={autoRefresh}
            onChange={(v) => $autoRefresh.set(v)}
            label="AUTO-REFRESH"
          />
          <button
            type="button"
            className="magic-btn bell-btn"
            onClick={() => setWatchesOpen(true)}
            title="Alerts & watches"
          >
            🔔
          </button>
          <div className="vt">
            <button
              type="button"
              className={view === 'cards' ? 'on' : ''}
              onClick={() => $view.set('cards')}
            >
              Cards
            </button>
            <button
              type="button"
              className={view === 'table' ? 'on' : ''}
              onClick={() => $view.set('table')}
            >
              Table
            </button>
          </div>
        </div>
      </div>

      <div className="deck deck-filters">
        <div className="deck-group">
          <span className="filter-label">Filter</span>
          {FILTER_DEFS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={`constraint-chip${constraints.has(c.id) ? ' on' : ''}`}
              aria-pressed={constraints.has(c.id)}
              onClick={() => toggleConstraint(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="deck-divider" aria-hidden="true" />
        <div className="deck-group">
          <span className="filter-label">Rank by</span>
          {usecase === 'all' ? (
            rankAxes.map((r) => {
              const pending = researchedPending(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`rank-chip${rank === r.id ? ' on' : ''}${pending ? ' pending' : ''}`}
                  aria-pressed={rank === r.id}
                  disabled={pending}
                  title={pending ? 'Waiting for research data — this chip unlocks when the background research completes' : undefined}
                  onClick={() => setRank(r.id)}
                >
                  {r.label}
                  {pending && <span className="chip-wait" aria-hidden="true">…</span>}
                </button>
              );
            })
          ) : (
            <span className="rank-caption">Ranked by {activeRankLabel.toLowerCase()} — use “All” to change the axis</span>
          )}
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
                setUsecase('all');
                setConstraints(new Set());
              }}
            >
              Clear search &amp; filters
            </button>
          </div>
        )}
        {filtered.length > 0 && view === 'cards' && (
          <div className="grid" key={`${usecase}-${query}-${rank}-${constraints.size}`}>
            {filtered.map((m, i) => (
              <ShowpieceCard
                key={m.id}
                model={m}
                index={i}
                onOpen={() => $selectedId.set(m.id)}
              />
            ))}
          </div>
        )}
        {filtered.length > 0 && view === 'table' && (
          <ModelTable models={filtered} />
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
          Showing {filtered.length} of {models.length} models — ranked by {activeRankLabel.toLowerCase()} · scroll for more
        </div>
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {watchesOpen && <WatchesPanel onClose={() => setWatchesOpen(false)} />}
      {selected && <ModelDetail model={selected} />}
    </div>
  );
}
