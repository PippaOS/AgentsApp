import { useMemo } from 'react';
import hljs from 'highlight.js';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function CodeBlock({
  code,
  language = 'typescript',
  borderless = false,
}: {
  code: string;
  language?: string;
  borderless?: boolean;
}) {
  const lines = useMemo(() => {
    const normalized = code.replace(/\r\n/g, '\n');
    // Keep trailing newline stable (VS Code shows an empty last line when present).
    const hasTrailingNewline = normalized.endsWith('\n');
    const rawLines = normalized.split('\n');
    if (!hasTrailingNewline && rawLines.length > 0 && rawLines[rawLines.length - 1] === '') {
      rawLines.pop();
    }
    return rawLines;
  }, [code]);

  const highlighted = useMemo(() => {
    return lines.map((line) => {
      // Highlight per-line so we can render line numbers without breaking HTML spans.
      // This is "good enough" for TS/TSX snippets and keeps the UI simple.
      try {
        return hljs.highlight(line === '' ? ' ' : line, { language, ignoreIllegals: true }).value;
      } catch {
        return escapeHtml(line === '' ? ' ' : line);
      }
    });
  }, [lines, language]);

  const gutterClass = borderless
    ? 'select-none w-7 pr-3 text-right text-[#777777] flex-shrink-0'
    : 'select-none w-10 pr-4 text-right text-[#777777] flex-shrink-0';

  return (
    <div
      className={
        borderless
          ? 'code-block-wrapper code-block-borderless rounded-lg bg-[#1f1f1f] overflow-x-auto'
          : 'code-block-wrapper rounded-lg bg-[#1f1f1f] border border-[#2b2b2b] overflow-x-auto'
      }
    >
      <pre className="m-0 p-0">
        <code className="hljs block font-mono text-[13px] leading-relaxed text-[#cccccc]">
          {highlighted.map((html, i) => (
            <div key={i} className="flex">
              <span className={gutterClass}>
                {i + 1}
              </span>
              <span
                className="whitespace-pre"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

