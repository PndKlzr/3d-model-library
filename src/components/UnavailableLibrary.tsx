import { FolderOpen, HardDrive, RotateCw } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import type { ThemeMode } from "../lib/viewPreferences";

type UnavailableLibraryProps = {
  libraryPath: string;
  retrying: boolean;
  themeMode: ThemeMode;
  onRetry: () => void;
  onChooseFolder: () => void;
};

export function UnavailableLibrary({
  libraryPath,
  retrying,
  themeMode,
  onRetry,
  onChooseFolder
}: UnavailableLibraryProps) {
  const { t } = useI18n();

  return (
    <main className="first-run" data-theme={themeMode}>
      <section className="first-run-panel unavailable-library-panel">
        <HardDrive aria-hidden="true" />
        <p className="eyebrow">{t("unavailableLibrary.eyebrow")}</p>
        <h1>{t("unavailableLibrary.title")}</h1>
        <p>{t("unavailableLibrary.description")}</p>
        <code title={libraryPath}>{libraryPath}</code>
        <div className="unavailable-library-actions">
          <button type="button" onClick={onRetry} disabled={retrying}>
            <RotateCw aria-hidden="true" />
            {retrying ? t("unavailableLibrary.retrying") : t("common.retry")}
          </button>
          <button type="button" className="secondary" onClick={onChooseFolder}>
            <FolderOpen aria-hidden="true" />
            {t("unavailableLibrary.choose")}
          </button>
        </div>
      </section>
    </main>
  );
}
