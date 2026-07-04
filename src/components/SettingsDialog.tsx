import { FolderOpen, Settings, X } from "lucide-react";
import type { AppSettings, SlicerConfig } from "../shared/types";

type SettingsDialogProps = {
  settings: AppSettings;
  onClose: () => void;
  onSaveSettings: (settings: AppSettings) => Promise<void>;
  onChooseLibraryFolder: () => Promise<void>;
  onChooseSlicerExecutable: (slicer: SlicerConfig) => Promise<void>;
};

export function SettingsDialog({
  settings,
  onClose,
  onSaveSettings,
  onChooseLibraryFolder,
  onChooseSlicerExecutable
}: SettingsDialogProps) {
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="settings-dialog" role="dialog" aria-modal="true" aria-label="Configurações">
        <header className="dialog-header">
          <div>
            <p className="eyebrow">Configurações</p>
            <h2>Biblioteca e slicers</h2>
          </div>
          <button className="icon-only" type="button" onClick={onClose} aria-label="Fechar">
            <X size={18} />
          </button>
        </header>

        <div className="settings-section">
          <h3>Biblioteca</h3>
          <div className="path-row">
            <FolderOpen size={17} />
            <span>{settings.libraryPath ?? "Nenhuma pasta escolhida"}</span>
            <button type="button" onClick={onChooseLibraryFolder}>
              Trocar
            </button>
          </div>
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
        </div>

        <div className="settings-section">
          <h3>Slicers</h3>
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
                <button type="button" onClick={() => onChooseSlicerExecutable(slicer)}>
                  Escolher .exe
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
