import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { APICall, APICallEntity, APICallToolCall } from '../db/types';
import type { ChatCompletionResponse } from '../chat/openrouter';

const statusClasses: Record<string, string> = {
  completed: 'bg-green-600 text-white',
  failed: 'bg-red-600 text-white',
  pending: 'bg-yellow-500 text-white',
  streaming: 'bg-blue-600 text-white',
};

function formatDate(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function formatCost(cost?: number | null) {
  if (cost == null) return '—';
  return `$${cost.toFixed(6)}`;
}

function formatJSON(value?: string | null) {
  if (!value) return '';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function extractAssistantMessage(responseJson?: string | null) {
  if (!responseJson) return null;
  try {
    const parsed = JSON.parse(responseJson) as ChatCompletionResponse;
    const message = parsed?.choices?.[0]?.message;
    const previousToolMessage = parsed?.previous_tool_message;
    if (!message) return null;
    return {
      content: typeof message.content === 'string' ? message.content : null,
      reasoning: message.reasoning || null,
      finishReason: parsed?.choices?.[0]?.finish_reason ?? null,
      previousToolContent:
        previousToolMessage && typeof previousToolMessage.content === 'string'
          ? previousToolMessage.content
          : null,
      previousToolReasoning: previousToolMessage?.reasoning || null,
    };
  } catch {
    return null;
  }
}

// Copy button component
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | undefined>(undefined);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch (error) {
      // Failed to copy
    }
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-gray-500 
                 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors cursor-pointer
                 ${copied ? 'text-green-600' : ''}`}
      type="button"
      title="Copy to clipboard"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
    </button>
  );
}

export default function APICallDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<{
    call: APICall;
    tool_calls: APICallToolCall[];
    entities: APICallEntity[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('request');
  const assistantMessage = extractAssistantMessage(data?.call.response_json);

  // Update active tab when data loads
  useEffect(() => {
    if (data?.call) {
      if (!data.call.request_json && data.call.response_json) {
        setActiveTab('response');
      } else if (data.call.request_json) {
        setActiveTab('request');
      }
    }
  }, [data]);

  useEffect(() => {
    if (!id) return;
    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    window.apiCalls
      .getById(numericId)
      .then(res => setData(res))
      .catch(() => {
        // Error loading API call
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) return null;

  return (
    <main className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            Back
          </button>
          <h1 className="text-2xl font-semibold text-gray-900">API Call Detail</h1>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
            Loading...
          </div>
        ) : !data ? (
          <div className="bg-white rounded-lg border border-red-200 p-8 text-center text-red-600">
            API call not found.
          </div>
        ) : (
          <>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-end">
                <span
                  className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                    statusClasses[data.call.status] ?? 'bg-gray-600 text-white'
                  }`}
                >
                  {data.call.status}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="text-xs uppercase text-gray-500">Model</div>
                  <div className="text-sm text-gray-900">{data.call.model}</div>
                  {data.call.model_actual && (
                    <div className="text-xs text-gray-500">Actual: {data.call.model_actual}</div>
                  )}
                </div>
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="text-xs uppercase text-gray-500">Provider</div>
                  <div className="text-sm text-gray-900">{data.call.provider || '—'}</div>
                </div>
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="text-xs uppercase text-gray-500">Cost</div>
                  <div className="text-sm text-gray-900">{formatCost(data.call.cost)}</div>
                </div>
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="text-xs uppercase text-gray-500">Created</div>
                  <div className="text-sm text-gray-900">{formatDate(data.call.created_at)}</div>
                </div>
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="text-xs uppercase text-gray-500">Completed</div>
                  <div className="text-sm text-gray-900">{formatDate(data.call.completed_at)}</div>
                </div>
                <div className="px-6 py-4 border-b border-gray-100">
                  <div className="text-xs uppercase text-gray-500">Finish Reason</div>
                  <div className="text-sm text-gray-900">{data.call.finish_reason || '—'}</div>
                </div>
              </div>
            </div>

            {(data.call.total_tokens ||
              data.call.prompt_tokens ||
              data.call.completion_tokens ||
              data.call.reasoning_tokens ||
              data.call.cached_tokens) && (
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <span className="text-sm font-medium text-white">Token Usage</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-6">
                  <Stat label="Total" value={data.call.total_tokens} />
                  <Stat label="Prompt" value={data.call.prompt_tokens} />
                  <Stat label="Completion" value={data.call.completion_tokens} />
                  <Stat label="Cached" value={data.call.cached_tokens} />
                  <Stat label="Reasoning" value={data.call.reasoning_tokens} />
                </div>
              </div>
            )}

            {(data.call.latency_ms || data.call.duration_ms) && (
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <span className="text-sm font-medium text-white">Timing</span>
                </div>
                <div className="grid grid-cols-2 gap-4 p-6">
                  <Stat label="TTFT (ms)" value={data.call.latency_ms} />
                  <Stat label="Duration (ms)" value={data.call.duration_ms} />
                </div>
              </div>
            )}

            {data.call.error_message && (
              <div className="bg-red-50 rounded-lg border border-red-200">
                <div className="px-6 py-4 border-b border-red-200">
                  <span className="text-sm font-medium text-red-800">Error</span>
                </div>
                <div className="p-6 space-y-2 text-sm text-red-800">
                  {data.call.error_code && <div>Code: {data.call.error_code}</div>}
                  <div className="whitespace-pre-wrap break-words">{data.call.error_message}</div>
                </div>
              </div>
            )}

            {data.tool_calls.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-800">
                    Tool Calls ({data.tool_calls.length})
                  </span>
                </div>
                <div className="divide-y divide-gray-100">
                  {data.tool_calls.map(tc => (
                    <div key={tc.public_id} className="p-6 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="font-mono text-sm text-gray-800">{tc.tool_name}</div>
                        <span className="text-xs text-gray-500">{tc.duration_ms ? `${tc.duration_ms} ms` : ''}</span>
                      </div>
                      <div className="text-xs text-gray-500">Tool Call ID: {tc.tool_call_id}</div>
                      <div>
                        <div className="text-xs uppercase text-gray-500 mb-1">Arguments</div>
                        <pre className="bg-gray-50 border border-gray-200 rounded p-2 text-xs text-gray-800 overflow-auto">
                          {formatJSON(tc.arguments_json)}
                        </pre>
                      </div>
                      {tc.result_json && (
                        <div>
                          <div className="text-xs uppercase text-gray-500 mb-1">Result</div>
                          <pre className="bg-gray-50 border border-gray-200 rounded p-2 text-xs text-gray-800 overflow-auto">
                            {formatJSON(tc.result_json)}
                          </pre>
                        </div>
                      )}
                      {tc.error_message && (
                        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                          {tc.error_message}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.entities.length > 0 && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-800">
                    Entities ({data.entities.length})
                  </span>
                </div>
                <table className="w-full text-left">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Entity ID</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Message</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Content</th>
                      <th className="px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Detail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.entities.map(e => (
                      <tr key={`${e.entity_id}-${e.message_index}-${e.content_index}`} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm font-mono text-gray-700">{e.entity_id}</td>
                        <td className="px-6 py-3 text-sm text-gray-700">{e.entity_type}</td>
                        <td className="px-6 py-3 text-sm text-gray-700">{e.message_index}</td>
                        <td className="px-6 py-3 text-sm text-gray-700">{e.content_index}</td>
                        <td className="px-6 py-3 text-sm text-gray-700">{e.detail || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {(data.call.request_json || data.call.response_json) && (
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200 flex items-center justify-between">
                  <div className="flex">
                    {data.call.request_json && (
                      <button
                        onClick={() => setActiveTab('request')}
                        className={`px-6 py-3 text-sm font-medium transition-colors ${
                          activeTab === 'request'
                            ? 'text-white border-b-2 border-white'
                            : 'text-[#aaaaaa] hover:text-white'
                        }`}
                      >
                        Request JSON
                      </button>
                    )}
                    {data.call.response_json && (
                      <button
                        onClick={() => setActiveTab('response')}
                        className={`px-6 py-3 text-sm font-medium transition-colors ${
                          activeTab === 'response'
                            ? 'text-white border-b-2 border-white'
                            : 'text-[#aaaaaa] hover:text-white'
                        }`}
                      >
                        Response JSON
                      </button>
                    )}
                  </div>
                  <div className="px-4">
                    {activeTab === 'request' && data.call.request_json && (
                      <CopyButton text={formatJSON(data.call.request_json)} />
                    )}
                    {activeTab === 'response' && data.call.response_json && (
                      <CopyButton text={formatJSON(data.call.response_json)} />
                    )}
                  </div>
                </div>
                <div className="p-4">
                  {activeTab === 'response' && assistantMessage && (
                    <div className="mb-4 space-y-2">
                      {(assistantMessage.previousToolContent || assistantMessage.previousToolReasoning) && (
                        <div className="space-y-2">
                          <div className="text-xs uppercase text-gray-500 mb-1">Previous Tool Assistant Message</div>
                          {assistantMessage.previousToolContent && (
                            <div className="text-sm whitespace-pre-wrap break-words text-gray-900 bg-gray-50 border border-gray-200 rounded p-3">
                              {assistantMessage.previousToolContent}
                            </div>
                          )}
                          {assistantMessage.previousToolReasoning && (
                            <div className="text-sm whitespace-pre-wrap break-words text-gray-900 bg-gray-50 border border-gray-200 rounded p-3">
                              {assistantMessage.previousToolReasoning}
                            </div>
                          )}
                        </div>
                      )}
                      {assistantMessage.content && (
                        <div>
                          <div className="text-xs uppercase text-gray-500 mb-1">Assistant Content</div>
                          <div className="text-sm whitespace-pre-wrap break-words text-gray-900 bg-gray-50 border border-gray-200 rounded p-3">
                            {assistantMessage.content}
                          </div>
                        </div>
                      )}
                      {assistantMessage.reasoning && (
                        <div>
                          <div className="text-xs uppercase text-gray-500 mb-1">Reasoning</div>
                          <div className="text-sm whitespace-pre-wrap break-words text-gray-900 bg-gray-50 border border-gray-200 rounded p-3">
                            {assistantMessage.reasoning}
                          </div>
                        </div>
                      )}
                      {assistantMessage.finishReason && (
                        <div className="text-xs text-gray-500">
                          Finish reason: {assistantMessage.finishReason}
                        </div>
                      )}
                    </div>
                  )}
                  {activeTab === 'request' && data.call.request_json && (
                    <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-4 overflow-auto max-h-96">
                      {formatJSON(data.call.request_json)}
                    </pre>
                  )}
                  {activeTab === 'response' && data.call.response_json && (
                    <pre className="text-xs bg-gray-50 border border-gray-200 rounded p-4 overflow-auto max-h-96">
                      {formatJSON(data.call.response_json)}
                    </pre>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="text-center">
      <div className="text-2xl font-semibold text-gray-900">
        {value == null ? '—' : value.toLocaleString()}
      </div>
      <div className="text-xs text-gray-600 uppercase tracking-wide font-medium">{label}</div>
    </div>
  );
}

