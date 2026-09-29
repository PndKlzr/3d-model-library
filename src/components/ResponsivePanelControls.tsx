import { PanelLeft, PanelRight } from "lucide-react";
import type { ResponsivePanel } from "../lib/responsivePanels";
import { useI18n } from "../i18n/I18nProvider";

type ResponsivePanelControlsProps = {
  openPanel: ResponsivePanel;
  onToggleFolders: () => void;
  onToggleDetails: () => void;
};

export function ResponsivePanelControls({
  openPanel,
  onToggleFolders,
  onToggleDetails
}: ResponsivePanelControlsProps) {
  const { t } = useI18n();
  return (
    <div className="responsive-panel-controls" role="group" aria-label={t("navigation.panels")}>
      <button className="icon-only responsive-folders-button" type="button"
        onClick={onToggleFolders} aria-label={t("navigation.openFolders")}
        aria-expanded={openPanel === "folders"} title={t("navigation.openFolders")}>
        <PanelLeft size={17} />
      </button>
      <button className="icon-only responsive-details-button" type="button"
        onClick={onToggleDetails} aria-label={t("navigation.openDetails")}
        aria-expanded={openPanel === "details"} title={t("navigation.openDetails")}>
        <PanelRight size={17} />
      </button>
    </div>
  );
}
