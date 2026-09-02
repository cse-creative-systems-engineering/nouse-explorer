import { Notification } from 'electron';
import { getDb } from './db.js';
import type { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

export interface WatchConditions {
  price_drop_percent?: number;      // alert if price drops ≥ X% vs last seen
  price_increase_percent?: number;  // alert if price rises ≥ X% vs last seen
  discount_appears?: boolean;       // full price → discounted
  discount_disappears?: boolean;    // discounted → full price
  new_model?: boolean;              // new model appears in scope
  removed_model?: boolean;          // tracked model disappears
}

export interface Watch {
  id: string;
  name: string;
  model_ids: string[];
  provider: string | null;
  conditions: WatchConditions;
  notify_desktop: boolean;
  active: boolean;
}

export interface AlertRecord {
  watch_id: string;
  model_id: string;
  model_name: string;
  type: string;
  message: string;
  old_value?: string;
  new_value?: string;
  timestamp: string;
}

interface LastPrice {
  prompt: number | null;
  completion: number | null;
  prompt_baseline?: number | null; // list price at last check (discount baseline)
}

export function listWatches(): Watch[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM watches ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name ?? 'Watch'),
    model_ids: JSON.parse(String(r.model_ids ?? '[]')) as string[],
    provider: r.provider ? String(r.provider) : null,
    conditions: JSON.parse(String(r.conditions ?? '{}')) as WatchConditions,
    notify_desktop: Number(r.notify_desktop) === 1,
    active: Number(r.active) === 1,
  }));
}

export function createWatch(w: Omit<Watch, 'id'>): Watch {
  const db = getDb();
  const watch: Watch = { ...w, id: randomUUID() };
  db.prepare(
    `INSERT INTO watches (id, name, model_ids, provider, conditions, notify_desktop, active, last_prices, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, '{}', ?)`,
  ).run(
    watch.id,
    watch.name,
    JSON.stringify(watch.model_ids),
    watch.provider,
    JSON.stringify(watch.conditions),
    watch.notify_desktop ? 1 : 0,
    watch.active ? 1 : 0,
    new Date().toISOString(),
  );
  return watch;
}

export function deleteWatch(id: string): void {
  getDb().prepare('DELETE FROM watches WHERE id = ?').run(id);
}

export function updateWatch(id: string, patch: Partial<Omit<Watch, 'id'>>): void {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM watches WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) return;
  const merged: Watch = {
    id,
    name: patch.name ?? String(existing.name ?? 'Watch'),
    model_ids: patch.model_ids ?? JSON.parse(String(existing.model_ids ?? '[]')),
    provider: patch.provider !== undefined ? patch.provider : (existing.provider ? String(existing.provider) : null),
    conditions: patch.conditions ?? JSON.parse(String(existing.conditions ?? '{}')),
    notify_desktop: patch.notify_desktop ?? Number(existing.notify_desktop) === 1,
    active: patch.active ?? Number(existing.active) === 1,
  };
  db.prepare(
    `UPDATE watches SET name=?, model_ids=?, provider=?, conditions=?, notify_desktop=?, active=? WHERE id=?`,
  ).run(
    merged.name,
    JSON.stringify(merged.model_ids),
    merged.provider,
    JSON.stringify(merged.conditions),
    merged.notify_desktop ? 1 : 0,
    merged.active ? 1 : 0,
    id,
  );
}

export function alertHistory(limit = 50): AlertRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM alert_history ORDER BY id DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    watch_id: String(r.watch_id),
    model_id: String(r.model_id),
    model_name: String(r.model_name),
    type: String(r.type),
    message: String(r.message),
    old_value: r.old_value ? String(r.old_value) : undefined,
    new_value: r.new_value ? String(r.new_value) : undefined,
    timestamp: String(r.timestamp),
  }));
}

export function acknowledgeAllAlerts(): void {
  getDb().prepare('UPDATE alert_history SET acknowledged = 1').run();
}

