import { useMemo } from 'react';
import { useStore } from '@nanostores/react';
import type { ModelEntry } from '../lib/types';
import { $filters } from '../lib/store';
import { uniqueModalities, uniqueProviders } from '../lib/filters';
import type { FilterState } from '../lib/filters';
import { SearchInput } from './SearchInput';
import { Chip } from './Chip';
import { Dropdown } from './Dropdown';
import { Glass } from './Glass';

interface FiltersProps {
  models: ModelEntry[];
}

function update<K extends keyof FilterState>(key: K, value: FilterState[K]) {
  $filters.set({ ...$filters.get(), [key]: value });
}

export function Filters({ models }: FiltersProps) {
  const filters = useStore($filters);

  const providers = useMemo(() => uniqueProviders(models), [models]);
  const modalities = useMemo(() => uniqueModalities(models), [models]);

  return (
    <Glass className="filters">
      <div className="filters-row">
        <div style={{ flex: '1 1 240px', minWidth: 200 }}>
          <SearchInput
            value={filters.search}
            onChange={(v) => update('search', v)}
            placeholder="Search id, name, description…"
          />
        </div>
        <div style={{ flex: '0 1 220px', minWidth: 160 }}>
          <Dropdown
            value={filters.provider}
            onChange={(v) => update('provider', v)}
            options={providers.map((p) => ({ value: p, label: p }))}
            placeholder="All providers"
          />
        </div>
        <div style={{ flex: '0 1 280px', minWidth: 200 }}>
          <Dropdown
            value={filters.modality}
            onChange={(v) => update('modality', v)}
            options={modalities.map((m) => ({ value: m, label: m }))}
            placeholder="All modalities"
          />
        </div>
      </div>

      <div className="filters-row">
        <Chip active={filters.freeOnly} onClick={() => update('freeOnly', !filters.freeOnly)}>Free only</Chip>
        <Chip active={filters.multimodalOnly} onClick={() => update('multimodalOnly', !filters.multimodalOnly)}>Multimodal only</Chip>
        <Chip active={filters.hasDiscount} onClick={() => update('hasDiscount', !filters.hasDiscount)}>Has discount</Chip>
        <Chip active={filters.hasBenchmark} onClick={() => update('hasBenchmark', !filters.hasBenchmark)}>Has benchmarks</Chip>
        <Chip active={filters.noBenchmark} onClick={() => update('noBenchmark', !filters.noBenchmark)}>No benchmarks</Chip>
        <Chip active={filters.batchOnly} onClick={() => update('batchOnly', !filters.batchOnly)}>Batch variants</Chip>
      </div>

      <div className="filters-grid">
        <div className="field">
          <label className="field-label" htmlFor="ctx-min">Min context</label>
          <input
            id="ctx-min"
            type="number"
            min={0}
            step={1000}
            className="input"
            value={filters.contextMin || ''}
            placeholder="0"
            onChange={(e) => update('contextMin', Number(e.target.value) || 0)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="price-max">Max prompt $/1M</label>
          <input
            id="price-max"
            type="number"
            min={0}
            step={0.5}
            className="input"
            value={filters.priceMax || ''}
            placeholder="0 = any"
            onChange={(e) => update('priceMax', Number(e.target.value) || 0)}
          />
        </div>
      </div>
    </Glass>
  );
}