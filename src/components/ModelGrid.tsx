import { Box, Search, Settings } from "lucide-react";
import { ModelCardThumbnail } from "./ModelCardThumbnail";
import type { ModelFile } from "../shared/types";

type ModelGridProps = {
  models: ModelFile[];
  scanErrors: Array<{ path: string; message: string }>;
  selectedModelId: string | null;
  selectedModelIds: Set<string>;
  searchQuery: string;
  isScanning: boolean;
  operationMessage: string | null;
  onSearchChange: (query: string) => void;
  onOpenModel: (model: ModelFile) => void;
  onToggleModelSelection: (model: ModelFile, selected: boolean) => void;
  onDragStartModel: (model: ModelFile) => void;
  onDragEndModel: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
};

export function ModelGrid({
  models,
  scanErrors,
  selectedModelId,
  selectedModelIds,
  searchQuery,
  isScanning,
  operationMessage,
  onSearchChange,
  onOpenModel,
  onToggleModelSelection,
  onDragStartModel,
  onDragEndModel,
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
          <button
            className="icon-only"
            type="button"
            onClick={onOpenSettings}
            aria-label="Configuracoes"
          >
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
          <strong>Alguns itens nao puderam ser lidos</strong>
          {scanErrors.slice(0, 4).map((error) => (
            <span key={`${error.path}-${error.message}`}>
              {error.path}: {error.message}
            </span>
          ))}
        </div>
      ) : null}

      {operationMessage ? (
        <div className="operation-message" role="status">
          {operationMessage}
        </div>
      ) : null}

      {models.length === 0 ? (
        <div className="empty-state">
          <Box size={28} />
          <strong>Nenhum modelo nesta visao</strong>
          <span>Tente outra pasta, limpe a busca ou atualize a biblioteca.</span>
        </div>
      ) : (
        <div className="model-grid">
          {models.map((model) => (
            <div
              className={`model-card ${selectedModelId === model.id ? "selected" : ""} ${
                selectedModelIds.has(model.id) ? "checked" : ""
              }`}
              key={model.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", model.absolutePath);
                onDragStartModel(model);
              }}
              onDragEnd={onDragEndModel}
            >
              <label className="card-check" onClick={(event) => event.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedModelIds.has(model.id)}
                  onChange={(event) => onToggleModelSelection(model, event.currentTarget.checked)}
                  aria-label={`Selecionar ${model.name}`}
                />
              </label>
              <button className="model-card-main" type="button" onClick={() => onOpenModel(model)}>
                <div className="model-thumb">
                  <ModelCardThumbnail model={model} />
                </div>
                <div className="model-card-meta">
                  <strong title={model.name}>{model.name}</strong>
                  <span title={model.relativeFolder || "Raiz"}>
                    {model.relativeFolder || "Raiz"} - {formatBytes(model.sizeBytes)}
                  </span>
                </div>
              </button>
            </div>
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
