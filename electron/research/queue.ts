import type { DatabaseSync } from 'node:sqlite';
import { enqueue, getDb, queueSnapshot } from './db.js';
import { aaMetrics, artificialAnalysis, matchAaRecord, persistMetrics, providerFirst } from './fetchers.js';
import { getSecret } from './settings.js';
import { distillProfile, type RawEvidence } from './distill.js';

export interface ResearchProgress {
  running: boolean;
  pending: number;
  done: number;
  failed: number;
  current: string | null;
  tier: number | null;
}

export type ProgressListener = (p: ResearchProgress) => void;

const listeners = new Set<ProgressListener>();
let running = false;

export function onProgress(fn: ProgressListener): void {
  listeners.add(fn);
}

export function broadcast(p: ResearchProgress): void {
  for (const fn of listeners) fn(p);
}

/** Diff live catalog against the queue: enqueue any model not yet researched,
 *  or whose profile is missing a description (backfill after schema migration). */
export function syncCatalog(catalog: Array<{ id: string; name?: string; context_length?: number }>): number {
  const db = getDb();
  let added = 0;
  for (const m of catalog) {
    const row = db
      .prepare('SELECT rq.status, (mp.description IS NULL) AS missing_desc FROM research_queue rq LEFT JOIN model_profiles mp ON mp.id = rq.model_id WHERE rq.model_id = ?')
      .get(m.id) as { status?: string; missing_desc?: number } | undefined;
    if (!row || (row.status === 'done' && row.missing_desc === 1)) {
      enqueue(db, m.id, 1, 0);
      added += 1;
    }
  }
  return added;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Process the queue with bounded concurrency (default 8 parallel workers). */
export async function runQueue(progress: (p: ResearchProgress) => void = broadcast): Promise<void> {
  if (running) return;
  running = true;
  const db = getDb();
  const CONCURRENCY = 8;

  try {
    // Load AA snapshot once per run (daily TTL internally); unavailable → [] gracefully.
    let aa: Array<Record<string, unknown>> = [];
    try {
      aa = await artificialAnalysis(getSecret('aa_api_key'));
    } catch {
      aa = [];
    }

    async function processOne(modelId: string, tier: number): Promise<void> {
      try {
        const model = db
          .prepare('SELECT id, name, context_length, hugging_face_id, description, profile_json FROM model_profiles WHERE id = ?')
          .get(modelId) as { id: string; name: string | null; context_length: number | null; hugging_face_id: string | null; description: string | null; profile_json: string | null } | undefined;

        // Tier 1a: provider-first
        const provMetrics = await providerFirst(modelId, model?.hugging_face_id ?? null);
        persistMetrics(db, provMetrics);

        // Tier 1b: artificial analysis
        if (aa.length > 0 && model) {
          const rec = matchAaRecord(modelId, model.name ?? modelId, model.context_length, aa);
          if (rec) {
            const m = aaMetrics(modelId, rec);
            persistMetrics(db, m);
            // record alias so future lookups are instant
            const slug = String(rec.slug ?? rec.name ?? '');
            db.prepare(
              `INSERT OR IGNORE INTO model_aliases (canonical_id, source, source_id, confidence, resolved_at)
               VALUES (?, 'artificial-analysis', ?, 0.9, ?)`,
            ).run(modelId, slug, new Date().toISOString());
          }
        }

        // Tier 3: qualitative distillation (only when the user's Nous key is set)
        if (getSecret('nous_api_key') && model) {
          const metrics = db
            .prepare('SELECT metric, value FROM metric_observations WHERE model_id = ?')
            .all(modelId) as Array<{ metric: string; value: number }>;
          const evidence: RawEvidence = {
            description: model.description ?? undefined,
            metrics: Object.fromEntries(metrics.map((m) => [m.metric, m.value])),
          };
          const profile = await distillProfile(modelId, model.name ?? modelId, evidence);
          if (profile) {
            db.prepare('UPDATE model_profiles SET profile_json=?, researched_at=? WHERE id=?').run(
              JSON.stringify(profile),
              new Date().toISOString(),
              modelId,
            );
          }
        }

        db.prepare(`UPDATE research_queue SET status='done', updated_at=? WHERE model_id=?`).run(
          new Date().toISOString(),
          modelId,
        );
      } catch (e) {
        db.prepare(
          `UPDATE research_queue SET status='failed', attempts=attempts+1, updated_at=? WHERE model_id=?`,
        ).run(new Date().toISOString(), modelId);
        console.error('research failed', modelId, e);
      }
    }

    for (let pass = 0; pass < 200; pass++) {
      const snap = queueSnapshot(db);
      if (snap.pending === 0) break;
      const rows = db
        .prepare(
          `SELECT model_id, tier FROM research_queue
           WHERE status IN ('pending','fetching')
           ORDER BY priority DESC, queued_at ASC LIMIT ?`,
        )
        .all(CONCURRENCY) as Array<{ model_id: string; tier: number }>;
      if (rows.length === 0) break;

      for (const r of rows) {
        db.prepare(`UPDATE research_queue SET status='fetching', updated_at=? WHERE model_id=?`).run(
          new Date().toISOString(),
          r.model_id,
        );
      }
      progress({ ...snap, running: true, current: rows[0].model_id, tier: rows[0].tier });

      await Promise.all(rows.map((r) => processOne(r.model_id, r.tier)));
      await delay(200); // gentle pacing between batches

      const s2 = queueSnapshot(db);
      progress({ ...s2, running: true, current: null, tier: rows[0].tier });
    }
  } finally {
    running = false;
    const s = queueSnapshot(db);
    progress({ ...s, running: false, current: null, tier: null });
  }
}
