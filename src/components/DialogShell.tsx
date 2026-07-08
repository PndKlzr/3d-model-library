import { type ReactNode, useEffect, useRef } from "react";

type DialogShellProps = {
  title: string;
  className: string;
  children: ReactNode;
  onCancel: () => void;
};

export function DialogShell({ title, className, children, onCancel }: DialogShellProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null
  );

  useEffect(() => {
    if (
      dialogRef.current &&
      document.activeElement instanceof HTMLElement &&
      !dialogRef.current.contains(document.activeElement)
    ) {
      dialogRef.current?.focus();
    }

    return () => {
      previousFocusRef.current?.focus();
    };
  }, []);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        className={className}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>
  );
}
