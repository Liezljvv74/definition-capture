"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

type ModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Centred panel in a native modal `<dialog>`, which brings the top layer, an
 * inert page behind it and a focus trap for free. Closes on Escape or a press
 * on the backdrop; React decides when, so the dialog never closes itself.
 */
export function Modal({ title, onClose, children }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);

  // A layout effect, so the dialog is modal before the first paint. React has
  // already focused any autoFocus child by now, which is possible only because
  // the `flex` class keeps the not-yet-open dialog displayed; showModal then
  // moves focus to the first focusable element, the close button, so the
  // child's focus is put back.
  useLayoutEffect(() => {
    const dialog = ref.current!;
    const focused = document.activeElement;
    dialog.showModal();
    if (focused instanceof HTMLElement && dialog.contains(focused)) focused.focus();
    return () => dialog.close();
  }, []);

  useEffect(() => {
    // Escape is caught on the keydown rather than in the dialog's cancel
    // event because Chromium makes cancel uncancellable when there has been
    // no click since the last one, and a dialog whose onClose waits out a busy
    // save would then close under React. Cancelling the keydown keeps cancel
    // from firing at all; RefField stops it first to close only its list.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      // The dialog itself is the full-screen, scrolling layer the card sits
      // in, so a press on its own padding is a press on the backdrop. Mouse
      // down rather than click, so a drag that starts inside and ends outside
      // does not close it.
      className="fixed inset-0 z-50 m-0 flex h-full max-h-none w-full max-w-none items-start justify-center overflow-y-auto border-0 bg-transparent p-4 text-ink backdrop:bg-shadow/50 backdrop:backdrop-blur-sm sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      // Any other close request, such as a back gesture.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="card my-auto w-full max-w-lg p-5 sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="hand-title text-xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="btn btn-secondary !px-2 !py-1 text-base leading-none"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
