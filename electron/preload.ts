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
});

export interface AppSettings {
  nousApiKeySet: boolean;
  nousApiKeyMasked: string | null;
  aaApiKeySet: boolean;
  aaApiKeyMasked: string | null;
  distillerModel: string;
  encryptionAvailable: boolean;
}
