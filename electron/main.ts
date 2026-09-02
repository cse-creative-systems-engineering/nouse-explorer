import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, upsertProfile } from './research/db.js';
import { onProgress, runQueue, syncCatalog } from './research/queue.js';
import { getSettingsView, setDistillerModel, setSecret } from './research/settings.js';

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
    icon: path.join(__dirname, '../build/icon.png'),
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
  const rows = db
    .prepare(
      `SELECT model_id, metric, value FROM metric_observations
       WHERE metric IN ('median_output_tokens_per_second','median_time_to_first_token_seconds','hf_downloads','hf_likes','scicode','livecodebench','mmlu_pro')`,
    )
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
    { metric: 'median_output_tokens_per_second', id: 'speed', label: 'Speed', dir: 'desc' },
    { metric: 'median_time_to_first_token_seconds', id: 'latency', label: 'Low latency', dir: 'asc' },
    { metric: 'scicode', id: 'scicode', label: 'SciCode', dir: 'desc' },
    { metric: 'livecodebench', id: 'livecodebench', label: 'LiveCodeBench', dir: 'desc' },
    { metric: 'mmlu_pro', id: 'mmlu', label: 'MMLU-Pro', dir: 'desc' },
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
  return { ok: true, view: getSettingsView() };
});

ipcMain.handle('settings:set-distiller', (_e, model: string) => {
  if (typeof model !== 'string' || !model.includes('/')) return { ok: false };
  setDistillerModel(model);
  return { ok: true, view: getSettingsView() };
});

// Broadcast progress to the renderer
onProgress((p) => {
  win?.webContents.send('research:progress', p);
});

app.whenReady().then(() => {
  app.setName('Nouse Explorer');
  // Proper per-app data dir (defaults to 'Electron' otherwise)
  app.setPath('userData', path.join(app.getPath('appData'), 'nouse-explorer'));
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
