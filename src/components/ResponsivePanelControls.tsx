import { PanelLeft, PanelRight } from "lucide-react";
import type { ResponsivePanel } from "../lib/responsivePanels";

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
  return (
    <div className="responsive-panel-controls" role="group" aria-label="Painéis">
      <button className="icon-only responsive-folders-button" type="button"
        onClick={onToggleFolders} aria-label="Pastas"
        aria-expanded={openPanel === "folders"} title="Pastas">
        <PanelLeft size={17} />
      </button>
      <button className="icon-only responsive-details-button" type="button"
        onClick={onToggleDetails} aria-label="Detalhes"
        aria-expanded={openPanel === "details"} title="Detalhes">
        <PanelRight size={17} />
      </button>
    </div>
  );
}
