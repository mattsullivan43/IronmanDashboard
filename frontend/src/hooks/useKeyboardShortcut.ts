import { useEffect, useCallback } from 'react';

interface ShortcutOptions {
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  preventDefault?: boolean;
}

/**
 * Hook that fires a callback when a keyboard shortcut is pressed.
 *
 * @example
 * useKeyboardShortcut('k', () => openSearch(), { metaKey: true });
 * useKeyboardShortcut('Escape', () => close());
 */
export function useKeyboardShortcut(
  key: string,
  callback: () => void,
  options: ShortcutOptions = {}
): void {
  const {
    ctrlKey = false,
    shiftKey = false,
    altKey = false,
    metaKey = false,
    preventDefault = true,
  } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't fire shortcuts when typing in inputs
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // Allow Escape to always fire
        if (event.key !== 'Escape') return;
      }

      const keyMatch = event.key.toLowerCase() === key.toLowerCase();
      const ctrlMatch = ctrlKey ? event.ctrlKey || event.metaKey : true;
      const shiftMatch = shiftKey ? event.shiftKey : true;
      const altMatch = altKey ? event.altKey : true;
      const metaMatch = metaKey ? event.metaKey || event.ctrlKey : true;

      // Ensure no extra modifiers are pressed when none are specified
      if (!ctrlKey && !metaKey && (event.ctrlKey || event.metaKey) && key !== 'Escape') return;
      if (!shiftKey && event.shiftKey) return;
      if (!altKey && event.altKey) return;

      if (keyMatch && ctrlMatch && shiftMatch && altMatch && metaMatch) {
        if (preventDefault) {
          event.preventDefault();
        }
        callback();
      }
    },
    [key, callback, ctrlKey, shiftKey, altKey, metaKey, preventDefault]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export default useKeyboardShortcut;
