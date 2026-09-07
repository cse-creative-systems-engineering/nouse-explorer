import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

export interface ResearchProgress {
  running: boolean;
  pending: number;
  done: number;
  failed: number;
  current: string | null;
  tier: number | null;
}

export interface ResearchAxis {
  id: string;
  label: string;
  dir: 'desc' | 'asc';
  metric: string;
  count: number;
  pending: boolean;
}

contextBridge.exposeInMainWorld('nouse', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  research: {
    syncCatalog: (catalog: unknown[]) => ipcRenderer.invoke('research:sync-catalog', catalog) as Promise<{ added: number }>,
    start: () => ipcRenderer.invoke('research:start') as Promise<{ started: boolean }>,
    getMetrics: () => ipcRenderer.invoke('research:metrics') as Promise<Record<string, Record<string, number>>>,
    getAxes: () => ipcRenderer.invoke('research:axes') as Promise<ResearchAxis[]>,
    getProfile: (modelId: string) => ipcRenderer.invoke('research:profile', modelId) as Promise<{ profile: unknown; researched_at: string } | null>,
    getProfiled: () => ipcRenderer.invoke('research:profiled') as Promise<string[]>,
    getSources: () => ipcRenderer.invoke('research:sources') as Promise<Record<string, Record<string, string>>>,
    onProgress: (cb: (p: ResearchProgress) => void) => {
      const listener = (_e: IpcRendererEvent, p: ResearchProgress) => cb(p);
      ipcRenderer.on('research:progress', listener);
      return () => ipcRenderer.removeListener('research:progress', listener);
    },
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<AppSettings>,
    setSecret: (name: string, value: string) => ipcRenderer.invoke('settings:set-secret', name, value) as Promise<{ ok: boolean; view?: AppSettings }>,
    setDistiller: (model: string) => ipcRenderer.invoke('settings:set-distiller', model) as Promise<{ ok: boolean; view?: AppSettings }>,
  },
  alerts: {
    list: () => ipcRenderer.invoke('alerts:list') as Promise<Watch[]>,
    create: (w: Omit<Watch, 'id'>) => ipcRenderer.invoke('alerts:create', w) as Promise<Watch>,
    update: (id: string, patch: Partial<Omit<Watch, 'id'>>) => ipcRenderer.invoke('alerts:update', id, patch) as Promise<Watch[]>,
    remove: (id: string) => ipcRenderer.invoke('alerts:delete', id) as Promise<Watch[]>,
    history: () => ipcRenderer.invoke('alerts:history') as Promise<AlertRecord[]>,
    ack: () => ipcRenderer.invoke('alerts:ack') as Promise<AlertRecord[]>,
    checkNow: () => ipcRenderer.invoke('alerts:check-now') as Promise<AlertRecord[]>,
    setCatalog: (catalog: unknown[]) => ipcRenderer.invoke('alerts:set-catalog', catalog) as Promise<{ ok: boolean }>,
    onFired: (cb: (alerts: AlertRecord[]) => void) => {
      const listener = (_e: IpcRendererEvent, alerts: AlertRecord[]) => cb(alerts);
      ipcRenderer.on('alerts:fired', listener);
      return () => ipcRenderer.removeListener('alerts:fired', listener);
    },
  },
});

export interface Watch {
  id: string;
  name: string;
  model_ids: string[];
  provider: string | null;
  conditions: {
    price_drop_percent?: number;
    price_increase_percent?: number;
    discount_appears?: boolean;
    discount_disappears?: boolean;
    new_model?: boolean;
    removed_model?: boolean;
  };
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

export interface AppSettings {
  nousApiKeySet: boolean;
  nousApiKeyMasked: string | null;
  aaApiKeySet: boolean;
  aaApiKeyMasked: string | null;
  distillerModel: string;
  encryptionAvailable: boolean;
}
