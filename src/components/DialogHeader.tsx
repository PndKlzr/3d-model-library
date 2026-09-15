import { X } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";

type DialogHeaderProps = {
  eyebrow?: string;
  title: string;
  onClose: () => void;
};

export function DialogHeader({ eyebrow, title, onClose }: DialogHeaderProps) {
  const { t } = useI18n();
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
        aria-label={t("common.close")}
        title={t("common.close")}
      >
        <X size={18} />
      </button>
    </header>
  );
}
