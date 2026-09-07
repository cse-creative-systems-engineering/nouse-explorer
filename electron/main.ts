import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, upsertProfile, enqueue } from './research/db.js';
import { onProgress, runQueue, syncCatalog } from './research/queue.js';
import { getSettingsView, setDistillerModel, setSecret, getSecret } from './research/settings.js';
import { invalidateAaCache } from './research/fetchers.js';
import {
  alertHistory, acknowledgeAllAlerts, checkWatches, createWatch, deleteWatch,
  listWatches, updateWatch, type Watch,
} from './research/alerts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const DIST = path.join(__dirname, '../../dist');

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    frame: false, // custom glass titlebar in the renderer
    backgroundColor: '#0a0a20',
    show: false,
    title: 'Nouse Explorer',
    icon: path.join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win?.show());

  // Open external links in the default browser, never in-app
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    void win.loadFile(path.join(DIST, 'index.html'));
  }

  win.on('closed', () => {
    win = null;
  });
}

// --- window controls IPC (custom titlebar buttons) ---
ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:maximize', () => {
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});
ipcMain.on('window:close', () => win?.close());

// --- research engine IPC ---
ipcMain.handle('research:sync-catalog', (_e, catalog: Array<Record<string, unknown>>) => {
  const db = getDb();
  for (const m of catalog) {
    const id = String(m.id ?? '');
    if (!id) continue;
    const prov = id.split('/')[0] ?? '';
    upsertProfile(db, {
      id,
      name: m.name ? String(m.name) : undefined,
      provider: prov,
      context_length: typeof m.context_length === 'number' ? m.context_length : undefined,
      hugging_face_id: typeof m.hugging_face_id === 'string' ? m.hugging_face_id : null,
      description: typeof m.description === 'string' ? m.description : null,
    });
  }
  const added = syncCatalog(catalog as Array<{ id: string; name?: string; context_length?: number }>);
  return { added };
});

ipcMain.handle('research:start', async () => {
  // Kick off in the background; progress flows over 'research:progress'
  void runQueue();
  return { started: true };
});

ipcMain.handle('research:status', () => {
  return { running: false }; // live state flows via progress events
});

ipcMain.handle('research:metrics', () => {
  const db = getDb();
  // Expose every researched metric — the UI derives columns/axes from what
  // actually has data, so filtering here hides research from the whole app.
  const rows = db
    .prepare(`SELECT model_id, metric, value FROM metric_observations`)
    .all() as Array<{ model_id: string; metric: string; value: number }>;
  const byModel: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    (byModel[r.model_id] ??= {})[r.metric] = r.value;
  }
  return byModel;
});

/**
 * Research-driven axes (user directive 2026-09-02): the chips a user can
 * filter/rank by are DERIVED from what the research engine has actually
 * gathered — a metric with data becomes an available axis; a metric with
 * zero coverage is returned as pending so the UI can show a disabled chip
 * ("waiting for research") that lights up when the batch lands.
 */
ipcMain.handle('research:model-metrics', (_e, modelId: string) => {
  const db = getDb();
  return db
    .prepare(`SELECT metric, value, method, source_url FROM metric_observations WHERE model_id = ?`)
    .all(modelId) as Array<{ metric: string; value: number; method: string; source_url: string }>;
});

ipcMain.handle('research:sources', () => {
  const db = getDb();
  const rows = db
    .prepare(`SELECT model_id, metric, method FROM metric_observations`)
    .all() as Array<{ model_id: string; metric: string; method: string }>;
  const byModel: Record<string, Record<string, string>> = {};
  for (const r of rows) {
    (byModel[r.model_id] ??= {})[r.metric] = r.method;
  }
  return byModel;
});

