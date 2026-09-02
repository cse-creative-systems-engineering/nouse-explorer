import { useCallback, useEffect, useState } from 'react';
import { useStore } from '@nanostores/react';
import {
  $error,
  $fetchedAt,
  $loading,
  $models,
} from '../lib/store';
import { fetchModels, readCache } from '../lib/api';

export function useModels() {
  const models = useStore($models);
  const loading = useStore($loading);
  const error = useStore($error);
  const fetchedAt = useStore($fetchedAt);
  const [initialised, setInitialised] = useState(false);

  const load = useCallback(async (force: boolean) => {
    $loading.set(true);
    $error.set(null);
    try {
      const cache = await fetchModels(force);
      $models.set(cache.models);
      $fetchedAt.set(cache.fetchedAt);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      $error.set(msg);
      if (force || models.length === 0) {
        const cached = readCache();
        if (cached) {
          $models.set(cached.models);
          $fetchedAt.set(cached.fetchedAt);
        }
      }
    } finally {
      $loading.set(false);
      setInitialised(true);
    }
  }, [models.length]);

  useEffect(() => {
    if (!initialised) {
      void load(false);
    }
  }, [initialised, load]);

  const refresh = useCallback(
    (force: boolean) => load(force),
    [load],
  );

  return { models, loading, error, fetchedAt, refresh };
}