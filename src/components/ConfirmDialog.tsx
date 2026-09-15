import { DialogHeader } from "./DialogHeader";
import { DialogShell } from "./DialogShell";

export type ConfirmDialogOptions = {
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "default" | "danger";
};

type ConfirmDialogProps = ConfirmDialogOptions & {
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  tone = "default",
  onCancel,
  onConfirm
}: ConfirmDialogProps) {
  return (
    <DialogShell className="confirm-dialog" title={title} onCancel={onCancel}>
      <DialogHeader eyebrow="Confirmar" title={title} onClose={onCancel} />
      <p>{message}</p>
      <div className="dialog-actions">
        <button className="secondary-button" type="button" onClick={onCancel} autoFocus>
          Cancelar
        </button>
        <button
          className={tone === "danger" ? "danger-button" : "primary-button"}
          type="button"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </DialogShell>
  );
}
