import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@nanostores/react';
import type { ModelEntry } from '../lib/types';
import { $models, $loading, $error, $selectedId, $view, $autoRefresh, $research, $metricSources } from '../lib/store';
import { TitleBar } from './TitleBar';
import { HeroStats } from './HeroStats';
import { GlassToggle } from './GlassToggle';
import { ShowpieceCard } from './ShowpieceCard';
import { ModelTable } from './ModelTable';
import { ColumnManager } from './ColumnManager';
import { ComparePanel } from './ComparePanel';
import { $compareCount } from '../lib/compareStore';
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
import { $theme, setTheme } from '../lib/themeStore';

function isFree(m: ModelEntry): boolean {
  if (m.id.endsWith(':free')) return true;
  const p = parseFloat(m.pricing.prompt);
  const c = parseFloat(m.pricing.completion);
  return (isFinite(p) && p === 0) && (isFinite(c) && c === 0);
}

function hasBench(m: ModelEntry, extra?: Record<string, number>): boolean {
  const b = m.benchmarks;
  if (b) {
    if (Array.isArray(b.design_arena) && b.design_arena.length > 0) return true;
    if (b.artificial_analysis) return true;
  }
  // researched-only benchmarks count too (AA indices land in the research DB)
  return (
    extra?.artificial_analysis_coding_index != null ||
    extra?.artificial_analysis_intelligence_index != null ||
    extra?.scicode != null ||
    extra?.mmlu_pro != null ||
    extra?.gpqa != null ||
    extra?.livecodebench != null
  );
}

