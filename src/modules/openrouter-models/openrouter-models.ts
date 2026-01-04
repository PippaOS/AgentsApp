/**
 * OpenRouter API helper for fetching model metadata
 */

import type { OpenRouterModelsResponse, OpenRouterModel } from '../../db/types';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/models';

/**
 * Fetch all models from OpenRouter API
 */
export async function fetchOpenRouterModels(apiKey: string): Promise<OpenRouterModel[]> {
  const response = await fetch(OPENROUTER_API_URL, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}\n${errorText}`);
  }

  const data: OpenRouterModelsResponse = await response.json();
  return data.data;
}

/**
 * Fetch a specific model by ID from OpenRouter API
 */
export async function fetchOpenRouterModel(
  apiKey: string,
  modelId: string,
): Promise<OpenRouterModel | null> {
  const models = await fetchOpenRouterModels(apiKey);
  const model = models.find(m => m.id === modelId);
  return model ?? null;
}

/**
 * Check if a model exists on OpenRouter
 */
export async function checkModelExists(apiKey: string, modelId: string): Promise<boolean> {
  const model = await fetchOpenRouterModel(apiKey, modelId);
  return model !== null;
}

