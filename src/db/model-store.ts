import { getDatabase } from './database';
import type { Model, CreateModelInput } from './types';
import { nanoid } from 'nanoid';

/**
 * Model operations
 */
export const modelStore = {
  getAll(): Model[] {
    const db = getDatabase();
    return db.prepare('SELECT * FROM models ORDER BY name').all() as Model[];
  },

  getByPublicId(publicId: string): Model | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM models WHERE public_id = ?').get(publicId) as Model | undefined;
    return result ?? null;
  },

  getById(id: number): Model | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM models WHERE id = ?').get(id) as Model | undefined;
    return result ?? null;
  },

  getByName(name: string): Model | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM models WHERE name = ?').get(name) as Model | undefined;
    return result ?? null;
  },

  getByOpenRouterId(openrouterId: string): Model | null {
    const db = getDatabase();
    const result = db.prepare('SELECT * FROM models WHERE openrouter_id = ?').get(openrouterId) as Model | undefined;
    return result ?? null;
  },

  create(input: CreateModelInput): Model {
    const db = getDatabase();
    const publicId = nanoid();
    
    const result = db.prepare(`
      INSERT INTO models (public_id, name, openrouter_id)
      VALUES (?, ?, ?)
      RETURNING *
    `).get(publicId, input.name, input.openrouter_id || null) as Model;
    
    return result;
  },

  createFromOpenRouter(openrouterModel: import('./types').OpenRouterModel): Model {
    const db = getDatabase();
    const publicId = nanoid();
    
    // Check if supports_tools by looking for 'tools' or 'tool_choice' in supported_parameters
    const supportsTools = openrouterModel.supported_parameters.includes('tools') || 
                          openrouterModel.supported_parameters.includes('tool_choice') ? 1 : 0;
    
    // Check if supports_reasoning
    const supportsReasoning = openrouterModel.supported_parameters.includes('reasoning') || 
                              openrouterModel.supported_parameters.includes('include_reasoning') ? 1 : 0;
    
    // Check if supports_structured_outputs
    const supportsStructuredOutputs = openrouterModel.supported_parameters.includes('structured_outputs') ? 1 : 0;
    
    // Check if supports image input/output
    const supportsImageInput = openrouterModel.architecture.input_modalities.includes('image') ? 1 : 0;
    const supportsImageOutput = openrouterModel.architecture.output_modalities.includes('image') ? 1 : 0;
    
    const result = db.prepare(`
      INSERT INTO models (
        public_id, name, openrouter_id, canonical_slug, hugging_face_id,
        openrouter_created, description, context_length,
        modality, input_modalities, output_modalities, tokenizer, instruct_type,
        price_prompt, price_completion, price_request, price_image, price_image_token,
        price_image_output, price_audio, price_input_audio_cache, price_web_search,
        price_internal_reasoning, price_input_cache_read, price_input_cache_write, price_discount,
        top_provider_context_length, top_provider_max_completion_tokens, top_provider_is_moderated,
        supports_tools, supports_reasoning, supports_image_input, supports_image_output, supports_structured_outputs,
        supported_parameters, default_parameters, full_metadata,
        last_synced_at, updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?,
        datetime('now'), datetime('now')
      )
      RETURNING *
    `).get(
      publicId,
      openrouterModel.name,
      openrouterModel.id,
      openrouterModel.canonical_slug,
      openrouterModel.hugging_face_id,
      openrouterModel.created,
      openrouterModel.description,
      openrouterModel.context_length,
      openrouterModel.architecture.modality,
      JSON.stringify(openrouterModel.architecture.input_modalities),
      JSON.stringify(openrouterModel.architecture.output_modalities),
      openrouterModel.architecture.tokenizer,
      openrouterModel.architecture.instruct_type,
      openrouterModel.pricing.prompt,
      openrouterModel.pricing.completion,
      openrouterModel.pricing.request || null,
      openrouterModel.pricing.image || null,
      openrouterModel.pricing.image_token || null,
      openrouterModel.pricing.image_output || null,
      openrouterModel.pricing.audio || null,
      openrouterModel.pricing.input_audio_cache || null,
      openrouterModel.pricing.web_search || null,
      openrouterModel.pricing.internal_reasoning || null,
      openrouterModel.pricing.input_cache_read || null,
      openrouterModel.pricing.input_cache_write || null,
      openrouterModel.pricing.discount || null,
      openrouterModel.top_provider.context_length,
      openrouterModel.top_provider.max_completion_tokens,
      openrouterModel.top_provider.is_moderated ? 1 : 0,
      supportsTools,
      supportsReasoning,
      supportsImageInput,
      supportsImageOutput,
      supportsStructuredOutputs,
      JSON.stringify(openrouterModel.supported_parameters),
      JSON.stringify(openrouterModel.default_parameters),
      JSON.stringify(openrouterModel)
    ) as Model;
    
    return result;
  },

  updateFromOpenRouter(publicId: string, openrouterModel: import('./types').OpenRouterModel): void {
    const db = getDatabase();
    
    // Check capabilities
    const supportsTools = openrouterModel.supported_parameters.includes('tools') || 
                          openrouterModel.supported_parameters.includes('tool_choice') ? 1 : 0;
    const supportsReasoning = openrouterModel.supported_parameters.includes('reasoning') || 
                              openrouterModel.supported_parameters.includes('include_reasoning') ? 1 : 0;
    const supportsStructuredOutputs = openrouterModel.supported_parameters.includes('structured_outputs') ? 1 : 0;
    const supportsImageInput = openrouterModel.architecture.input_modalities.includes('image') ? 1 : 0;
    const supportsImageOutput = openrouterModel.architecture.output_modalities.includes('image') ? 1 : 0;
    
    db.prepare(`
      UPDATE models SET
        name = ?,
        canonical_slug = ?,
        hugging_face_id = ?,
        openrouter_created = ?,
        description = ?,
        context_length = ?,
        modality = ?,
        input_modalities = ?,
        output_modalities = ?,
        tokenizer = ?,
        instruct_type = ?,
        price_prompt = ?,
        price_completion = ?,
        price_request = ?,
        price_image = ?,
        price_image_token = ?,
        price_image_output = ?,
        price_audio = ?,
        price_input_audio_cache = ?,
        price_web_search = ?,
        price_internal_reasoning = ?,
        price_input_cache_read = ?,
        price_input_cache_write = ?,
        price_discount = ?,
        top_provider_context_length = ?,
        top_provider_max_completion_tokens = ?,
        top_provider_is_moderated = ?,
        supports_tools = ?,
        supports_reasoning = ?,
        supports_image_input = ?,
        supports_image_output = ?,
        supports_structured_outputs = ?,
        supported_parameters = ?,
        default_parameters = ?,
        full_metadata = ?,
        last_synced_at = datetime('now'),
        updated_at = datetime('now')
      WHERE public_id = ?
    `).run(
      openrouterModel.name,
      openrouterModel.canonical_slug,
      openrouterModel.hugging_face_id,
      openrouterModel.created,
      openrouterModel.description,
      openrouterModel.context_length,
      openrouterModel.architecture.modality,
      JSON.stringify(openrouterModel.architecture.input_modalities),
      JSON.stringify(openrouterModel.architecture.output_modalities),
      openrouterModel.architecture.tokenizer,
      openrouterModel.architecture.instruct_type,
      openrouterModel.pricing.prompt,
      openrouterModel.pricing.completion,
      openrouterModel.pricing.request || null,
      openrouterModel.pricing.image || null,
      openrouterModel.pricing.image_token || null,
      openrouterModel.pricing.image_output || null,
      openrouterModel.pricing.audio || null,
      openrouterModel.pricing.input_audio_cache || null,
      openrouterModel.pricing.web_search || null,
      openrouterModel.pricing.internal_reasoning || null,
      openrouterModel.pricing.input_cache_read || null,
      openrouterModel.pricing.input_cache_write || null,
      openrouterModel.pricing.discount || null,
      openrouterModel.top_provider.context_length,
      openrouterModel.top_provider.max_completion_tokens,
      openrouterModel.top_provider.is_moderated ? 1 : 0,
      supportsTools,
      supportsReasoning,
      supportsImageInput,
      supportsImageOutput,
      supportsStructuredOutputs,
      JSON.stringify(openrouterModel.supported_parameters),
      JSON.stringify(openrouterModel.default_parameters),
      JSON.stringify(openrouterModel),
      publicId
    );
  },

  delete(publicId: string): void {
    const db = getDatabase();
    db.prepare('DELETE FROM models WHERE public_id = ?').run(publicId);
  },

  deleteById(id: number): void {
    const db = getDatabase();
    db.prepare('DELETE FROM models WHERE id = ?').run(id);
  },
};
