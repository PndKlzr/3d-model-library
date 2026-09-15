import type { ThemeMode } from "../lib/viewPreferences";
import { useI18n } from "../i18n/I18nProvider";

type FirstRunProps = {
  onChooseFolder: () => Promise<void>;
  themeMode: ThemeMode;
};

export function FirstRun({ onChooseFolder, themeMode }: FirstRunProps) {
  const { t } = useI18n();
  return (
    <main className="first-run" data-theme={themeMode}>
      <div className="first-run-panel">
        <p className="eyebrow">{t("firstRun.eyebrow")}</p>
        <h1>{t("firstRun.title")}</h1>
        <p>{t("firstRun.description")}</p>
        <button type="button" onClick={onChooseFolder}>
          {t("firstRun.choose")}
        </button>
      </div>
    </main>
  );
}
