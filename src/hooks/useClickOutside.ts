import { useRef, useEffect } from 'react';

/**
 * Custom hook to detect clicks outside of specified elements.
 * Returns refs for the container and trigger elements.
 * 
 * @param callback - Function to call when click outside is detected
 * @param isActive - Whether the hook should be active (e.g., menu is open)
 * @returns Tuple of [containerRef, triggerRef]
 */
export function useClickOutside<T extends HTMLElement = HTMLDivElement>(
  callback: () => void,
  isActive: boolean
): [React.RefObject<T>, React.RefObject<HTMLButtonElement>] {
  const containerRef = useRef<T>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        triggerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isActive, callback]);

  return [containerRef, triggerRef];
}
