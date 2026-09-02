import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $autoRefresh, $refreshInterval } from './lib/store';
import { ModelExplorer } from './components/ModelExplorer';
import { ParticleField } from './components/ParticleField';
import { useModels } from './hooks/useModels';

export function App() {
  const { refresh } = useModels();
  const autoRefresh = useStore($autoRefresh);
  const refreshInterval = useStore($refreshInterval);

  useEffect(() => {
    if (!autoRefresh) return;
    const ms = Math.max(1, refreshInterval) * 60_000;
    const id = window.setInterval(() => {
      void refresh(true);
    }, ms);
    return () => window.clearInterval(id);
  }, [autoRefresh, refreshInterval, refresh]);

  return (
    <>
      <ParticleField />
      <div className="aurora au1" aria-hidden="true" />
      <div className="aurora au2" aria-hidden="true" />
      <div className="aurora au3" aria-hidden="true" />
      <ModelExplorer />
    </>
  );
}
