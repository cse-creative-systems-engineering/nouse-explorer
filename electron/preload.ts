import { contextBridge, ipcRenderer } from 'electron';

export interface ResearchProgress {
  running: boolean;
  pending: number;
  done: number;
  failed: number;
  current: string | null;
  tier: number | null;
}

contextBridge.exposeInMainWorld('nouse', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  research: {
    syncCatalog: (catalog: unknown[]) => ipcRenderer.invoke('research:sync-catalog', catalog) as Promise<{ added: number }>,
    start: () => ipcRenderer.invoke('research:start') as Promise<{ started: boolean }>,
    onProgress: (cb: (p: ResearchProgress) => void) => {
      const listener = (_e: unknown, p: ResearchProgress) => cb(p);
      ipcRenderer.on('research:progress', listener);
      return () => ipcRenderer.removeListener('research:progress', listener);
    },
  },
});
