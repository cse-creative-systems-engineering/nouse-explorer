# Nouse Explorer

Glassmorphic desktop explorer for the full Nous Portal model catalog — live
pricing, discounts, time-based overrides, and benchmark scores for 377 models.

## Status

Phase 1 (MVP) in progress — see
`~/.hermes/docs/online/nous-model-explorer-plan.md` for the full plan,
architecture decision (Electron + TypeScript), and roadmap.

- React 18 + Vite + TypeScript + nanostores UI (built)
- Data layer: `inference-api.nousresearch.com/v1/models` (public, no auth),
  1h-TTL cache, UTC time-based pricing override resolution, discount math
- Electron desktop shell: pending

## Dev

```bash
npm install
npm run dev       # vite dev server
npm run build     # tsc -b && vite build
```
