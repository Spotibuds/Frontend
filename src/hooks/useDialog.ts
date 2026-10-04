import { useEffect, useRef } from "react";
let scrollLocks = 0;
let previousOverflow = "";
export function useDialog(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current;
    if (!dialog) return;
    if (scrollLocks++ === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    const siblings: Array<[HTMLElement, boolean]> = [];
    let branch: HTMLElement = dialog;
    while (branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (
          sibling !== branch &&
          sibling instanceof HTMLElement &&
          sibling.dataset.dialogBackdrop !== "true" &&
          !["SCRIPT", "STYLE", "LINK"].includes(sibling.tagName)
        ) {
          siblings.push([sibling, sibling.inert]);
          sibling.inert = true;
        }
      }
      if (branch.parentElement === document.body) break;
      branch = branch.parentElement;
    }
    const overlay = dialog.parentElement;
    const dismiss = (event: MouseEvent) => {
      if (event.target === overlay) closeRef.current();
    };
    overlay?.addEventListener("click", dismiss);
    const focusables = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]'
        )
      ).filter(element => element.getClientRects().length > 0);
    (focusables()[0] || dialog).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key === "Tab") {
        const elements = focusables();
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) {
          event.preventDefault();
          dialog.focus();
          return;
        }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    dialog.addEventListener("keydown", keydown);
    return () => {
      dialog.removeEventListener("keydown", keydown);
      overlay?.removeEventListener("click", dismiss);
      for (const [element, inert] of siblings) element.inert = inert;
      if (--scrollLocks === 0) document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open]);
  return ref;
}
