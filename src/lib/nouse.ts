import type { ResearchProgress } from './store';

export interface ResearchAxis {
  id: string;
  label: string;
  dir: 'desc' | 'asc';
  metric: string;
  count: number;
  pending: boolean;
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
}

export function nouse(): NouseBridge | undefined {
  return (window as unknown as { nouse?: NouseBridge }).nouse;
}
