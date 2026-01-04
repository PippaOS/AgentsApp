/**
 * Global models store hook
 * Provides a single source of truth for models across the application
 */

import { useState, useEffect, startTransition } from 'react';

export interface Model {
  id: number;
  public_id: string;
  name: string;
  openrouter_id?: string;
  created_at: string;
}

export interface ModelsStore {
  models: Model[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useModelsStore(): ModelsStore {
  const [models, setModels] = useState<Model[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await window.db.models.getAll();
      setModels(data);
    } catch (err) {
      setError('Failed to load models');
      console.error('Failed to load models:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    const unsubscribe = window.db.models.onUpdated(() => {
      startTransition(refresh);
    });
    return unsubscribe;
  }, []);

  return { models, isLoading, error, refresh };
}