import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
export function Modal({
  title,
  close,
  children,
  busy = false,
}: {
  title: string;
  close(): void;
  children: ReactNode;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLElement>("input,select")?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="lab-modal"
      aria-label={title}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else close();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          className="icon-button"
          aria-label="关闭弹窗"
          disabled={busy}
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
