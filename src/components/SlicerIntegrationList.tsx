import { Ellipsis, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import type { SlicerConfig } from "../shared/types";
import { useI18n } from "../i18n/I18nProvider";

type Props = {
  slicers: SlicerConfig[];
  defaultSlicerId: string | null;
  detecting: boolean;
  unavailableSlicerIds?: string[];
  openMenuId?: string | null;
  onOpenMenuChange?: (id: string | null) => void;
  onDetect: () => void;
  onAdd: () => void;
  onEnable: (id: string, enabled: boolean) => void;
  onDefault: (id: string) => void;
  onChooseExecutable: (id: string) => void;
  onRename: (id: string) => void;
  onRemove: (id: string) => void;
};

export function SlicerIntegrationList({
  slicers, defaultSlicerId, detecting, unavailableSlicerIds = [], openMenuId, onOpenMenuChange,
  onDetect, onAdd, onEnable, onDefault,
  onChooseExecutable, onRename, onRemove
}: Props) {
  const { t } = useI18n();
  const [localMenuId, setLocalMenuId] = useState<string | null>(null);
  const menuId = openMenuId === undefined ? localMenuId : openMenuId;
  const setMenuId = onOpenMenuChange ?? setLocalMenuId;

  useEffect(() => {
    if (!menuId || onOpenMenuChange) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLocalMenuId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuId, onOpenMenuChange]);

  return (
    <div className="slicer-integrations">
      <div className="slicer-integrations-toolbar">
        <button type="button" onClick={onDetect} disabled={detecting}>
          <RefreshCw size={15} aria-hidden="true" />
          {detecting ? t("slicer.detecting") : t("slicer.detectAgain")}
        </button>
        <button type="button" onClick={onAdd}>
          <Plus size={15} aria-hidden="true" /> {t("slicer.addProgram")}
        </button>
      </div>
      <div className="slicer-integration-list">
        {slicers.map((slicer) => {
          const unavailable = unavailableSlicerIds.includes(slicer.id);
          const statusKey = unavailable
            ? "slicer.unavailable"
            : !slicer.executablePath
            ? "slicer.unconfigured"
            : slicer.pathSource === "detected" ? "slicer.found" : "slicer.manual";
          return (
            <div className="slicer-integration-row" key={slicer.id}>
              <div className="slicer-integration-identity">
                <strong>{slicer.name}</strong>
                <span className={`slicer-status ${unavailable ? "unavailable" : slicer.executablePath ? "configured" : ""}`}>
                  {t(statusKey)}
                </span>
                <small title={slicer.executablePath}>{slicer.executablePath || t("settings.slicerNotConfigured")}</small>
              </div>
              <label className="slicer-integration-choice">
                <input type="checkbox" checked={slicer.enabled}
                  disabled={!slicer.executablePath || unavailable}
                  onChange={(event) => onEnable(slicer.id, event.currentTarget.checked)} />
                {t("common.active")}
              </label>
              <label className="slicer-integration-choice">
                <input type="radio" name="default-slicer"
                  checked={defaultSlicerId === slicer.id}
                  disabled={!slicer.enabled || !slicer.executablePath || unavailable}
                  aria-label={`${slicer.name}: ${t("common.default")}`}
                  onChange={() => onDefault(slicer.id)} />
                {t("common.default")}
              </label>
              <div className="slicer-integration-menu-wrap">
                <button className="icon-only small-icon" type="button"
                  aria-label={t("slicer.actions", { name: slicer.name })}
                  title={t("slicer.actions", { name: slicer.name })}
                  aria-expanded={menuId === slicer.id}
                  onClick={() => setMenuId(menuId === slicer.id ? null : slicer.id)}>
                  <Ellipsis size={17} />
                </button>
                {menuId === slicer.id ? (
                  <div className="slicer-integration-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => {
                      setMenuId(null); onChooseExecutable(slicer.id);
                    }}>{t("slicer.chooseExecutable")}</button>
                    {slicer.kind === "custom" ? <>
                      <button type="button" role="menuitem" onClick={() => {
                        setMenuId(null); onRename(slicer.id);
                      }}>{t("common.rename")}</button>
                      <button type="button" role="menuitem" onClick={() => {
                        setMenuId(null); onRemove(slicer.id);
                      }}>{t("slicer.remove")}</button>
                    </> : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
