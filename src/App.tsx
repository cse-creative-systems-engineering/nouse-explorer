import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $autoRefresh, $refreshInterval, $research, $models } from './lib/store';
import { ModelExplorer } from './components/ModelExplorer';
import { ResearchBanner } from './components/ResearchBanner';
import { Onboarding } from './components/Onboarding';
import { BackgroundArt } from './components/BackgroundArt';
import { useModels } from './hooks/useModels';
import { nouse } from './lib/nouse';

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

  // One-time research-engine wiring: sync catalog → start background queue,
  // subscribe to progress.
  useEffect(() => {
    const bridge = nouse();
    if (!bridge?.research) return;
    const off = bridge.research.onProgress((p) => $research.set(p));
    let synced = false;
    const trySync = () => {
      if (synced || $models.get().length === 0) return;
      synced = true;
      void bridge.research.syncCatalog($models.get()).then(({ added }) => {
        if (added > 0) void bridge.research.start();
        else void bridge.research.start(); // still run staleness pass
      });
    };
    trySync();
    const unsub = $models.subscribe(() => trySync());
    return () => {
      off();
      unsub();
    };
  }, []);

  return (
    <>
      <BackgroundArt
        src="./art/bg-sandbox.webp"
        credit="Hermes · Isolated Sandboxing"
      />
      <div className="stage">
        <ModelExplorer />
        <ResearchBanner />
        <Onboarding />
      </div>
    </>
  );
}
