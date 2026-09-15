import { Activity, Archive, FolderOpen, Plug, Tags } from "lucide-react";
import { useState, type ReactNode } from "react";
import { DialogHeader } from "./DialogHeader";
import { DialogShell } from "./DialogShell";
import type { ThemeMode } from "../lib/viewPreferences";
import type { AppSettings, SlicerConfig } from "../shared/types";
import type { ThumbnailDiagnosticsSnapshot } from "../lib/thumbnailDiagnostics";
import {
  setDefaultSlicer,
  setSlicerEnabled,
  type AppSettingsMutation
} from "../lib/settingsMutations";
import { PerformanceDiagnostics } from "./PerformanceDiagnostics";
import { useI18n } from "../i18n/I18nProvider";
import { SlicerIntegrationList } from "./SlicerIntegrationList";

type SettingsDialogProps = {
  settings: AppSettings;
  tagCatalog: string[];
  metadataWritable: boolean;
  metadataMessage: string | null;
  thumbnailDiagnostics: ThumbnailDiagnosticsSnapshot;
  onClose: () => void;
  onSaveSettings: (mutation: AppSettingsMutation) => Promise<void>;
  onChooseLibraryFolder: () => Promise<void>;
  onChooseArchiveExtractor: () => Promise<void>;
  onChooseSlicerExecutable: (slicerId: SlicerConfig["id"]) => Promise<void>;
  detectingSlicers: boolean;
  unavailableSlicerIds: string[];
  onDetectSlicers: () => Promise<void>;
  onAddSlicer: () => Promise<void>;
  onRenameSlicer: (slicerId: string) => Promise<void>;
  onRemoveSlicer: (slicerId: string) => Promise<void>;
  onAddCatalogTag: () => Promise<void>;
  onRemoveCatalogTag: (tag: string) => Promise<void>;
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
};

type SettingsTab = "library" | "organization" | "integrations" | "diagnostics";

export function SettingsDialog({
  settings,
  tagCatalog,
  metadataWritable,
  metadataMessage,
  thumbnailDiagnostics,
  onClose,
  onSaveSettings,
  onChooseLibraryFolder,
  onChooseArchiveExtractor,
  onChooseSlicerExecutable,
  detectingSlicers,
  unavailableSlicerIds,
  onDetectSlicers,
  onAddSlicer,
  onRenameSlicer,
  onRemoveSlicer,
  onAddCatalogTag,
  onRemoveCatalogTag,
  themeMode,
  onThemeModeChange
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("library");
  const [openSlicerMenuId, setOpenSlicerMenuId] = useState<string | null>(null);
  const { t } = useI18n();

  const cancelSettings = () => {
    if (openSlicerMenuId) setOpenSlicerMenuId(null);
    else onClose();
  };

  const selectTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    setOpenSlicerMenuId(null);
  };

  return (
    <DialogShell className="settings-dialog" title={t("common.settings")} onCancel={cancelSettings}>
      <DialogHeader
        eyebrow={t("common.settings")}
        title={t("settings.title")}
        onClose={onClose}
      />

      <nav className="settings-tabs" role="tablist" aria-label={t("settings.categories")}>
        <SettingsTabButton
          active={activeTab === "library"}
          icon={<FolderOpen size={16} />}
          label={t("settings.tabLibrary")}
          onClick={() => selectTab("library")}
        />
        <SettingsTabButton
          active={activeTab === "organization"}
          icon={<Tags size={16} />}
          label={t("settings.tabOrganization")}
          onClick={() => selectTab("organization")}
        />
        <SettingsTabButton
          active={activeTab === "integrations"}
          icon={<Plug size={16} />}
          label={t("settings.tabIntegrations")}
          onClick={() => selectTab("integrations")}
        />
        <SettingsTabButton
          active={activeTab === "diagnostics"}
          icon={<Activity size={16} />}
          label={t("settings.tabPerformance")}
          onClick={() => selectTab("diagnostics")}
        />
      </nav>

      <div className="settings-content" role="tabpanel">
        {activeTab === "library" ? (
          <LibrarySettings
            settings={settings}
            themeMode={themeMode}
            onSaveSettings={onSaveSettings}
            onChooseLibraryFolder={onChooseLibraryFolder}
            onThemeModeChange={onThemeModeChange}
          />
        ) : null}

        {activeTab === "organization" ? (
          <OrganizationSettings
            settings={settings}
            tagCatalog={tagCatalog}
            metadataWritable={metadataWritable}
            metadataMessage={metadataMessage}
            onSaveSettings={onSaveSettings}
            onAddCatalogTag={onAddCatalogTag}
            onRemoveCatalogTag={onRemoveCatalogTag}
          />
        ) : null}

        {activeTab === "integrations" ? (
          <IntegrationSettings
            settings={settings}
            onSaveSettings={onSaveSettings}
            onChooseArchiveExtractor={onChooseArchiveExtractor}
            onChooseSlicerExecutable={onChooseSlicerExecutable}
            detectingSlicers={detectingSlicers}
            unavailableSlicerIds={unavailableSlicerIds}
            openSlicerMenuId={openSlicerMenuId}
            onOpenSlicerMenuChange={setOpenSlicerMenuId}
            onDetectSlicers={onDetectSlicers}
            onAddSlicer={onAddSlicer}
            onRenameSlicer={onRenameSlicer}
            onRemoveSlicer={onRemoveSlicer}
          />
        ) : null}

        {activeTab === "diagnostics" ? (
          <PerformanceDiagnostics snapshot={thumbnailDiagnostics} />
        ) : null}
      </div>
    </DialogShell>
  );
}

