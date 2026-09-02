import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

let db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (db) return db;
  const dir = path.join(app.getPath('userData'), 'research');
  mkdirSync(dir, { recursive: true });
  db = new DatabaseSync(path.join(dir, 'nouse.db'));
  migrate(db);
  return db;
}

function migrate(d: DatabaseSync): void {
  d.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS model_profiles (
      id TEXT PRIMARY KEY,
      name TEXT,
      provider TEXT,
      context_length INTEGER,
      hugging_face_id TEXT,
      description TEXT,
      researched_at TEXT,
      research_version INTEGER DEFAULT 1,
      profile_json TEXT
    );

    CREATE TABLE IF NOT EXISTS model_aliases (
      canonical_id TEXT NOT NULL,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL,
      confidence REAL,
      resolved_at TEXT,
      PRIMARY KEY (canonical_id, source, source_id)
    );

    CREATE TABLE IF NOT EXISTS raw_sources (
      url TEXT PRIMARY KEY,
      fetched_at TEXT,
      content_hash TEXT,
      kind TEXT
    );

    CREATE TABLE IF NOT EXISTS metric_observations (
      model_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      value REAL,
      source_url TEXT,
      fetched_at TEXT,
      method TEXT,
      PRIMARY KEY (model_id, metric, source_url)
    );

    CREATE TABLE IF NOT EXISTS research_queue (
      model_id TEXT PRIMARY KEY,
      priority INTEGER DEFAULT 0,
      tier INTEGER DEFAULT 1,
      status TEXT DEFAULT 'pending',      -- pending | fetching | distilled | done | failed
      attempts INTEGER DEFAULT 0,
      queued_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS watches (
      id TEXT PRIMARY KEY,
      name TEXT,
      model_ids TEXT,              -- JSON array of specific model ids
      provider TEXT,               -- watch a whole provider
      conditions TEXT,             -- JSON: { price_drop_percent, price_increase_percent,
                                   --          discount_appears, discount_disappears,
                                   --          new_model, removed_model }
      notify_desktop INTEGER DEFAULT 1,
      active INTEGER DEFAULT 1,
      last_prices TEXT,            -- JSON: { modelId: {prompt, completion} } tracked prices
      last_alert_at TEXT,
      check_count INTEGER DEFAULT 0,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS alert_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      watch_id TEXT,
      model_id TEXT,
      model_name TEXT,
      type TEXT,                   -- price_drop | price_increase | discount_appeared |
                                   -- discount_disappeared | new_model | removed_model
      message TEXT,
      old_value TEXT,
      new_value TEXT,
      timestamp TEXT,
      acknowledged INTEGER DEFAULT 0
    );
  `);

  // Column migrations for pre-existing DBs (CREATE TABLE IF NOT EXISTS does
  // not add columns to existing tables).
  const cols = new Set(
    (d.prepare(`PRAGMA table_info(model_profiles)`).all() as Array<{ name: string }>).map((c) => c.name),
  );
  if (!cols.has('description')) {
    d.exec(`ALTER TABLE model_profiles ADD COLUMN description TEXT`);
  }
}

export function upsertProfile(d: DatabaseSync, p: {
  id: string; name?: string; provider?: string; context_length?: number; hugging_face_id?: string | null;
  description?: string | null; profile_json?: string | null;
}): void {
  d.prepare(`
    INSERT INTO model_profiles (id, name, provider, context_length, hugging_face_id, description, researched_at, profile_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, provider=excluded.provider, context_length=excluded.context_length,
      hugging_face_id=excluded.hugging_face_id, description=excluded.description,
      researched_at=excluded.researched_at, profile_json=excluded.profile_json
  `).run(
    p.id, p.name ?? null, p.provider ?? null, p.context_length ?? null, p.hugging_face_id ?? null,
    p.description ?? null, new Date().toISOString(), p.profile_json ?? null,
  );
}

export function recordMetric(d: DatabaseSync, m: {
  model_id: string; metric: string; value: number; source_url: string; method: string;
}): void {
  d.prepare(`
    INSERT OR REPLACE INTO metric_observations (model_id, metric, value, source_url, fetched_at, method)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(m.model_id, m.metric, m.value, m.source_url, new Date().toISOString(), m.method);
}

export function enqueue(d: DatabaseSync, modelId: string, tier = 1, priority = 0): void {
  d.prepare(`
    INSERT OR IGNORE INTO research_queue (model_id, priority, tier, status, queued_at, updated_at)
    VALUES (?, ?, ?, 'pending', ?, ?)
  `).run(modelId, priority, tier, new Date().toISOString(), new Date().toISOString());
}

export function queueSnapshot(d: DatabaseSync): { pending: number; done: number; failed: number } {
  const row = d.prepare(`
    SELECT
      SUM(CASE WHEN status IN ('pending','fetching','distilled') THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status='done' THEN 1 ELSE 0 END) AS done,
      SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed
    FROM research_queue
  `).get() as { pending: number | null; done: number | null; failed: number | null };
  return { pending: row.pending ?? 0, done: row.done ?? 0, failed: row.failed ?? 0 };
}