export function ModelExplorer() {
  const theme = useStore($theme);
  const models = useStore($models);
  const loading = useStore($loading);
  const error = useStore($error);
  const view = useStore($view);
  const autoRefresh = useStore($autoRefresh);
  const selectedId = useStore($selectedId);
  const research = useStore($research);

  const [query, setQuery] = useState(() => {
    try { return localStorage.getItem('nouse.query') ?? ''; } catch { return ''; }
  });
  const [sort, setSort] = useState(() => {
    try { return localStorage.getItem('nouse.sort') ?? 'coding_desc'; } catch { return 'coding_desc'; }
  });
  const [variant, setVariant] = useState(() => {
    try { return localStorage.getItem('nouse.variant') ?? 'all'; } catch { return 'all'; }
  });
  useEffect(() => {
    try {
      localStorage.setItem('nouse.query', query);
      localStorage.setItem('nouse.sort', sort);
      localStorage.setItem('nouse.variant', variant);
    } catch { /* non-fatal */ }
  }, [query, sort, variant]);

  // URL hash sync: shareable/bookmarkable views. Read once on mount, write on change.
  useEffect(() => {
    try {
      const h = new URLSearchParams(location.hash.slice(1));
      const hs = h.get('sort'), hv = h.get('variant'), hq = h.get('q');
      if (hs) setSort(hs);
      if (hv) setVariant(hv);
      if (hq !== null) setQuery(hq);
    } catch { /* non-fatal */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      const h = new URLSearchParams();
      if (sort !== 'coding_desc') h.set('sort', sort);
      if (variant !== 'all') h.set('variant', variant);
      if (query) h.set('q', query);
      const hash = h.toString();
      history.replaceState(null, '', hash ? `#${hash}` : location.pathname);
    } catch { /* non-fatal */ }
  }, [sort, variant, query]);
  const [extra, setExtra] = useState<Record<string, Record<string, number>>>({});
  const [profiledIds, setProfiledIds] = useState<Set<string>>(new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lastResearch, setLastResearch] = useState<string | null>(null);
  const [keyStatus, setKeyStatus] = useState<{ nous: boolean; aa: boolean } | null>(null);
  const [onboardDismissed, setOnboardDismissed] = useState(() => {
    try { return localStorage.getItem('nouse.onboard.dismissed') === '1'; } catch { return false; }
  });
  const [watchesOpen, setWatchesOpen] = useState(false);
  const [colmanOpen, setColmanOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const compareCount = useStore($compareCount);
  const [activeWatchCount, setActiveWatchCount] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const prevDone = useRef(0);
  const prevRunning = useRef(false);

  // ⌘K / Ctrl+K focuses search; Esc clears search then blurs
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === 'Escape' && document.activeElement === searchRef.current) {
        e.preventDefault();
        if (query) setQuery('');
        else searchRef.current?.blur();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [query]);

  const loadResearch = () => {
    const b = nouse();
    if (!b?.research) return;
    void b.research.getMetrics().then(setExtra).catch(() => {});
    void b.research.getProfiled().then((ids) => setProfiledIds(new Set(ids))).catch(() => {});
    void b.research.getSources?.().then((s) => $metricSources.set(s)).catch(() => {});
  };
  useEffect(() => {
    loadResearch();
    const b = nouse();
    b?.settings?.get?.().then((s) => setKeyStatus({ nous: s.nousApiKeySet, aa: s.aaApiKeySet })).catch(() => {});
    if (b?.alerts) {
      void b.alerts.setCatalog(models);
      void b.alerts.list().then((ws) => setActiveWatchCount(ws.filter((w) => w.active).length)).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (research.done > prevDone.current) {
      prevDone.current = research.done;
      loadResearch();
      try { localStorage.setItem('nouse.lastResearch', new Date().toISOString()); } catch {}
      window.dispatchEvent(new Event('research-done'));
    }
  }, [research.done]);

  useEffect(() => {
    if (prevRunning.current && !research.running) {
      loadResearch();
    }
    prevRunning.current = research.running;
  }, [research.done, research.running]);

  useEffect(() => {
    const fmt = () => {
      try {
        const t = localStorage.getItem('nouse.lastResearch');
        if (!t) return setLastResearch(null);
        const hrs = (Date.now() - new Date(t).getTime()) / 3600000;
        setLastResearch(hrs < 1 ? `${Math.max(1, Math.round(hrs * 60))}m ago` : `${Math.round(hrs)}h ago`);
      } catch { setLastResearch(null); }
    };
    fmt();
    const iv = setInterval(fmt, 60000);
    window.addEventListener('research-done', fmt);
    return () => { clearInterval(iv); window.removeEventListener('research-done', fmt); };
  }, []);

  const resultsRef = useRef<HTMLDivElement>(null);
  const hintFadeTimer = useRef<number | undefined>(undefined);
  const onResultsScroll = () => {
    const hint = document.querySelector('.scroll-hint');
    if (!hint) return;
    hint.classList.add('scrolling');
    window.clearTimeout(hintFadeTimer.current);
    hintFadeTimer.current = window.setTimeout(() => hint.classList.remove('scrolling'), 900);
  };

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

    // Structured query: space-separated tokens. Supported:
    //   provider:<name>   — only this provider (portal prefix)
    //   -provider:<name>  — exclude a provider
    //   context:>200k / context:<1m — context threshold (k/m suffixes)
    //   free / batch / vision / multimodal — capability tokens
    //   anything else — substring match on id/name/provider
    const q = query.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/);
      const freeText: string[] = [];
      const provInclude: string[] = [];
      const provExclude: string[] = [];
      let ctxMin = 0;
      let ctxMax = Infinity;
      const flags: string[] = [];
      for (const tok of tokens) {
        if (tok.startsWith('provider:')) provInclude.push(tok.slice(9));
        else if (tok.startsWith('-provider:')) provExclude.push(tok.slice(10));
        else if (tok.startsWith('context:>')) {
          const n = parseFloat(tok.slice(9));
          if (tok.endsWith('k')) ctxMin = Math.max(ctxMin, n * 1000);
          else if (tok.endsWith('m')) ctxMin = Math.max(ctxMin, n * 1e6);
          else ctxMin = Math.max(ctxMin, n);
        } else if (tok.startsWith('context:<')) {
          const n = parseFloat(tok.slice(9));
          if (tok.endsWith('k')) ctxMax = Math.min(ctxMax, n * 1000);
          else if (tok.endsWith('m')) ctxMax = Math.min(ctxMax, n * 1e6);
          else ctxMax = Math.min(ctxMax, n);
        } else if (['free', 'batch', 'vision', 'multimodal'].includes(tok)) {
          flags.push(tok);
        } else if (tok) {
          freeText.push(tok);
        }
      }
      list = list.filter((m) => {
        const prov = m.id.split('/')[0].toLowerCase();
        if (provInclude.length && !provInclude.some((p) => prov.includes(p))) return false;
        if (provExclude.some((p) => prov.includes(p))) return false;
        if ((m.context_length ?? 0) < ctxMin || (m.context_length ?? Infinity) > ctxMax) return false;
        for (const f of flags) {
          if (f === 'free' && !m.id.endsWith(':free') && parseFloat(m.pricing.prompt) !== 0) return false;
          if (f === 'batch' && !m.id.endsWith(':batch')) return false;
          if (f === 'vision' && !(m.architecture?.input_modalities ?? []).includes('image')) return false;
          if (f === 'multimodal' && (m.architecture?.input_modalities ?? []).every((x) => x === 'text')) return false;
        }
        if (freeText.length) {
          return freeText.every((t) =>
            m.id.toLowerCase().includes(t) || (m.name ?? '').toLowerCase().includes(t) || prov.includes(t),
          );
        }
        return true;
      });
    }

    const dir = sortDirection(sort);
    list = [...list]
      .map((m) => ({ m, v: sortValue(m, sort, extra[m.id]) }))
      .sort((a, b) => {
        if (a.v === null && b.v === null) return a.m.name.localeCompare(b.m.name);
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
      if (hasBench(m, extra[m.id])) benchmarked += 1;
    }
    return { total: models.length, free, discounted, benchmarked };
  }, [models, extra]);

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
        resultCount={filtered.length}
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
        <span
          className="research-stamp"
          title="When the research engine last updated this data"
        >
          {lastResearch ? `researched ${lastResearch}` : ''}
        </span>
        <div className="deck-divider" aria-hidden="true" />
        <button
          type="button"
          className="magic-btn theme-btn"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          aria-label="Toggle color theme"
        >
          {theme === 'light' ? '☾' : '☀'}
        </button>
        <div className="deck-divider" aria-hidden="true" />
        <button
          type="button"
          className="magic-btn bell-btn"
          onClick={() => setWatchesOpen(true)}
          title="Alerts & watches — track price drops, discounts, and model changes"
        >
          🔔
          {activeWatchCount > 0 && <span className="bell-badge">{activeWatchCount}</span>}
        </button>
        <div className="deck-divider" aria-hidden="true" />
        <button
          type="button"
          className="btn colman-btn"
          onClick={() => setColmanOpen(true)}
          title="Add, exclude, or reorder table columns"
        >
          Columns
        </button>
        <button
          type="button"
          className={`btn colman-btn${compareCount > 0 ? ' compare-active' : ''}`}
          onClick={() => setCompareOpen(true)}
          title={compareCount > 0 ? `Compare ${compareCount} pinned model${compareCount > 1 ? 's' : ''} side-by-side` : 'Pin models from the table, then compare them side-by-side'}
        >
          Compare{compareCount > 0 ? ` (${compareCount})` : ''}
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

      <div className="results" ref={resultsRef} onScroll={onResultsScroll}>
        {!loading && keyStatus && !keyStatus.nous && !onboardDismissed && (
          <div className="onboard-card" role="note">
            <div className="onboard-head">
              <span className="onboard-title">Research needs an API key</span>
              <button
                type="button"
                className="onboard-close"
                onClick={() => {
                  setOnboardDismissed(true);
                  try { localStorage.setItem('nouse.onboard.dismissed', '1'); } catch {}
                }}
                aria-label="Dismiss"
              >
                ✕
              </button>
            </div>
            <p>
              The catalog below works out of the box, but per-model research — benchmark scores,
              pricing intelligence, the “What this model is for” synthesis — needs a Nous API key
              (and optionally an Artificial Analysis key for the full benchmark suite).
            </p>
            <div className="onboard-actions">
              <button type="button" className="btn primary" onClick={() => setSettingsOpen(true)}>
                Add a key in Settings
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={() => {
                  setOnboardDismissed(true);
                  try { localStorage.setItem('nouse.onboard.dismissed', '1'); } catch {}
                }}
              >
                Browse without it
              </button>
            </div>
          </div>
        )}
        {loading && models.length === 0 && (
          <div className="empty-state" role="status" aria-live="polite">
            <div className="spinner" aria-hidden="true" />
            <p>Loading the catalog…</p>
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="empty-state">
            <div className="empty-glyph" aria-hidden="true">⌕</div>
            <p>
              <b>No models match{query ? ` “${query}”` : ''}</b> the current filters.
            </p>
            <p className="empty-hint">Try a shorter search, a different variant, or press <b>Esc</b> in the search box to clear it.</p>
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
          <ModelTable models={filtered} extra={extra} sources={$metricSources.get()} />
        )}
        {error && models.length > 0 && (
          <div style={{ padding: '10px 28px', color: 'var(--warn)', fontSize: 12 }}>
            Live fetch failed — showing cached data: {error}
          </div>
        )}
      </div>
      {filtered.length > 8 && (
        <div className="scroll-hint">
          Showing {filtered.length} of {models.length} models — {activeSortLabel.toLowerCase()} · scroll for more
        </div>
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      {colmanOpen && <ColumnManager onClose={() => setColmanOpen(false)} />}
      {compareOpen && <ComparePanel onClose={() => setCompareOpen(false)} />}
      {watchesOpen && <WatchesPanel onClose={() => setWatchesOpen(false)} />}
      {selected && <ModelDetail model={selected} />}
    </div>
  );
}
