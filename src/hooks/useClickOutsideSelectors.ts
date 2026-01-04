import { useEffect } from 'react';

/**
 * Custom hook to detect clicks outside of elements matching the given CSS selectors.
 * Useful for dropdown menus and popups that need to close when clicking outside.
 * 
 * @param isActive - Whether the hook should be active (e.g., menu is open)
 * @param onClose - Function to call when click outside is detected
 * @param selectors - Array of CSS selectors to check (closest match)
 */
export function useClickOutsideSelectors(
  isActive: boolean,
  onClose: () => void,
  selectors: string[]
): void {
  useEffect(() => {
    if (!isActive) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      
      const clickedInside = selectors.some(sel => target.closest(sel));
      if (!clickedInside) {
        onClose();
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [isActive, onClose, selectors]);
}
