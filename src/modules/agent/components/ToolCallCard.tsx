import { Wrench } from 'lucide-react';

interface ToolCallCardProps {
  name: string;
  input: string;
  output?: string | null;
  isStreaming?: boolean;
}

function tryPrettyJson(value: string): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return '';
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}

export default function ToolCallCard({ name, input, output, isStreaming }: ToolCallCardProps) {
  const prettyInput = tryPrettyJson(input);
  const prettyOutput = output ? tryPrettyJson(output) : '';

  return (
    <div className="mb-3 border border-[#2a2a2a] rounded-lg overflow-hidden bg-[#0d0d0d]">
      <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-[#1a1a1a] to-[#141414] border-b border-[#2a2a2a]">
        <Wrench className="w-4 h-4 flex-shrink-0 text-[#6d6d6d]" />
        <span className={`text-sm font-medium tracking-wide ${isStreaming ? 'shimmer-text' : 'text-[#888]'}`}>
          {name}
        </span>
      </div>

      <div className="divide-y divide-[#1f1f1f]">
        <div className="px-3 py-2">
          <pre className="text-xs text-[#c8c8c8] whitespace-pre-wrap break-words overflow-x-auto sidebar-scrollbar">
            {prettyInput || <span className="text-[#444] italic">—</span>}
          </pre>
        </div>
        <div className="px-3 py-2">
          <div className="text-xs font-medium text-[#555] uppercase tracking-wider mb-1">Output</div>
          <pre className="text-xs text-[#c8c8c8] whitespace-pre-wrap break-words overflow-x-auto sidebar-scrollbar">
            {output ? prettyOutput : <span className="text-[#444] italic">{isStreaming ? '…' : '—'}</span>}
          </pre>
        </div>
      </div>
    </div>
  );
}

