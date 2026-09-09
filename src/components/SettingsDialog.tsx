import { Archive, FolderOpen, Plug, Settings, Tags, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { DialogShell } from "./DialogShell";
import type { ThemeMode } from "../lib/viewPreferences";
import type { AppSettings, SlicerConfig } from "../shared/types";

type SettingsDialogProps = {
  settings: AppSettings;
  tagCatalog: string[];
  onClose: () => void;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  onChooseLibraryFolder: () => Promise<void>;
  onChooseArchiveExtractor: () => Promise<void>;
  onChooseSlicerExecutable: (slicer: SlicerConfig) => Promise<void>;
  onAddCatalogTag: () => Promise<void>;
  onRemoveCatalogTag: (tag: string) => Promise<void>;
  themeMode: ThemeMode;
  onThemeModeChange: (themeMode: ThemeMode) => void;
};

type SettingsTab = "library" | "organization" | "integrations";

export function SettingsDialog({
  settings,
  tagCatalog,
  onClose,
  onSaveSettings,
  onChooseLibraryFolder,
  onChooseArchiveExtractor,
  onChooseSlicerExecutable,
  onAddCatalogTag,
  onRemoveCatalogTag,
  themeMode,
  onThemeModeChange
}: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("library");

  return (
    <DialogShell className="settings-dialog" title="Configurações" onCancel={onClose}>
      <header className="dialog-header settings-dialog-header">
        <div>
          <p className="eyebrow">Configurações</p>
          <h2>Preferências do aplicativo</h2>
        </div>
        <button
          className="icon-only"
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          title="Fechar"
        >
          <X size={18} />
        </button>
      </header>

      <nav className="settings-tabs" role="tablist" aria-label="Categorias de configurações">
        <SettingsTabButton
          active={activeTab === "library"}
          icon={<FolderOpen size={16} />}
          label="Biblioteca"
          onClick={() => setActiveTab("library")}
        />
        <SettingsTabButton
          active={activeTab === "organization"}
          icon={<Tags size={16} />}
          label="Organização"
          onClick={() => setActiveTab("organization")}
        />
        <SettingsTabButton
          active={activeTab === "integrations"}
          icon={<Plug size={16} />}
          label="Integrações"
          onClick={() => setActiveTab("integrations")}
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
          />
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
  return (
    <>
      <section className="settings-section">
        <SettingsSectionCopy
          title="Pasta da biblioteca"
          description="Local onde o aplicativo procura modelos e subpastas."
        />
        <div className="path-row">
          <FolderOpen size={17} />
          <span>{settings.libraryPath ?? "Nenhuma pasta escolhida"}</span>
          <button type="button" onClick={onChooseLibraryFolder}>Trocar</button>
        </div>
      </section>

      <section className="settings-section">
        <SettingsSectionCopy
          title="Navegação e aparência"
          description="Ajustes gerais da biblioteca visual."
        />
        <label className="toggle-row settings-toggle">
          <input
            type="checkbox"
            checked={settings.includeSubfolders}
            onChange={(event) =>
              onSaveSettings({ ...settings, includeSubfolders: event.currentTarget.checked })
            }
          />
          <span>Incluir subpastas ao filtrar uma pasta</span>
        </label>
        <label className="toggle-row settings-toggle">
          <input
            type="checkbox"
            checked={settings.monitorLibrary}
            onChange={(event) =>
              onSaveSettings({ ...settings, monitorLibrary: event.currentTarget.checked })
            }
          />
          <span>Monitorar alterações automaticamente</span>
        </label>
        <label className="toggle-row settings-toggle">
          <input
            type="checkbox"
            checked={themeMode === "dark"}
            onChange={(event) =>
              onThemeModeChange(event.currentTarget.checked ? "dark" : "light")
            }
          />
          <span>Modo escuro</span>
        </label>
      </section>
    </>
  );
}

function OrganizationSettings({
  settings,
  tagCatalog,
  onSaveSettings,
  onAddCatalogTag,
  onRemoveCatalogTag
}: Pick<
  SettingsDialogProps,
  "settings" | "tagCatalog" | "onSaveSettings" | "onAddCatalogTag" | "onRemoveCatalogTag"
>) {
  return (
    <>
      <section className="settings-section">
        <SettingsSectionCopy
          title="Arraste de arquivos"
          description="Escolha qual ação acontece sem pressionar nenhuma tecla."
        />
        <div className="drag-behavior-options" role="radiogroup" aria-label="Comportamento do arraste">
          <DragBehaviorOption
            checked={settings.fileDragBehavior === "organize-default"}
            title="Organizar por padrão"
            description="Arrastar move para pastas; Ctrl + arrastar copia para fora."
            onChange={() => onSaveSettings({ ...settings, fileDragBehavior: "organize-default" })}
          />
          <DragBehaviorOption
            checked={settings.fileDragBehavior === "external-default"}
            title="Enviar por padrão"
            description="Arrastar copia para fora; Shift + arrastar move para pastas."
            onChange={() => onSaveSettings({ ...settings, fileDragBehavior: "external-default" })}
          />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <SettingsSectionCopy
            title="Tags"
            description="Categorias disponíveis para classificar modelos."
          />
          <button type="button" onClick={onAddCatalogTag}>Nova tag</button>
        </div>
        <div className="tag-settings-list">
          {tagCatalog.length > 0 ? (
            tagCatalog.map((tag) => (
              <div className="tag-settings-row" key={tag}>
                <span>{tag}</span>
                <button type="button" onClick={() => onRemoveCatalogTag(tag)}>Excluir</button>
              </div>
            ))
          ) : (
            <p>Nenhuma tag predefinida.</p>
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
  onChooseSlicerExecutable
}: Pick<
  SettingsDialogProps,
  "settings" | "onSaveSettings" | "onChooseArchiveExtractor" | "onChooseSlicerExecutable"
>) {
  return (
    <>
      <section className="settings-section">
        <SettingsSectionCopy
          title="Slicers"
          description="Programas disponíveis para abrir STL e 3MF. O Slicer padrão recebe o duplo clique."
        />
        <div className="slicer-list">
          {settings.slicers.map((slicer) => (
            <div className="slicer-row" key={slicer.id}>
              <Settings size={17} />
              <div>
                <strong>{slicer.name}</strong>
                <span>{slicer.executablePath || "Executável não configurado"}</span>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={slicer.enabled}
                  onChange={(event) =>
                    onSaveSettings({
                      ...settings,
                      slicers: settings.slicers.map((item) =>
                        item.id === slicer.id
                          ? { ...item, enabled: event.currentTarget.checked }
                          : item
                      )
                    })
                  }
                />
                Ativo
              </label>
              <label>
                <input
                  type="radio"
                  name="default-slicer"
                  checked={settings.defaultSlicerId === slicer.id}
                  onChange={() => onSaveSettings({ ...settings, defaultSlicerId: slicer.id })}
                />
                Padrão
              </label>
              <button type="button" onClick={() => onChooseSlicerExecutable(slicer)}>
                Escolher .exe
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="settings-section">
        <SettingsSectionCopy
          title="Arquivos compactados"
          description="O 7-Zip é usado para abrir e extrair ZIP, RAR e 7Z."
        />
        <div className={`path-row ${settings.archiveExtractorPath ? "has-secondary-action" : ""}`}>
          <Archive size={17} />
          <span>
            {settings.archiveExtractorPath ||
              "Automático: C:\\Program Files\\7-Zip\\7z.exe ou 7-Zip no PATH"}
          </span>
          <button type="button" onClick={onChooseArchiveExtractor}>Escolher 7z.exe</button>
          {settings.archiveExtractorPath ? (
            <button
              type="button"
              onClick={() => onSaveSettings({ ...settings, archiveExtractorPath: "" })}
            >
              Automático
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
