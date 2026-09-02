import type { ResearchProgress } from './store';

export interface ResearchAxis {
  id: string;
  label: string;
  dir: 'desc' | 'asc';
  metric: string;
  count: number;
  pending: boolean;
}

export interface AppSettings {
  nousApiKeySet: boolean;
  nousApiKeyMasked: string | null;
  aaApiKeySet: boolean;
  aaApiKeyMasked: string | null;
  distillerModel: string;
  encryptionAvailable: boolean;
}

export interface NouseBridge {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  research: {
    syncCatalog: (catalog: unknown[]) => Promise<{ added: number }>;
    start: () => Promise<{ started: boolean }>;
    getMetrics: () => Promise<Record<string, Record<string, number>>>;
    getAxes: () => Promise<ResearchAxis[]>;
    onProgress: (cb: (p: ResearchProgress) => void) => () => void;
  };
  settings: {
    get: () => Promise<AppSettings>;
    setSecret: (name: string, value: string) => Promise<{ ok: boolean; view?: AppSettings }>;
    setDistiller: (model: string) => Promise<{ ok: boolean; view?: AppSettings }>;
  };
}

export function nouse(): NouseBridge | undefined {
  return (window as unknown as { nouse?: NouseBridge }).nouse;
}
