import { Box, Search } from "lucide-react";
import type { ModelFile } from "../shared/types";

type ModelGridProps = {
  models: ModelFile[];
  selectedModelId: string | null;
  searchQuery: string;
  isScanning: boolean;
  onSearchChange: (query: string) => void;
  onSelectModel: (model: ModelFile) => void;
  onRefresh: () => void;
};

export function ModelGrid({
  models,
  selectedModelId,
  searchQuery,
  isScanning,
  onSearchChange,
  onSelectModel,
  onRefresh
}: ModelGridProps) {
  return (
    <section className="library-panel" aria-label="Modelos encontrados">
      <header className="toolbar">
        <div>
          <p className="eyebrow">STL / 3MF</p>
          <h2>Sua biblioteca visual</h2>
        </div>
        <button className="secondary-button" type="button" onClick={onRefresh} disabled={isScanning}>
          {isScanning ? "Escaneando" : "Atualizar"}
        </button>
      </header>

      <label className="search-box">
        <Search size={16} />
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder="Buscar por nome ou pasta"
        />
      </label>

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
                <Box size={32} />
                <span>{model.extension.toUpperCase()}</span>
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
