import { AlertTriangle, Calendar, FolderOpen, Ruler, Scissors, Weight } from "lucide-react";
import type { AppSettings, ModelFile } from "../shared/types";

type DetailsPanelProps = {
  model: ModelFile | null;
  settings: AppSettings;
};

export function DetailsPanel({ model, settings }: DetailsPanelProps) {
  const enabledSlicers = settings.slicers.filter((slicer) => slicer.enabled && slicer.executablePath);

  return (
    <aside className="details-panel" aria-label="Detalhes do modelo">
      <div className="preview-stage">
        {model ? (
          <>
            <span>{model.extension.toUpperCase()}</span>
            <strong>{model.name}</strong>
          </>
        ) : (
          <span>Visualizador 3D</span>
        )}
      </div>

      <div className="details-content">
        <p className="eyebrow">Selecionado</p>
        <h2>{model ? model.name : "Nenhum modelo selecionado"}</h2>
        {!model ? (
          <p>Selecione um arquivo para ver dimensões, data, pasta e abrir no slicer.</p>
        ) : (
          <>
            {model.previewError ? (
              <div className="notice warning">
                <AlertTriangle size={16} />
                <span>{model.previewError}</span>
              </div>
            ) : null}

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
              <div>
                <dt>
                  <Ruler size={15} />
                  Dimensões
                </dt>
                <dd>{formatDimensions(model.dimensionsMm)}</dd>
              </div>
            </dl>

            <div className="slicer-actions">
              <p className="eyebrow">Slicers</p>
              {enabledSlicers.length === 0 ? (
                <div className="notice">
                  <Scissors size={16} />
                  <span>Configure Cura ou Creality Print para abrir este modelo.</span>
                </div>
              ) : (
                enabledSlicers.map((slicer) => (
                  <button className="primary-button" type="button" key={slicer.id}>
                    Abrir no {slicer.name}
                  </button>
                ))
              )}
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

function formatDimensions(dimensions: ModelFile["dimensionsMm"]): string {
  if (!dimensions) {
    return "Indisponível";
  }

  return `${dimensions.x} × ${dimensions.y} × ${dimensions.z} mm`;
}
