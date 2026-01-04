import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { Model } from '../db/types';

// Format price helper
function formatPrice(price: string | null | undefined): string {
  if (!price) return 'N/A';
  const num = parseFloat(price);
  if (num === 0) return 'Free';
  // Format in scientific notation if very small
  if (num < 0.0001) {
    return `$${num.toExponential(2)}`;
  }
  return `$${num.toFixed(6)}`;
}

export default function ModelDetail() {
  const { id } = useParams<{ id: string }>();
  
  const [model, setModel] = useState<Model | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    async function fetchModel() {
      try {
        const modelData = await window.db.models.getByPublicId(id);
        if (!modelData) {
          setError('Model not found');
          setLoading(false);
          return;
        }
        setModel(modelData);
      } catch (err) {
        setError('Failed to load model');
      } finally {
        setLoading(false);
      }
    }

    fetchModel();
  }, [id]);

  if (loading) {
    return (
      <main className="p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </main>
    );
  }

  if (error || !model) {
    return (
      <main className="p-6">
        <div className="space-y-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            Back to Models
          </Link>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        </div>
      </main>
    );
  }

  // Parse JSON fields
  const inputModalities = model.input_modalities ? JSON.parse(model.input_modalities) : [];
  const outputModalities = model.output_modalities ? JSON.parse(model.output_modalities) : [];
  const supportedParameters = model.supported_parameters ? JSON.parse(model.supported_parameters) : [];
  const defaultParameters = model.default_parameters ? JSON.parse(model.default_parameters) : {};

  return (
    <main className="p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{model.name}</h1>
              {model.openrouter_id && (
                <p className="text-sm text-gray-500 font-mono mt-1">{model.openrouter_id}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {model.supports_tools === 1 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-600 text-white">
                    Tools
                  </span>
                )}
                {model.supports_reasoning === 1 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-600 text-white">
                    Reasoning
                  </span>
                )}
                {model.supports_structured_outputs === 1 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-600 text-white">
                    Structured Outputs
                  </span>
                )}
                {model.supports_image_input === 1 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-500 text-white">
                    Image Input
                  </span>
                )}
                {model.supports_image_output === 1 && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-pink-600 text-white">
                    Image Generation
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {/* Description */}
        {model.description && (
          <p className="text-sm text-gray-600 whitespace-pre-wrap">{model.description}</p>
        )}

        {/* Architecture + Context */}
        <section className="pt-6 border-t border-gray-200">
          <div className="flex flex-wrap gap-10">
            <div className="min-w-[360px] flex-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                Architecture
              </h2>
              <dl className="space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-6">
                  <dt className="text-gray-600">Modality</dt>
                  <dd className="font-mono text-gray-900 text-right break-words">{model.modality || 'N/A'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-6">
                  <dt className="text-gray-600">Tokenizer</dt>
                  <dd className="font-mono text-gray-900 text-right break-words">{model.tokenizer || 'N/A'}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-6">
                  <dt className="text-gray-600">Instruct Type</dt>
                  <dd className="font-mono text-gray-900 text-right break-words">{model.instruct_type || 'None'}</dd>
                </div>
                <div className="pt-2">
                  <dt className="text-gray-600 mb-1">Input Modalities</dt>
                  <dd className="flex flex-wrap gap-2">
                    {inputModalities.map((mod: string) => (
                      <span
                        key={mod}
                        className="inline-flex items-center px-2.5 py-1 border border-gray-200 rounded-md text-xs font-mono text-gray-700"
                      >
                        {mod}
                      </span>
                    ))}
                  </dd>
                </div>
                <div className="pt-2">
                  <dt className="text-gray-600 mb-1">Output Modalities</dt>
                  <dd className="flex flex-wrap gap-2">
                    {outputModalities.map((mod: string) => (
                      <span
                        key={mod}
                        className="inline-flex items-center px-2.5 py-1 border border-gray-200 rounded-md text-xs font-mono text-gray-700"
                      >
                        {mod}
                      </span>
                    ))}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="min-w-[360px] flex-1">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                Context & Tokens
              </h2>
              <dl className="space-y-2 text-sm">
                <div className="flex items-baseline justify-between gap-6">
                  <dt className="text-gray-600">Context Length</dt>
                  <dd className="font-mono text-gray-900 text-right break-words">
                    {model.context_length?.toLocaleString() || 'N/A'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-6">
                  <dt className="text-gray-600">Max Completion</dt>
                  <dd className="font-mono text-gray-900 text-right break-words">
                    {model.top_provider_max_completion_tokens?.toLocaleString() || 'N/A'}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-6">
                  <dt className="text-gray-600">Moderated</dt>
                  <dd className="text-gray-900 text-right">{model.top_provider_is_moderated === 1 ? 'Yes' : 'No'}</dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section className="pt-6 border-t border-gray-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Pricing</h2>
          <dl className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-6">
              <dt className="text-gray-600">Prompt</dt>
              <dd className="font-mono text-gray-900 text-right">{formatPrice(model.price_prompt)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-6">
              <dt className="text-gray-600">Completion</dt>
              <dd className="font-mono text-gray-900 text-right">{formatPrice(model.price_completion)}</dd>
            </div>
            {model.price_image && (
              <div className="flex items-baseline justify-between gap-6">
                <dt className="text-gray-600">Image Input</dt>
                <dd className="font-mono text-gray-900 text-right">{formatPrice(model.price_image)}</dd>
              </div>
            )}
            {model.price_image_output && (
              <div className="flex items-baseline justify-between gap-6">
                <dt className="text-gray-600">Image Output</dt>
                <dd className="font-mono text-gray-900 text-right">{formatPrice(model.price_image_output)}</dd>
              </div>
            )}
            {model.price_internal_reasoning && (
              <div className="flex items-baseline justify-between gap-6">
                <dt className="text-gray-600">Reasoning</dt>
                <dd className="font-mono text-gray-900 text-right">{formatPrice(model.price_internal_reasoning)}</dd>
              </div>
            )}
            {model.price_input_cache_read && (
              <div className="flex items-baseline justify-between gap-6">
                <dt className="text-gray-600">Cache Read</dt>
                <dd className="font-mono text-gray-900 text-right">{formatPrice(model.price_input_cache_read)}</dd>
              </div>
            )}
            {model.price_input_cache_write && (
              <div className="flex items-baseline justify-between gap-6">
                <dt className="text-gray-600">Cache Write</dt>
                <dd className="font-mono text-gray-900 text-right">{formatPrice(model.price_input_cache_write)}</dd>
              </div>
            )}
          </dl>
        </section>

        {/* Supported Parameters */}
        <section className="pt-6 border-t border-gray-200">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
            Supported Parameters
          </h2>
          <div className="flex flex-wrap gap-2">
            {supportedParameters.map((param: string) => (
              <span
                key={param}
                className="inline-flex items-center px-2.5 py-1 border border-gray-200 rounded-md text-xs font-mono text-gray-700"
              >
                {param}
              </span>
            ))}
          </div>
        </section>

        {/* Default Parameters */}
        {Object.keys(defaultParameters).length > 0 && (
          <section className="pt-6 border-t border-gray-200">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Default Parameters
            </h2>
            <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-2 text-sm">
              {Object.entries(defaultParameters).map(([key, value]) => (
                <div key={key} className="flex items-baseline justify-between gap-6">
                  <dt className="text-gray-600 font-mono break-words">{key}</dt>
                  <dd className="font-mono text-gray-900 text-right break-words">
                    {value === null ? 'null' : String(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </main>
  );
}

