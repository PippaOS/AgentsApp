import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { CodeRun } from '../db/types';
import { CodeBlock } from '../components/CodeBlock';

function statusDot(status: string) {
  const color =
    status === 'completed'
      ? 'bg-green-600'
      : status === 'failed'
        ? 'bg-red-600'
        : status === 'running'
          ? 'bg-blue-600'
          : 'bg-yellow-500';
  return <span className={`w-2 h-2 rounded-full ${color} inline-block`} title={status} aria-label={status} />;
}

export default function CodeRunDetail() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<CodeRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function fetchRun() {
      setLoading(true);
      setError(null);
      try {
        const r = await window.codeRuns.getByPublicId(id);
        if (cancelled) return;
        if (!r) {
          setError('Code run not found');
          setRun(null);
        } else {
          setRun(r);
        }
      } catch (e) {
        if (cancelled) return;
        setError((e as Error).message || 'Failed to load code run');
        setRun(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchRun();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="p-4 text-sm text-[#aaaaaa]">
        Loading…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-500">
        {error}
      </div>
    );
  }

  if (!run) {
    return <div className="p-4 text-sm text-[#aaaaaa]">No data.</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        {statusDot(run.status)}
        <div className="min-w-0">
          <div className="text-white font-medium truncate">Code Run {run.public_id}</div>
          <div className="text-xs text-[#777777]">
            {run.created_at}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-sm text-[#aaaaaa]">Input</div>
        <CodeBlock code={run.input_ts} language="typescript" />
      </div>

      <div className="space-y-2">
        <div className="text-sm text-[#aaaaaa]">Output</div>
        <div className="rounded-lg bg-[#1f1f1f] border border-[#2b2b2b] overflow-x-auto">
          <pre className="m-0 p-4 font-mono text-[13px] leading-relaxed text-[#cccccc] whitespace-pre">
            {run.output || (run.error ? `ERROR: ${run.error}` : '')}
          </pre>
        </div>
      </div>
    </div>
  );
}

