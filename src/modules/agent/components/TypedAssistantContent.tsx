import { useMemo } from 'react';
import { renderMarkdown } from '../../../utils/markdown';
import { useTypedCommittedText } from './useTypedCommittedText';

export default function TypedAssistantContent({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const typed = useTypedCommittedText(text ?? '', {
    isStreaming,
    commitStrategy: 'line',
  });

  const html = useMemo(() => {
    if (!typed) return '';
    return renderMarkdown(typed);
  }, [typed]);

  if (!typed) return null;

  // If we haven't received a full newline yet, `typed` will be empty string.
  if (isStreaming && typed === '') {
    return <span className="text-[#444] italic">…</span>;
  }

  return (
    <div
      className="text-base text-[#b2b2b2] markdown-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

