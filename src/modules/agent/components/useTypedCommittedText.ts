import { useEffect, useMemo, useRef, useState } from 'react';

function commitByLastNewline(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n');
  const lastNewline = normalized.lastIndexOf('\n');
  if (lastNewline === -1) return '';
  return normalized.slice(0, lastNewline + 1);
}

export function useTypedCommittedText(
  source: string | null,
  opts: {
    isStreaming: boolean;
    commitStrategy: 'line' | 'none';
    charsPerSecond?: number; // default ~220 cps
    maxCharsPerFrame?: number; // default 24
  },
): string | null {
  const targetCommitted = useMemo(() => {
    if (source === null) return null;
    if (!opts.isStreaming) return source;
    if (opts.commitStrategy === 'line') return commitByLastNewline(source);
    return source;
  }, [source, opts.isStreaming, opts.commitStrategy]);

  const [typed, setTyped] = useState<string>('');
  const typedRef = useRef<string>('');
  const targetRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);

  // Keep refs in sync.
  useEffect(() => {
    typedRef.current = typed;
  }, [typed]);

  const cancelAnim = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  useEffect(() => {
    return () => cancelAnim();
  }, []);

  useEffect(() => {
    targetRef.current = targetCommitted;

    if (targetCommitted === null) {
      cancelAnim();
      if (typedRef.current !== '') setTyped('');
      return;
    }

    // When not streaming, flush immediately.
    if (!opts.isStreaming) {
      cancelAnim();
      if (typedRef.current !== targetCommitted) setTyped(targetCommitted);
      return;
    }

    // If the source has changed in a non-monotonic way, snap to the new target.
    if (!targetCommitted.startsWith(typedRef.current)) {
      cancelAnim();
      setTyped(targetCommitted);
      return;
    }

    if (typedRef.current === targetCommitted) {
      cancelAnim();
      return;
    }

    if (rafRef.current !== null) return;
    lastTsRef.current = 0;

    const cps = opts.charsPerSecond ?? 220;
    const maxPerFrame = opts.maxCharsPerFrame ?? 24;

    const step = (ts: number) => {
      rafRef.current = null;

      const target = targetRef.current ?? '';
      const current = typedRef.current;
      if (current.length >= target.length) return;

      const lastTs = lastTsRef.current || ts;
      const dt = ts - lastTs;
      lastTsRef.current = ts;

      const charsToAdd = Math.min(maxPerFrame, Math.max(1, Math.floor(dt * (cps / 1000))));
      const nextLen = Math.min(target.length, current.length + charsToAdd);
      const next = target.slice(0, nextLen);
      if (next !== current) setTyped(next);

      if (nextLen < target.length) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);
  }, [targetCommitted, opts.isStreaming, opts.charsPerSecond, opts.maxCharsPerFrame]);

  return targetCommitted === null ? null : opts.isStreaming ? typed : targetCommitted;
}

