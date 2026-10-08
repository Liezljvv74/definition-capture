import { useEffect, type RefObject } from "react";

/**
 * Closes something open, a menu or a panel, on a press outside `ref`, on
 * Escape, and on back or forward. Listeners exist only while it is open.
 * `close` is given the event, so a caller can tell an Escape, after which it
 * should put focus back on its trigger, from a press that moves focus itself.
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: (event: Event) => void) {
  useEffect(() => {
    if (!open) return;
    const onPress = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) close(event);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(event);
    };
    const onPop = (event: PopStateEvent) => close(event);
    document.addEventListener("pointerdown", onPress);
    document.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      document.removeEventListener("pointerdown", onPress);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [ref, open, close]);
}