function recordAlert(db: DatabaseSync, a: AlertRecord): AlertRecord {
  db.prepare(
    `INSERT INTO alert_history (watch_id, model_id, model_name, type, message, old_value, new_value, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(a.watch_id, a.model_id, a.model_name, a.type, a.message, a.old_value ?? null, a.new_value ?? null, a.timestamp);
  return a;
}

function pricePerMillion(s: string | undefined): number | null {
  if (s === undefined || s === null || s === '') return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n * 1_000_000 : null;
}

interface CatalogEntry {
  id: string;
  name: string;
  pricing: {
    prompt?: string;
    completion?: string;
    original?: { prompt?: string; completion?: string };
  };
}

/**
 * Run all active watches against the current catalog. Compares each watched
 * model's current price against its last-seen price (stored per watch),
 * fires alerts for configured conditions, and updates the stored baseline.
 * Fires native desktop notifications when notify_desktop is set.
 */
export function checkWatches(catalog: CatalogEntry[]): AlertRecord[] {
  const db = getDb();
  const fired: AlertRecord[] = [];
  const watches = listWatches().filter((w) => w.active);
  const byId = new Map(catalog.map((m) => [m.id, m]));

  for (const watch of watches) {
    const scoped = watch.provider
      ? catalog.filter((m) => m.id.startsWith(`${watch.provider}/`))
      : watch.model_ids.map((id) => byId.get(id)).filter((m): m is CatalogEntry => !!m);
    if (scoped.length === 0) continue;

    const lastPrices = JSON.parse(
      String(db.prepare('SELECT last_prices FROM watches WHERE id = ?').get(watch.id)?.last_prices ?? '{}'),
    ) as Record<string, LastPrice>;

    const nextPrices: Record<string, LastPrice> = {};
    const cond = watch.conditions;

    for (const m of scoped) {
      const curPrompt = pricePerMillion(m.pricing.prompt);
      const curCompletion = pricePerMillion(m.pricing.completion);
      const baseline = m.pricing.original ? pricePerMillion(m.pricing.original.prompt) : null;
      const hasDiscount = baseline !== null && curPrompt !== null && curPrompt < baseline;
      const prev = lastPrices[m.id];

      nextPrices[m.id] = { prompt: curPrompt, completion: curCompletion, prompt_baseline: baseline };

      // price-change detection
      if (prev && prev.prompt !== null && curPrompt !== null) {
        const pctChange = ((curPrompt - prev.prompt) / prev.prompt) * 100;
        if (cond.price_drop_percent && pctChange <= -cond.price_drop_percent) {
          fired.push(recordAlert(db, {
            watch_id: watch.id, model_id: m.id, model_name: m.name,
            type: 'price_drop', message: `${m.name}: input price dropped ${pctChange.toFixed(1)}%`,
            old_value: `$${prev.prompt.toFixed(4)}/1M`, new_value: `$${curPrompt.toFixed(4)}/1M`,
            timestamp: new Date().toISOString(),
          }));
        }
        if (cond.price_increase_percent && pctChange >= cond.price_increase_percent) {
          fired.push(recordAlert(db, {
            watch_id: watch.id, model_id: m.id, model_name: m.name,
            type: 'price_increase', message: `${m.name}: input price rose ${pctChange.toFixed(1)}%`,
            old_value: `$${prev.prompt.toFixed(4)}/1M`, new_value: `$${curPrompt.toFixed(4)}/1M`,
            timestamp: new Date().toISOString(),
          }));
        }
      }

      // discount transitions (baseline stored per model)
      const wasDiscounted =
        prev &&
        typeof prev.prompt_baseline === 'number' &&
        typeof prev.prompt === 'number' &&
        prev.prompt < prev.prompt_baseline;
      if (cond.discount_appears && hasDiscount && !wasDiscounted) {
        fired.push(recordAlert(db, {
          watch_id: watch.id, model_id: m.id, model_name: m.name,
          type: 'discount_appeared', message: `${m.name}: discount appeared`,
          new_value: curPrompt !== null ? `$${curPrompt.toFixed(4)}/1M` : undefined,
          timestamp: new Date().toISOString(),
        }));
      }
      if (cond.discount_disappears && !hasDiscount && wasDiscounted) {
        fired.push(recordAlert(db, {
          watch_id: watch.id, model_id: m.id, model_name: m.name,
          type: 'discount_disappeared', message: `${m.name}: discount ended`,
          new_value: curPrompt !== null ? `$${curPrompt.toFixed(4)}/1M` : undefined,
          timestamp: new Date().toISOString(),
        }));
      }
    }

    // removed-model detection: previously tracked ids no longer in catalog
    if (cond.removed_model) {
      for (const id of Object.keys(lastPrices)) {
        if (!byId.has(id)) {
          fired.push(recordAlert(db, {
            watch_id: watch.id, model_id: id, model_name: id,
            type: 'removed_model', message: `${id}: removed from catalog`,
            timestamp: new Date().toISOString(),
          }));
        }
      }
    }

    // new-model detection: models in scope not previously tracked
    if (cond.new_model) {
      for (const m of scoped) {
        if (!lastPrices[m.id]) {
          const p = pricePerMillion(m.pricing.prompt);
          fired.push(recordAlert(db, {
            watch_id: watch.id, model_id: m.id, model_name: m.name,
            type: 'new_model', message: `New model: ${m.name}`,
            new_value: p !== null ? `$${p.toFixed(4)}/1M` : undefined,
            timestamp: new Date().toISOString(),
          }));
        }
      }
    }

    db.prepare('UPDATE watches SET last_prices=?, check_count=check_count+1, last_alert_at=? WHERE id=?').run(
      JSON.stringify(nextPrices),
      fired.length ? new Date().toISOString() : null,
      watch.id,
    );
  }

  // Desktop notifications (one summary notification per check, not per alert)
  if (fired.length > 0 && Notification.isSupported()) {
    const first = fired[0];
    new Notification({
      title: 'Nouse Explorer — alert',
      body: fired.length === 1 ? first.message : `${fired.length} alerts fired (${first.message.slice(0, 60)}…)`,
    }).show();
  }

  return fired;
}
