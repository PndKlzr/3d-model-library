import { useEffect, useState } from "react";
import { DialogHeader } from "./DialogHeader";
import { DialogShell } from "./DialogShell";

export type TextInputDialogOptions = {
  title: string;
  label: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel: string;
};

type TextInputDialogProps = TextInputDialogOptions & {
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

export function TextInputDialog({
  title,
  label,
  initialValue = "",
  placeholder,
  confirmLabel,
  onCancel,
  onConfirm
}: TextInputDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  return (
    <DialogShell className="text-input-dialog" title={title} onCancel={onCancel}>
      <DialogHeader eyebrow="Entrada" title={title} onClose={onCancel} />
      <form
        className="text-input-form"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(value);
        }}
      >
        <label>
          <span>{label}</span>
          <input
            autoFocus
            value={value}
            placeholder={placeholder}
            onChange={(event) => setValue(event.currentTarget.value)}
          />
        </label>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={!value.trim()}>
            {confirmLabel}
          </button>
        </div>
      </form>
    </DialogShell>
  );
}
