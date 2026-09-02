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

export interface NouseBridge {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  research: {
    syncCatalog: (catalog: unknown[]) => Promise<{ added: number }>;
    start: () => Promise<{ started: boolean }>;
    getMetrics: () => Promise<Record<string, Record<string, number>>>;
    getAxes: () => Promise<ResearchAxis[]>;
    getProfile: (modelId: string) => Promise<{ profile: unknown; researched_at: string } | null>;
    onProgress: (cb: (p: ResearchProgress) => void) => () => void;
  };
  settings: {
    get: () => Promise<AppSettings>;
    setSecret: (name: string, value: string) => Promise<{ ok: boolean; view?: AppSettings }>;
    setDistiller: (model: string) => Promise<{ ok: boolean; view?: AppSettings }>;
  };
  alerts: {
    list: () => Promise<Watch[]>;
    create: (w: Omit<Watch, 'id'>) => Promise<Watch>;
    update: (id: string, patch: Partial<Omit<Watch, 'id'>>) => Promise<Watch[]>;
    remove: (id: string) => Promise<Watch[]>;
    history: () => Promise<AlertRecord[]>;
    ack: () => Promise<AlertRecord[]>;
    checkNow: () => Promise<AlertRecord[]>;
    setCatalog: (catalog: unknown[]) => Promise<{ ok: boolean }>;
    onFired: (cb: (alerts: AlertRecord[]) => void) => () => void;
  };
}

export function nouse(): NouseBridge | undefined {
  return (window as unknown as { nouse?: NouseBridge }).nouse;
}
