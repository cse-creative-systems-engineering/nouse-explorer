
import { useEffect, useRef } from 'react';

/** Modal focus management: trap Tab inside, restore focus to the trigger on close. */
export function useModalFocus(active: boolean): React.RefObject<HTMLDivElement> {
  const ref = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    lastFocused.current = document.activeElement as HTMLElement;
    // focus the modal itself
    const modal = ref.current;
    modal?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Tab' || !ref.current) return;
      const focusables = ref.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      lastFocused.current?.focus();
    };
  }, [active]);

  return ref;
}
