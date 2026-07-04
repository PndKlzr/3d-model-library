import { Calendar, Eye, FolderOpen, Pencil, Scissors, Weight } from "lucide-react";
import { useEffect, useState } from "react";
import { ModelViewer } from "./ModelViewer";
import type { AppSettings, ModelFile } from "../shared/types";

type DetailsPanelProps = {
  model: ModelFile | null;
  settings: AppSettings;
  launchMessage: string | null;
  onOpenSettings: () => void;
  onLaunchSlicer: (slicerId: string, modelPath: string) => Promise<void>;
  onRenameModelFile: () => void;
};

export function DetailsPanel({
  model,
  settings,
  launchMessage,
  onOpenSettings,
  onLaunchSlicer,
  onRenameModelFile
}: DetailsPanelProps) {
  const [showPreview, setShowPreview] = useState(false);
  const enabledSlicers = settings.slicers.filter((slicer) => slicer.enabled && slicer.executablePath);

  useEffect(() => {
    setShowPreview(false);
  }, [model?.id]);

  return (
    <aside className="details-panel" aria-label="Detalhes do modelo">
      <div className="preview-stage">
        {model && showPreview ? (
          <ModelViewer model={model} />
        ) : model ? (
          <div className="preview-placeholder">
            <Eye size={28} />
            <strong>Preview pausado</strong>
            <span>Para manter a biblioteca leve, o 3D só carrega quando você pedir.</span>
            <button className="primary-button" type="button" onClick={() => setShowPreview(true)}>
              Carregar preview 3D
            </button>
          </div>
        ) : (
          <span>Visualizador 3D</span>
        )}
      </div>

      <div className="details-content">
        <p className="eyebrow">Selecionado</p>
        <div className="details-title-row">
          <h2>{model ? model.name : "Nenhum modelo selecionado"}</h2>
          {model ? (
            <button
              className="icon-only"
              type="button"
              onClick={onRenameModelFile}
              aria-label="Renomear arquivo"
              title="Renomear arquivo"
            >
              <Pencil size={16} />
            </button>
          ) : null}
        </div>
        {!model ? (
          <p>Selecione um arquivo para ver dimensões, data, pasta e abrir no slicer.</p>
        ) : (
          <>
            <dl className="metadata-list">
              <div>
                <dt>
                  <FolderOpen size={15} />
                  Pasta
                </dt>
                <dd>{model.relativeFolder || "Raiz"}</dd>
              </div>
              <div>
                <dt>
                  <Weight size={15} />
                  Tamanho
                </dt>
                <dd>{formatBytes(model.sizeBytes)}</dd>
              </div>
              <div>
                <dt>
                  <Calendar size={15} />
                  Modificado
                </dt>
                <dd>{new Date(model.modifiedAt).toLocaleString()}</dd>
              </div>
            </dl>

            <div className="slicer-actions">
              <p className="eyebrow">Slicers</p>
              {enabledSlicers.length === 0 ? (
                <div className="notice">
                  <Scissors size={16} />
                  <span>Configure Cura ou Creality Print para abrir este modelo.</span>
                  <button type="button" onClick={onOpenSettings}>
                    Configurar
                  </button>
                </div>
              ) : (
                enabledSlicers.map((slicer) => (
                  <button
                    className="primary-button"
                    type="button"
                    key={slicer.id}
                    onClick={() => onLaunchSlicer(slicer.id, model.absolutePath)}
                  >
                    Abrir no {slicer.name}
                  </button>
                ))
              )}
              {launchMessage ? <div className="notice">{launchMessage}</div> : null}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
