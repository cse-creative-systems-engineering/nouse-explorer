import { Dropdown, type DropdownOption } from './Dropdown';
import type { SortOption, VariantOption } from '../lib/filterbar';

interface FilterBarProps {
  total: number;
  query: string;
  onQuery: (q: string) => void;
  sort: string;
  onSort: (s: string) => void;
  sortOptions: SortOption[];
  variant: string;
  onVariant: (v: string) => void;
  variantOptions: VariantOption[];
  searchRef: React.RefObject<HTMLInputElement>;
}

/**
 * One compact control: search + sort + variant fused into a single glass bar.
 * The sort dropdown carries the full portal-style list (always present items
 * + researched axes appended; pending items show "…" until data lands). The
 * variant dropdown applies a secondary filter on top of the sort.
 */
export function FilterBar({
  total,
  query,
  onQuery,
  sort,
  onSort,
  sortOptions,
  variant,
  onVariant,
  variantOptions,
  searchRef,
}: FilterBarProps) {
  const sortDropdownOptions: DropdownOption[] = sortOptions.map((o) => ({
    value: o.id,
    label: o.label,
    pending: o.pending,
  }));
  const variantDropdownOptions: DropdownOption[] = variantOptions.map((o) => ({
    value: o.id,
    label: o.inferred ? `${o.label} ✦` : o.label,
  }));

  return (
    <div className="filterbar glass-bar">
      <div className="cmdbar filterbar-search">
        <span className="ic">⌕</span>
        <input
          ref={searchRef}
          placeholder={`Search ${total} models — name, provider…`}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          title="Search models by name, ID, or provider (⌘K)"
        />
        {query && (
          <button
            type="button"
            className="search-clear"
            aria-label="Clear search"
            title="Clear search"
            onClick={() => {
              onQuery('');
              searchRef.current?.focus();
            }}
          >
            ✕
          </button>
        )}
        <span className="kbd" title="Focus search (⌘K / Ctrl+K)">⌘K</span>
      </div>

      <div className="filterbar-sep" aria-hidden="true" />

      <div className="filterbar-dd" title="Choose how models are ranked — hover an item for details">
        <span className="filterbar-dd-label">Sort</span>
        <Dropdown
          value={sort}
          onChange={onSort}
          options={sortDropdownOptions}
          placeholder="Sort…"
          width={230}
        />
      </div>

      <div className="filterbar-sep" aria-hidden="true" />

      <div className="filterbar-dd" title="Narrow the sorted list — variants inferred from researched data are marked ✦">
        <span className="filterbar-dd-label">Variant</span>
        <Dropdown
          value={variant}
          onChange={onVariant}
          options={variantDropdownOptions}
          placeholder="All models"
          width={190}
        />
      </div>
    </div>
  );
}
