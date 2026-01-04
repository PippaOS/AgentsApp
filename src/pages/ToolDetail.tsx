import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loader2, Trash2 } from 'lucide-react';
import type { Tool } from '../db/types';

function validateJson(text: string): string | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  try {
    JSON.parse(trimmed);
    return null;
  } catch (err) {
    return (err as Error).message || 'Invalid JSON';
  }
}

export default function ToolDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [tool, setTool] = useState<Tool | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [draftName, setDraftName] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftSchema, setDraftSchema] = useState('{}');
  const [draftCode, setDraftCode] = useState('');

  useEffect(() => {
    if (!id) return;

    async function fetchTool() {
      setLoading(true);
      setError(null);
      try {
        const data = await window.db.tools.getByPublicId(id);
        if (!data) {
          setError('Tool not found');
          setTool(null);
          return;
        }
        setTool(data);
        setDraftName(data.name ?? '');
        setDraftDescription(data.description ?? '');
        setDraftSchema(data.input_schema_json ?? '{}');
        setDraftCode(data.code_ts ?? '');
      } catch (err) {
        setError('Failed to load tool: ' + (err as Error).message);
      } finally {
        setLoading(false);
      }
    }

    fetchTool();
  }, [id]);

  useEffect(() => {
    const unsubscribe = window.db.tools.onUpdated(async () => {
      if (!id) return;
      const data = await window.db.tools.getByPublicId(id);
      setTool(data);
      if (data) {
        setDraftName(data.name ?? '');
        setDraftDescription(data.description ?? '');
        setDraftSchema(data.input_schema_json ?? '{}');
        setDraftCode(data.code_ts ?? '');
      }
    });
    return unsubscribe;
  }, [id]);

  const schemaError = useMemo(() => validateJson(draftSchema), [draftSchema]);

  const canSave = useMemo(() => {
    if (!tool) return false;
    if (schemaError) return false;
    const nameChanged = (draftName ?? '') !== (tool.name ?? '');
    const descChanged = (draftDescription ?? '') !== (tool.description ?? '');
    const schemaChanged = (draftSchema ?? '') !== (tool.input_schema_json ?? '');
    const codeChanged = (draftCode ?? '') !== (tool.code_ts ?? '');
    return nameChanged || descChanged || schemaChanged || codeChanged;
  }, [tool, draftName, draftDescription, draftSchema, draftCode, schemaError]);

  const handleSave = async () => {
    if (!tool) return;
    if (schemaError) return;
    setIsSaving(true);
    setError(null);
    try {
      await window.db.tools.update(tool.public_id, {
        name: (draftName ?? '').trim() || 'Untitled Tool',
        description: draftDescription ?? '',
        input_schema_json: (draftSchema ?? '').trim() || '{}',
        code_ts: draftCode ?? '',
      });
    } catch (err) {
      setError('Failed to save: ' + (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!tool) return;
    if (!confirm('Delete this tool?')) return;

    setIsDeleting(true);
    setError(null);
    try {
      await window.db.tools.delete(tool.public_id);
      navigate('/');
    } catch (err) {
      setError('Failed to delete: ' + (err as Error).message);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <main className="p-6">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </main>
    );
  }

  if (error || !tool) {
    return (
      <main className="p-6">
        <div className="space-y-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
            Back
          </Link>
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">{error}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="p-6">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-gray-900">{tool.name || 'Untitled Tool'}</h1>
            <p className="text-sm text-gray-500 font-mono mt-1">{tool.public_id}</p>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
            title="Delete tool"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        <section className="pt-6 border-t border-gray-200 space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Name</h2>
              <input
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Tool name…"
              />
            </div>

            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Description</h2>
              <textarea
                value={draftDescription}
                onChange={e => setDraftDescription(e.target.value)}
                className="w-full min-h-[110px] rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Describe what this tool does…"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Schema + Code</h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraftName(tool.name ?? '');
                  setDraftDescription(tool.description ?? '');
                  setDraftSchema(tool.input_schema_json ?? '{}');
                  setDraftCode(tool.code_ts ?? '');
                }}
                disabled={!canSave || isSaving}
                className="inline-flex items-center px-3 py-2 rounded-md text-sm font-medium border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave || isSaving}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Save
              </button>
            </div>
          </div>

          {schemaError && (
            <div className="bg-yellow-50 border border-yellow-200 text-yellow-900 px-4 py-3 rounded-md text-sm">
              Schema JSON error: {schemaError}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs text-gray-500">Input JSON Schema</div>
              <textarea
                value={draftSchema}
                onChange={e => setDraftSchema(e.target.value)}
                className="w-full min-h-[420px] rounded-md border border-gray-200 px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder='{"type":"object","properties":{}}'
              />
            </div>

            <div className="space-y-2">
              <div className="text-xs text-gray-500">Deno tool code (TypeScript)</div>
              <textarea
                value={draftCode}
                onChange={e => setDraftCode(e.target.value)}
                className="w-full min-h-[420px] rounded-md border border-gray-200 px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="export default async function main(input) { ... }"
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

