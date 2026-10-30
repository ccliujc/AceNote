import { useLayoutEffect, useRef, type ReactNode } from 'react';

interface DialogShellProps {
  labelledBy: string;
  busy: boolean;
  onClose: () => void;
  compact?: boolean;
  children: ReactNode;
}
export function DialogShell({
  labelledBy,
  busy,
  onClose,
  compact,
  children,
}: DialogShellProps) {
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef(document.activeElement);
  const options = useRef({ busy, onClose });
  useLayoutEffect(() => {
    options.current = { busy, onClose };
  });
  useLayoutEffect(() => {
    const element = panel.current!;
    const focusable = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (item) =>
          !item.closest('[hidden], [inert]') &&
          item.getAttribute('aria-hidden') !== 'true',
      );
    const first = () => focusable()[0] ?? element;
    const initial =
      element.querySelector<HTMLElement>('[data-autofocus]') ?? first();
    initial.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function keyDown(event: globalThis.KeyboardEvent) {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (!options.current.busy) options.current.onClose();
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const last = items.at(-1) ?? element;
      if (
        !element.contains(document.activeElement) ||
        (event.shiftKey && document.activeElement === first()) ||
        (!event.shiftKey && document.activeElement === last) ||
        items.length === 0
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first()).focus();
      }
    }
    function containFocus(event: FocusEvent) {
      if (!element.contains(event.target as Node)) first().focus();
    }
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener('focusin', containFocus);
    const previous = trigger.current;
    return () => {
      document.removeEventListener('keydown', keyDown, true);
      document.removeEventListener('focusin', containFocus);
      document.body.style.overflow = overflow;
      const target =
        previous instanceof HTMLElement &&
        previous.isConnected &&
        previous !== document.body
          ? previous
          : document.querySelector<HTMLElement>(
              '[aria-label="待办或完成指令"], [aria-label="待办内容"]',
            );
      target?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={panel}
        className={`modal-panel${compact ? ' compact' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-busy={busy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
