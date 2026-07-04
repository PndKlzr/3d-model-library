import { Box, Search, Settings } from "lucide-react";
import type { ModelFile } from "../shared/types";

type ModelGridProps = {
  models: ModelFile[];
  scanErrors: Array<{ path: string; message: string }>;
  selectedModelId: string | null;
  searchQuery: string;
  isScanning: boolean;
  onSearchChange: (query: string) => void;
  onSelectModel: (model: ModelFile) => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
};

export function ModelGrid({
  models,
  scanErrors,
  selectedModelId,
  searchQuery,
  isScanning,
  onSearchChange,
  onSelectModel,
  onRefresh,
  onOpenSettings
}: ModelGridProps) {
  return (
    <section className="library-panel" aria-label="Modelos encontrados">
      <header className="toolbar">
        <div>
          <p className="eyebrow">STL / 3MF</p>
          <h2>Sua biblioteca visual</h2>
        </div>
        <div className="toolbar-actions">
          <button className="icon-only" type="button" onClick={onOpenSettings} aria-label="Configurações">
            <Settings size={17} />
          </button>
          <button className="secondary-button" type="button" onClick={onRefresh} disabled={isScanning}>
            {isScanning ? "Escaneando" : "Atualizar"}
          </button>
        </div>
      </header>

      <label className="search-box">
        <Search size={16} />
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder="Buscar por nome ou pasta"
        />
      </label>

      {scanErrors.length > 0 ? (
        <div className="scan-errors" role="status">
          <strong>Alguns itens não puderam ser lidos</strong>
          {scanErrors.slice(0, 4).map((error) => (
            <span key={`${error.path}-${error.message}`}>{error.path}: {error.message}</span>
          ))}
        </div>
      ) : null}

      {models.length === 0 ? (
        <div className="empty-state">
          <Box size={28} />
          <strong>Nenhum modelo nesta visão</strong>
          <span>Tente outra pasta, limpe a busca ou atualize a biblioteca.</span>
        </div>
      ) : (
        <div className="model-grid">
          {models.map((model) => (
            <button
              className={`model-card ${selectedModelId === model.id ? "selected" : ""}`}
              key={model.id}
              type="button"
              onClick={() => onSelectModel(model)}
            >
              <div className="model-thumb">
                <div className="thumb-fallback">
                  <Box size={30} />
                  <span>{model.extension.toUpperCase()}</span>
                </div>
              </div>
              <div className="model-card-meta">
                <strong title={model.name}>{model.name}</strong>
                <span title={model.relativeFolder || "Raiz"}>
                  {model.relativeFolder || "Raiz"} · {formatBytes(model.sizeBytes)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
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
