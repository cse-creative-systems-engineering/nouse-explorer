import type { ResearchProgress } from './store';

export interface NouseBridge {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  research: {
    syncCatalog: (catalog: unknown[]) => Promise<{ added: number }>;
    start: () => Promise<{ started: boolean }>;
    onProgress: (cb: (p: ResearchProgress) => void) => () => void;
  };
}

export function nouse(): NouseBridge | undefined {
  return (window as unknown as { nouse?: NouseBridge }).nouse;
}
