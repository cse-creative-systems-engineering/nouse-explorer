import { useMemo, useState } from 'react';
import { useStore } from '@nanostores/react';
import { $models, $loading, $error, $selectedId, $view, $autoRefresh, $stats } from '../lib/store';
import { TitleBar } from './TitleBar';
import { HeroStats } from './HeroStats';
import { UsecasePills, type UsecaseDef } from './UsecasePills';
import { GlassToggle } from './GlassToggle';
import { ShowpieceCard } from './ShowpieceCard';
import { ModelDetail } from './ModelDetail';

const USECASES: UsecaseDef[] = [
  { id: 'all', label: '✦ All' },
  { id: 'coding', label: '⌘ Coding' },
  { id: 'research', label: '◉ Research' },
  { id: 'free', label: '◇ Free' },
  { id: 'vision', label: '◑ Vision' },
];

export function ModelExplorer() {
  const models = useStore($models);
  const loading = useStore($loading);
  const error = useStore($error);
  const view = useStore($view);
  const autoRefresh = useStore($autoRefresh);
  const stats = useStore($stats);
  const selectedId = useStore($selectedId);

  const [usecase, setUsecase] = useState('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    let list = models;
    if (usecase === 'coding') {
      list = list
        .filter((m) => m.benchmarks?.artificial_analysis?.coding_index != null)
        .sort(
          (a, b) =>
            (b.benchmarks?.artificial_analysis?.coding_index ?? 0) -
            (a.benchmarks?.artificial_analysis?.coding_index ?? 0),
        );
    } else if (usecase === 'research') {
      list = list
        .filter((m) => m.benchmarks?.artificial_analysis?.intelligence_index != null)
        .sort(
          (a, b) =>
            (b.benchmarks?.artificial_analysis?.intelligence_index ?? 0) -
            (a.benchmarks?.artificial_analysis?.intelligence_index ?? 0),
        );
    } else if (usecase === 'free') {
      const isFree = (m: (typeof models)[number]) => {
        const p = parseFloat(m.pricing.prompt);
        const c = parseFloat(m.pricing.completion);
        return (isFinite(p) && p === 0) && (isFinite(c) && c === 0);
      };
      list = list.filter(isFree);
    } else if (usecase === 'vision') {
      list = list.filter((m) => (m.architecture?.input_modalities ?? []).includes('image'));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          (m.name ?? '').toLowerCase().includes(q) ||
          m.id.split('/')[0].toLowerCase().includes(q),
      );
    }
    return list;
  }, [models, usecase, query]);

  const selected = models.find((m) => m.id === selectedId) ?? null;

  return (
    <div className="app">
      <TitleBar />

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
        <div className="cmdbar">
          <span className="ic">⌕</span>
          <input
            placeholder={`Search ${stats.total} models — name, provider, capability…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="kbd">⌘K</span>
        </div>
        <UsecasePills options={USECASES} value={usecase} onChange={setUsecase} />
        <GlassToggle
          on={autoRefresh}
          onChange={(v) => $autoRefresh.set(v)}
          label="AUTO-REFRESH"
        />
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

      <div className="results">
        {loading && models.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>
            Loading the catalog…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>
            No models match.
          </div>
        )}
        {filtered.length > 0 && view === 'cards' && (
          <div className="grid" key={`${usecase}-${query}`}>
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
          <div className="grid" key={`t-${usecase}`}>
            {filtered.slice(0, 120).map((m, i) => (
              <ShowpieceCard
                key={m.id}
                model={m}
                index={i}
                onOpen={() => $selectedId.set(m.id)}
              />
            ))}
          </div>
        )}
        {error && models.length > 0 && (
          <div style={{ padding: '10px 28px', color: 'var(--warn)', fontSize: 12 }}>
            Live fetch failed — showing cached data: {error}
          </div>
        )}
      </div>

      {selected && <ModelDetail model={selected} />}
    </div>
  );
}
