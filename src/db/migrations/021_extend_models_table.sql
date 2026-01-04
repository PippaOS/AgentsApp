-- Extend models table with OpenRouter metadata
-- This migration adds all fields from the OpenRouter API response

-- Add OpenRouter metadata columns
ALTER TABLE models ADD COLUMN openrouter_id TEXT;
ALTER TABLE models ADD COLUMN canonical_slug TEXT;
ALTER TABLE models ADD COLUMN hugging_face_id TEXT;
ALTER TABLE models ADD COLUMN openrouter_created INTEGER;
ALTER TABLE models ADD COLUMN description TEXT;
ALTER TABLE models ADD COLUMN context_length INTEGER;

-- Add architecture columns
ALTER TABLE models ADD COLUMN modality TEXT;
ALTER TABLE models ADD COLUMN input_modalities TEXT;
ALTER TABLE models ADD COLUMN output_modalities TEXT;
ALTER TABLE models ADD COLUMN tokenizer TEXT;
ALTER TABLE models ADD COLUMN instruct_type TEXT;

-- Add pricing columns (all TEXT except discount)
ALTER TABLE models ADD COLUMN price_prompt TEXT;
ALTER TABLE models ADD COLUMN price_completion TEXT;
ALTER TABLE models ADD COLUMN price_request TEXT;
ALTER TABLE models ADD COLUMN price_image TEXT;
ALTER TABLE models ADD COLUMN price_image_token TEXT;
ALTER TABLE models ADD COLUMN price_image_output TEXT;
ALTER TABLE models ADD COLUMN price_audio TEXT;
ALTER TABLE models ADD COLUMN price_input_audio_cache TEXT;
ALTER TABLE models ADD COLUMN price_web_search TEXT;
ALTER TABLE models ADD COLUMN price_internal_reasoning TEXT;
ALTER TABLE models ADD COLUMN price_input_cache_read TEXT;
ALTER TABLE models ADD COLUMN price_input_cache_write TEXT;
ALTER TABLE models ADD COLUMN price_discount REAL;

-- Add top provider info columns
ALTER TABLE models ADD COLUMN top_provider_context_length INTEGER;
ALTER TABLE models ADD COLUMN top_provider_max_completion_tokens INTEGER;
ALTER TABLE models ADD COLUMN top_provider_is_moderated INTEGER DEFAULT 0;

-- Add capability flags for quick filtering
ALTER TABLE models ADD COLUMN supports_tools INTEGER DEFAULT 0;
ALTER TABLE models ADD COLUMN supports_reasoning INTEGER DEFAULT 0;
ALTER TABLE models ADD COLUMN supports_image_input INTEGER DEFAULT 0;
ALTER TABLE models ADD COLUMN supports_image_output INTEGER DEFAULT 0;
ALTER TABLE models ADD COLUMN supports_structured_outputs INTEGER DEFAULT 0;

-- Add JSON storage columns
ALTER TABLE models ADD COLUMN supported_parameters TEXT;
ALTER TABLE models ADD COLUMN default_parameters TEXT;
ALTER TABLE models ADD COLUMN full_metadata TEXT;

-- Add timestamps
ALTER TABLE models ADD COLUMN last_synced_at DATETIME DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE models ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;

-- Create indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_models_openrouter_id ON models(openrouter_id);
CREATE INDEX IF NOT EXISTS idx_models_canonical_slug ON models(canonical_slug);
CREATE INDEX IF NOT EXISTS idx_models_supports_tools ON models(supports_tools);
CREATE INDEX IF NOT EXISTS idx_models_supports_reasoning ON models(supports_reasoning);
CREATE INDEX IF NOT EXISTS idx_models_supports_image_output ON models(supports_image_output);
CREATE INDEX IF NOT EXISTS idx_models_tokenizer ON models(tokenizer);