function SettingsTabButton({
  active,
  icon,
  label,
  onClick
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={active ? "active" : ""}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function LibrarySettings({
  settings,
  themeMode,
  onSaveSettings,
  onChooseLibraryFolder,
  onThemeModeChange
}: Pick<
  SettingsDialogProps,
  "settings" | "themeMode" | "onSaveSettings" | "onChooseLibraryFolder" | "onThemeModeChange"
>) {
  const { t } = useI18n();
  return (
    <>
      <section className="settings-section">
        <SettingsSectionCopy
          title={t("settings.libraryFolder")}
          description={t("settings.libraryDescription")}
        />
        <div className="path-row">
          <FolderOpen size={17} />
          <span>{settings.libraryPath ?? t("settings.noLibraryFolder")}</span>
          <button type="button" onClick={onChooseLibraryFolder}>{t("settings.change")}</button>
        </div>
      </section>

      <section className="settings-section">
        <SettingsSectionCopy
          title={t("settings.navigationTitle")}
          description={t("settings.navigationDescription")}
        />
        <label className="toggle-row settings-toggle">
          <input
            type="checkbox"
            checked={settings.includeSubfolders}
            onChange={(event) => {
              const includeSubfolders = event.currentTarget.checked;
              void onSaveSettings((current) => ({ ...current, includeSubfolders }));
            }}
          />
          <span>{t("settings.includeSubfolders")}</span>
        </label>
        <label className="toggle-row settings-toggle">
          <input
            type="checkbox"
            checked={settings.monitorLibrary}
            onChange={(event) => {
              const monitorLibrary = event.currentTarget.checked;
              void onSaveSettings((current) => ({ ...current, monitorLibrary }));
            }}
          />
          <span>{t("settings.monitor")}</span>
        </label>
        <label className="toggle-row settings-toggle">
          <input
            type="checkbox"
            checked={themeMode === "dark"}
            onChange={(event) =>
              onThemeModeChange(event.currentTarget.checked ? "dark" : "light")
            }
          />
          <span>{t("settings.darkMode")}</span>
        </label>
        <label className="settings-field-row">
          <span>{t("settings.language")}</span>
          <select
            value={settings.locale}
            onChange={(event) => {
              const locale = event.currentTarget.value as AppSettings["locale"];
              void onSaveSettings((current) => ({ ...current, locale }));
            }}
          >
            <option value="pt-BR">{t("settings.languagePortuguese")}</option>
            <option value="en">{t("settings.languageEnglish")}</option>
          </select>
        </label>
      </section>
    </>
  );
}

function OrganizationSettings({
  settings,
  tagCatalog,
  metadataWritable,
  metadataMessage,
  onSaveSettings,
  onAddCatalogTag,
  onRemoveCatalogTag
}: Pick<
  SettingsDialogProps,
  | "settings"
  | "tagCatalog"
  | "metadataWritable"
  | "metadataMessage"
  | "onSaveSettings"
  | "onAddCatalogTag"
  | "onRemoveCatalogTag"
>) {
  const { t } = useI18n();
  return (
    <>
      <section className="settings-section">
        <SettingsSectionCopy
          title={t("settings.dragTitle")}
          description={t("settings.dragDescription")}
        />
        <div className="drag-behavior-options" role="radiogroup" aria-label={t("settings.dragBehavior")}>
          <DragBehaviorOption
            checked={settings.fileDragBehavior === "organize-default"}
            title={t("settings.organizeDefault")}
            description={t("settings.organizeDefaultDescription")}
            onChange={() => onSaveSettings((current) => ({
              ...current,
              fileDragBehavior: "organize-default"
            }))}
          />
          <DragBehaviorOption
            checked={settings.fileDragBehavior === "external-default"}
            title={t("settings.externalDefault")}
            description={t("settings.externalDefaultDescription")}
            onChange={() => onSaveSettings((current) => ({
              ...current,
              fileDragBehavior: "external-default"
            }))}
          />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <SettingsSectionCopy
            title={t("tags.label")}
            description={t("settings.tagsDescription")}
          />
          <button
            type="button"
            onClick={onAddCatalogTag}
            disabled={!metadataWritable}
            title={!metadataWritable ? metadataMessage ?? t("tags.unavailable") : undefined}
          >
            {t("settings.newTag")}
          </button>
        </div>
        <div className="tag-settings-list">
          {tagCatalog.length > 0 ? (
            tagCatalog.map((tag) => (
              <div className="tag-settings-row" key={tag}>
                <span>{tag}</span>
                <button
                  type="button"
                  onClick={() => onRemoveCatalogTag(tag)}
                  disabled={!metadataWritable}
                  title={!metadataWritable ? metadataMessage ?? t("tags.unavailable") : undefined}
                >
                  {t("common.delete")}
                </button>
              </div>
            ))
          ) : (
            <p>{t("settings.noTags")}</p>
          )}
        </div>
      </section>
    </>
  );
}

function IntegrationSettings({
  settings,
  onSaveSettings,
  onChooseArchiveExtractor,
  onChooseSlicerExecutable,
  detectingSlicers,
  unavailableSlicerIds,
  openSlicerMenuId,
  onOpenSlicerMenuChange,
  onDetectSlicers,
  onAddSlicer,
  onRenameSlicer,
  onRemoveSlicer
}: Pick<
  SettingsDialogProps,
  "settings" | "onSaveSettings" | "onChooseArchiveExtractor" | "onChooseSlicerExecutable"
  | "detectingSlicers" | "unavailableSlicerIds"
  | "onDetectSlicers" | "onAddSlicer" | "onRenameSlicer" | "onRemoveSlicer"
> & {
  openSlicerMenuId: string | null;
  onOpenSlicerMenuChange: (id: string | null) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <section className="settings-section">
        <SettingsSectionCopy
          title={t("settings.slicers")}
          description={t("settings.slicersDescription")}
        />
        <SlicerIntegrationList
          slicers={settings.slicers}
          defaultSlicerId={settings.defaultSlicerId}
          detecting={detectingSlicers}
          unavailableSlicerIds={unavailableSlicerIds}
          openMenuId={openSlicerMenuId}
          onOpenMenuChange={onOpenSlicerMenuChange}
          onDetect={() => void onDetectSlicers()}
          onAdd={() => void onAddSlicer()}
          onEnable={(id, enabled) => void onSaveSettings(setSlicerEnabled(id, enabled))}
          onDefault={(id) => void onSaveSettings(setDefaultSlicer(id))}
          onChooseExecutable={(id) => void onChooseSlicerExecutable(id)}
          onRename={(id) => void onRenameSlicer(id)}
          onRemove={(id) => void onRemoveSlicer(id)}
        />
      </section>

      <section className="settings-section">
        <SettingsSectionCopy
          title={t("settings.archives")}
          description={t("settings.archivesDescription")}
        />
        <div className={`path-row ${settings.archiveExtractorPath ? "has-secondary-action" : ""}`}>
          <Archive size={17} />
          <span>
            {settings.archiveExtractorPath ||
              t("settings.archiveAutomaticPath")}
          </span>
          <button type="button" onClick={onChooseArchiveExtractor}>{t("settings.choose7Zip")}</button>
          {settings.archiveExtractorPath ? (
            <button
              type="button"
              onClick={() => onSaveSettings((current) => ({
                ...current,
                archiveExtractorPath: ""
              }))}
            >
              {t("common.automatic")}
            </button>
          ) : null}
        </div>
      </section>
    </>
  );
}

function SettingsSectionCopy({ title, description }: { title: string; description: string }) {
  return (
    <div className="settings-section-copy">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}

function DragBehaviorOption({
  checked,
  title,
  description,
  onChange
}: {
  checked: boolean;
  title: string;
  description: string;
  onChange: () => void;
}) {
  return (
    <label className={checked ? "selected" : ""}>
      <input
        type="radio"
        name="file-drag-behavior"
        checked={checked}
        onChange={onChange}
      />
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </label>
  );
}
