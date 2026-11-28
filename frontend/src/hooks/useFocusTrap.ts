import { useEffect, type RefObject } from 'react';

const FOCUSABLE =
  'button, a[href], input, select, textarea, [tabindex], [contenteditable="true"]';

function tabStops(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    element =>
      element.tabIndex >= 0 &&
      !element.matches(':disabled, [type="hidden"]') &&
      !element.closest('[hidden], [inert]') &&
      getComputedStyle(element).visibility === 'visible' &&
      getComputedStyle(element).display !== 'none',
  );
}

export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const container = ref.current;
    if (!active || !container) return;

    const trigger = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function keepFocusInside(event: FocusEvent) {
      if (event.target instanceof Node && container && !container.contains(event.target)) {
        (tabStops(container)[0] ?? container).focus();
      }
    }

    function wrapTab(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !container) return;
      const stops = tabStops(container);
      const edge = event.shiftKey ? stops[0] : stops[stops.length - 1];
      if (!stops.includes(document.activeElement as HTMLElement) || document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? stops[stops.length - 1] ?? container : stops[0] ?? container).focus();
      }
    }

    (tabStops(container)[0] ?? container).focus();
    document.addEventListener('focusin', keepFocusInside);
    document.addEventListener('keydown', wrapTab);
    return () => {
      document.removeEventListener('focusin', keepFocusInside);
      document.removeEventListener('keydown', wrapTab);
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [active, ref]);

  // Buttons can become disabled or be replaced when the signing state changes.
  useEffect(() => {
    const container = ref.current;
    const focused = document.activeElement;
    if (active && container && (!container.contains(focused) || focused?.matches(':disabled'))) {
      (tabStops(container)[0] ?? container).focus();
    }
  });
}
