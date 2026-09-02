# Build: Nous Model Explorer — Phase 1 MVP

Create a Vite + React + TypeScript app in this directory. Glassmorphic dark theme, jaw-dropping aesthetics.

## Data source (verified live)
GET https://inference-api.nousresearch.com/v1/models  — public, NO auth.
Response: { data: [ ... ~377 models ... ] } OpenAI-compatible.
Each model: id, name, description, context_length, architecture {modality, input_modalities, output_modalities, tokenizer, instruct_type}, pricing {prompt, completion, web_search, input_cache_read, input_cache_write, input_cache_write_1h, original{prompt,completion,...}, overrides?}, top_provider {context_length, max_completion_tokens, is_moderated}, benchmarks {design_arena:[{arena,category,elo,win_rate,rank}], artificial_analysis:{intelligence_index,coding_index,agentic_index}} (present on ~208 models).
- Prices are PER-TOKEN USD strings ("0.0000080000" = $8.00 per 1M tokens). Store as-is; convert x1e6 for display.
- `original` = pre-discount price; compute discountPercent = (1 - current/original)*100.
- `overrides` = array of time-based pricing rules (utc_days[], utc_start/utc_end minutes-from-midnight-UTC, prompt, completion). Resolve the EFFECTIVE price at fetch time using current UTC time. Badge models with time-based pricing.
- id ending ":batch" = batch variant; ":free" = free variant; prompt/completion "0" = free model.

## App requirements (Phase 1)
1. Fetch models on load; localStorage cache with 1h TTL + manual refresh button + auto-refresh toggle (30m default, configurable).
2. Main explorer: table view AND card view (toggle), sortable by: name, provider, input price/1M, output price/1M, discount %, context length, coding index, intelligence index, agentic index. Sort via glass dropdown or clickable headers with animated chevrons.
3. Filters (glass chips/sidebar): free only, multimodal only, has discount, has benchmarks, no benchmarks, batch variants, search text across id/name/description, provider dropdown, modality, context min, price max/1M.
4. Model detail modal: full pricing breakdown (all fields, per-token + per-1M), discount %, benchmarks with source tags ("embedded" vs external — external fetching is out of scope for MVP, just show "No benchmark data" badge with dashed border for the ~168 models lacking benchmarks), architecture, reasoning support, overrides tooltip.
5. Stats header: total models, free count, discounted count, benchmarked count, last refresh time.
6. Show per-token AND per-1M prices (per-1M is primary).

## Design (non-negotiable — user wants jaw-dropping glassmorphic dark)
- Frosted glass panels (backdrop-filter blur 24px, rgba(255,255,255,0.04) bg, 1px rgba(255,255,255,0.08) borders, 16px radius) over a dark #0a0a0f base with subtle animated gradient blobs.
- Accent: Nous gold #f5a623 with glow rgba(245,166,35,0.3). Semantic: #34d399 success, #fbbf24 warning, #f87171 danger, #60a5fa info.
- Animations: staggered card fade-in on load (50ms/card), hover lift translateY(-4px) + glow, skeleton shimmer while loading, modal scale 0.95->1 entrance, animated gradient discount badges, respects prefers-reduced-motion.
- Custom glass controls: toggle switch, search input, filter chips, dropdowns, tooltips.
- WCAG AA text contrast; keyboard nav (Enter opens detail, Escape closes).
- Use the plan's CSS design tokens verbatim as CSS custom properties.

## Structure
src/lib/{types.ts (ModelEntry), api.ts (fetch+cache+override-resolution), pricing.ts (discount math, per-1M conversion), store.ts (nanostores), filters.ts}
src/components/{ModelExplorer, ModelCard, ModelTable, ModelDetail, Filters, StatsHeader, RefreshControl, DiscountBadge, BenchmarkMissing, Glass bits}
`npm run build` must pass (tsc + vite build). Run `npm run build` and fix errors until green.
