import { CodeBlock } from '../../../components/CodeBlock';
import { useTypedCommittedText } from './useTypedCommittedText';

function decodePossiblyPartialJsonString(encoded: string): string {
  // Decode common JSON string escapes, but tolerate incomplete sequences during streaming.
  // Supports: \n \r \t \b \f \\ \" and \uXXXX (only when complete).
  let out = '';
  for (let i = 0; i < encoded.length; i++) {
    const ch = encoded[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }

    const next = encoded[i + 1];
    if (next === undefined) {
      // Trailing backslash while streaming.
      out += '\\';
      continue;
    }

    switch (next) {
      case 'n':
        out += '\n';
        i++;
        break;
      case 'r':
        out += '\r';
        i++;
        break;
      case 't':
        out += '\t';
        i++;
        break;
      case 'b':
        out += '\b';
        i++;
        break;
      case 'f':
        out += '\f';
        i++;
        break;
      case '\\':
        out += '\\';
        i++;
        break;
      case '"':
        out += '"';
        i++;
        break;
      case 'u': {
        const hex = encoded.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          out += String.fromCharCode(parseInt(hex, 16));
          i += 5;
        } else {
          // Incomplete/invalid unicode escape during streaming; keep as-is.
          out += '\\u';
          i++;
        }
        break;
      }
      default:
        // Unknown escape, keep literal.
        out += next;
        i++;
        break;
    }
  }
  return out;
}

function extractStreamingJsonStringField(
  jsonText: string,
  fieldName: string,
): { value: string; isComplete: boolean } | null {
  // Extract a JSON string field even if the overall JSON is incomplete.
  // Example: {"code":"... (streaming) ..."}
  const key = `"${fieldName}"`;
  const keyIdx = jsonText.indexOf(key);
  if (keyIdx === -1) return null;

  // Find the ':' after the key.
  let i = keyIdx + key.length;
  while (i < jsonText.length && /\s/.test(jsonText.charAt(i))) i++;
  if (jsonText[i] !== ':') return null;
  i++;
  while (i < jsonText.length && /\s/.test(jsonText.charAt(i))) i++;
  if (jsonText[i] !== '"') return null;
  i++; // start of string

  let raw = '';
  let escaped = false;
  for (; i < jsonText.length; i++) {
    const ch = jsonText.charAt(i);
    if (escaped) {
      raw += `\\${ch}`;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      // End of string.
      return { value: decodePossiblyPartialJsonString(raw), isComplete: true };
    }
    raw += ch;
  }

  // Unterminated string (still streaming).
  return { value: decodePossiblyPartialJsonString(raw), isComplete: false };
}

function extractRunCode(input: string): string | null {
  // Prefer full JSON parsing when possible.
  try {
    const parsed = JSON.parse((input ?? '').trim());
    if (parsed && typeof parsed === 'object' && typeof (parsed as { code?: unknown }).code === 'string') {
      return (parsed as { code: string }).code;
    }
  } catch {
    // Streaming case: JSON may be incomplete.
  }

  const extracted = extractStreamingJsonStringField(input ?? '', 'code');
  if (!extracted) return null;
  return extracted.value;
}

export default function RunCode({
  input,
  output,
  isStreaming = false,
}: {
  input: string;
  output?: string | null;
  isStreaming?: boolean;
}) {
  const code = extractRunCode(input);
  const displayCode = useTypedCommittedText(code, {
    isStreaming,
    commitStrategy: 'line',
  });

  return (
    <div className="assistant-bubble mb-3">
      <div className="text-sm font-medium text-[#888] tracking-wide">
        <span className={isStreaming ? 'shimmer-text' : ''}>Running code</span>
      </div>

      <div className="mt-2">
        {displayCode === null ? (
          <span className="text-[#444] italic">—</span>
        ) : displayCode === '' ? (
          <span className="text-[#444] italic">…</span>
        ) : (
          <CodeBlock code={displayCode} language="typescript" borderless />
        )}
      </div>

      <div className="mt-2">
        <div className="text-xs font-medium text-[#555] uppercase tracking-wider mb-1">Output</div>
        <pre className="text-xs text-[#c8c8c8] whitespace-pre-wrap break-words overflow-x-auto sidebar-scrollbar">
          {output ? output : <span className="text-[#444] italic">{isStreaming ? '…' : '—'}</span>}
        </pre>
      </div>
    </div>
  );
}

