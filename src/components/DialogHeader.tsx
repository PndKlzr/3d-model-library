import { X } from "lucide-react";

type DialogHeaderProps = {
  eyebrow?: string;
  title: string;
  onClose: () => void;
};

export function DialogHeader({ eyebrow, title, onClose }: DialogHeaderProps) {
  return (
    <header className="dialog-header">
      <div className="dialog-header-copy">
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2 title={title}>{title}</h2>
      </div>
      <button
        className="icon-only dialog-close"
        type="button"
        onClick={onClose}
        aria-label="Fechar"
        title="Fechar"
      >
        <X size={18} />
      </button>
    </header>
  );
}