ipcMain.handle('research:axes', () => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT metric, COUNT(DISTINCT model_id) AS n FROM metric_observations GROUP BY metric`,
    )
    .all() as Array<{ metric: string; n: number }>;
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.metric] = r.n;

  const AXIS_DEFS: Array<{ metric: string; id: string; label: string; dir: 'desc' | 'asc' }> = [
    { metric: 'hf_downloads', id: 'popular', label: 'Popular', dir: 'desc' },
    { metric: 'hf_likes', id: 'liked', label: 'Most liked', dir: 'desc' },
    { metric: 'median_output_tokens_per_second', id: 'speed', label: 'Speed', dir: 'desc' },
    { metric: 'median_time_to_first_token_seconds', id: 'latency', label: 'Low latency', dir: 'asc' },
    { metric: 'artificial_analysis_coding_index', id: 'aa_coding', label: 'AA Coding', dir: 'desc' },
    { metric: 'artificial_analysis_intelligence_index', id: 'aa_intelligence', label: 'AA Intelligence', dir: 'desc' },
    { metric: 'artificial_analysis_math_index', id: 'aa_math', label: 'AA Math', dir: 'desc' },
    { metric: 'scicode', id: 'scicode', label: 'SciCode', dir: 'desc' },
    { metric: 'livecodebench', id: 'livecodebench', label: 'LiveCodeBench', dir: 'desc' },
    { metric: 'mmlu_pro', id: 'mmlu', label: 'MMLU-Pro', dir: 'desc' },
    { metric: 'gpqa', id: 'gpqa', label: 'GPQA', dir: 'desc' },
    { metric: 'aime', id: 'aime', label: 'AIME', dir: 'desc' },
  ];

  return AXIS_DEFS.map((a) => {
    const n = counts[a.metric] ?? 0;
    return { id: a.id, label: a.label, dir: a.dir, metric: a.metric, count: n, pending: n === 0 };
  });
});

// --- settings IPC ---
ipcMain.handle('settings:get', () => getSettingsView());

ipcMain.handle('settings:set-secret', (_e, name: string, value: string) => {
  if (typeof name !== 'string' || typeof value !== 'string') return { ok: false };
  if (!['nous_api_key', 'aa_api_key'].includes(name)) return { ok: false };
  setSecret(name, value);

  // Re-enqueue work that was previously skipped for lack of a key, then
  // restart the queue so the new capability actually gets applied:
  // - Nous key → distill profiles for models that have none yet
  // - AA key  → fetch AA metrics (speed/latency/benchmarks) for models
  //             that were marked done before the key existed
  const db = getDb();
  if (name === 'nous_api_key') {
    const rows = db
      .prepare(`SELECT id FROM model_profiles WHERE profile_json IS NULL OR profile_json = ''`)
      .all() as Array<{ id: string }>;
    for (const r of rows) enqueue(db, r.id, 3, 1); // tier 3, priority
  } else if (name === 'aa_api_key') {
    // Drop the cached 401-empty AA snapshot so the queue refetches with the key
    invalidateAaCache();
    const rows = db
      .prepare(
        `SELECT id FROM model_profiles
         WHERE id NOT IN (
           SELECT model_id FROM metric_observations
           WHERE metric = 'median_output_tokens_per_second'
         )`,
      )
      .all() as Array<{ id: string }>;
    for (const r of rows) enqueue(db, r.id, 1, 0);
  }
  void runQueue();
  return { ok: true, view: getSettingsView() };
});

ipcMain.handle('settings:set-distiller', (_e, model: string) => {
  if (typeof model !== 'string' || !model.includes('/')) return { ok: false };
  setDistillerModel(model);
  return { ok: true, view: getSettingsView() };
});

ipcMain.handle('research:profile', (_e, modelId: string) => {
  const db = getDb();
  const row = db.prepare('SELECT profile_json, researched_at FROM model_profiles WHERE id = ?').get(modelId) as
    | { profile_json: string | null; researched_at: string | null }
    | undefined;
  if (!row?.profile_json) return null;
  try {
    return { profile: JSON.parse(row.profile_json), researched_at: row.researched_at };
  } catch {
    return null;
  }
});

ipcMain.handle('research:profiled', () => {
  const db = getDb();
  const rows = db
    .prepare(`SELECT id FROM model_profiles WHERE profile_json IS NOT NULL AND profile_json != ''`)
    .all() as Array<{ id: string }>;
  return rows.map((r) => r.id);
});

// --- alerts IPC ---
ipcMain.handle('alerts:list', () => listWatches());
ipcMain.handle('alerts:create', (_e, w: Omit<Watch, 'id'>) => createWatch(w));
ipcMain.handle('alerts:update', (_e, id: string, patch: Partial<Omit<Watch, 'id'>>) => {
  updateWatch(id, patch);
  return listWatches();
});
ipcMain.handle('alerts:delete', (_e, id: string) => {
  deleteWatch(id);
  return listWatches();
});
ipcMain.handle('alerts:history', () => alertHistory(100));
ipcMain.handle('alerts:ack', () => {
  acknowledgeAllAlerts();
  return alertHistory(100);
});
ipcMain.handle('alerts:check-now', async () => {
  const catalog = await fetchCatalogForAlerts();
  const fired = checkWatches(catalog);
  if (fired.length > 0) {
    win?.webContents.send('alerts:fired', fired);
  }
  return fired;
});

// The renderer sends the latest catalog snapshot so the alert engine can
// diff against it without a second fetch.
let alertCatalog: Array<{ id: string; name: string; pricing: { prompt?: string; completion?: string; original?: { prompt?: string; completion?: string } } }> = [];
ipcMain.handle('alerts:set-catalog', (_e, catalog: typeof alertCatalog) => {
  alertCatalog = catalog ?? [];
  return { ok: true };
});

async function fetchCatalogForAlerts() {
  if (alertCatalog.length > 0) return alertCatalog;
  try {
    const res = await fetch('https://inference-api.nousresearch.com/v1/models', {
      headers: { 'User-Agent': 'NouseExplorer/0.1' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as { data?: Array<{ id?: string; name?: string; pricing?: { prompt?: string; completion?: string; original?: { prompt?: string } } }> };
    return (j.data ?? []).map((m) => ({
      id: m.id ?? '',
      name: m.name ?? m.id ?? '',
      pricing: {
        prompt: typeof m.pricing?.prompt === 'string' ? m.pricing.prompt : undefined,
        completion: typeof m.pricing?.completion === 'string' ? m.pricing.completion : undefined,
        original: typeof m.pricing?.original === 'object' && m.pricing.original
          ? { prompt: m.pricing.original.prompt }
          : undefined,
      },
    }));
  } catch {
    return [];
  }
}

// Background alert scheduler — every 30 minutes, plus a check shortly after launch.
let alertsTimer: ReturnType<typeof setInterval> | null = null;
async function scheduledAlertCheck() {
  const catalog = await fetchCatalogForAlerts();
  if (catalog.length === 0) return;
  const fired = checkWatches(catalog);
  if (fired.length > 0) {
    win?.webContents.send('alerts:fired', fired);
  }
}
function startAlertScheduler() {
  if (alertsTimer) return;
  setTimeout(() => void scheduledAlertCheck(), 45_000);
  alertsTimer = setInterval(() => void scheduledAlertCheck(), 30 * 60_000);
}

// Broadcast progress to the renderer
onProgress((p) => {
  win?.webContents.send('research:progress', p);
});

// On launch: if keys are already stored, catch up on work that was skipped
// before they existed (distillation + AA metrics for models marked done).
function catchUpResearch(): void {
  const db = getDb();
  const nousKey = getSecret('nous_api_key');
  const aaKey = getSecret('aa_api_key');
  if (!nousKey && !aaKey) return;

  if (nousKey) {
    const rows = db
      .prepare(`SELECT id FROM model_profiles WHERE profile_json IS NULL OR profile_json = ''`)
      .all() as Array<{ id: string }>;
    for (const r of rows) enqueue(db, r.id, 3, 1);
  }
  if (aaKey) {
    const rows = db
      .prepare(
        `SELECT id FROM model_profiles
         WHERE id NOT IN (
           SELECT model_id FROM metric_observations
           WHERE metric = 'median_output_tokens_per_second'
         )`,
      )
      .all() as Array<{ id: string }>;
    for (const r of rows) enqueue(db, r.id, 1, 0);
  }
  void runQueue();
}

app.whenReady().then(() => {
  app.setName('Nouse Explorer');
  // Proper per-app data dir (defaults to 'Electron' otherwise)
  app.setPath('userData', path.join(app.getPath('appData'), 'nouse-explorer'));
  createWindow();
  startAlertScheduler();
  setTimeout(catchUpResearch, 5000); // after catalog sync settles
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
