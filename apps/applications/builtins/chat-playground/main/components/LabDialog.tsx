import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

export function LabDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose(): void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return (
    <dialog
      ref={dialog}
      className="lab-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lab-dialog-content">
        <header className="lab-dialog-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="lab-icon-button"
            aria-label={`关闭${title}`}
            onClick={onClose}
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="lab-dialog-body">{children}</div>
      </div>
    </dialog>
  );
}
