import {
  Box,
  ChevronLeft,
  ChevronRight,
  Folder,
  RotateCcw,
  Search,
  Settings,
  Star,
  Trash2
} from "lucide-react";
import { useState, type DragEvent } from "react";
import { ModelCardThumbnail } from "./ModelCardThumbnail";
import { ALL_FOLDERS_ID, type ModelSortMode, type ModelTypeFilter } from "../lib/folderFilters";
import type { GridFolderCard } from "../lib/gridFolders";
import type { LibraryActionLogEntry, ModelFile, ModelUserMetadata } from "../shared/types";

type ModelGridProps = {
  models: ModelFile[];
  folderCards: GridFolderCard[];
  scanErrors: Array<{ path: string; message: string }>;
  selectedModelId: string | null;
  selectedModelIds: Set<string>;
  searchQuery: string;
  typeFilter: ModelTypeFilter;
  sortMode: ModelSortMode;
  onlySelected: boolean;
  onlyFavorites: boolean;
  onlyDuplicates: boolean;
  availableTags: string[];
  selectedTags: Set<string>;
  metadataByPath: Record<string, ModelUserMetadata>;
  duplicateModelIds: Set<string>;
  isScanning: boolean;
  canMoveModels: boolean;
  operationMessage: string | null;
  actionLogEntries: LibraryActionLogEntry[];
  selectedFolder: string;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onSearchChange: (query: string) => void;
  onTypeFilterChange: (type: ModelTypeFilter) => void;
  onSortModeChange: (sortMode: ModelSortMode) => void;
  onOnlySelectedChange: (onlySelected: boolean) => void;
  onOnlyFavoritesChange: (onlyFavorites: boolean) => void;
  onOnlyDuplicatesChange: (onlyDuplicates: boolean) => void;
  onToggleTagFilter: (tag: string) => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onOpenFolder: (folderId: string) => void;
  onOpenFolderContextMenu: (folderId: string, x: number, y: number) => void;
  onMoveModelsToFolder: (folderId: string) => void;
  onTrashSelectedModels: () => void;
  onUndoLastAction: () => void;
  onOpenModel: (model: ModelFile, modifiers: { ctrlKey: boolean; shiftKey: boolean }) => void;
  onToggleModelSelection: (model: ModelFile, selected: boolean) => void;
  onDragStartModel: (model: ModelFile) => void;
  onDragEndModel: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
};

export function ModelGrid({
  models,
  folderCards,
  scanErrors,
  selectedModelId,
  selectedModelIds,
  searchQuery,
  typeFilter,
  sortMode,
  onlySelected,
  onlyFavorites,
  onlyDuplicates,
  availableTags,
  selectedTags,
  metadataByPath,
  duplicateModelIds,
  isScanning,
  canMoveModels,
  operationMessage,
  actionLogEntries,
  selectedFolder,
  canNavigateBack,
  canNavigateForward,
  onSearchChange,
  onTypeFilterChange,
  onSortModeChange,
  onOnlySelectedChange,
  onOnlyFavoritesChange,
  onOnlyDuplicatesChange,
  onToggleTagFilter,
  onNavigateBack,
  onNavigateForward,
  onOpenFolder,
  onOpenFolderContextMenu,
  onMoveModelsToFolder,
  onTrashSelectedModels,
  onUndoLastAction,
  onOpenModel,
  onToggleModelSelection,
  onDragStartModel,
  onDragEndModel,
  onRefresh,
  onOpenSettings
}: ModelGridProps) {
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const hasGridContent = folderCards.length > 0 || models.length > 0;
  const undoableAction = actionLogEntries.find((entry) => entry.undoable && !entry.undone);

  function allowFolderDrop(event: DragEvent, folderId: string) {
    if (!canMoveModels) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverFolder(folderId);
  }

  function dropOnFolder(event: DragEvent, folderId: string) {
    if (!canMoveModels) {
      return;
    }

    event.preventDefault();
    setDragOverFolder(null);
    onMoveModelsToFolder(folderId);
  }

  return (
    <section className="library-panel" aria-label="Modelos encontrados">
      <header className="toolbar">
        <div>
          <p className="eyebrow">STL / 3MF</p>
          <h2>Sua biblioteca visual</h2>
          <div className="breadcrumb-row" aria-label="Caminho da pasta">
            <button
              className="icon-only small-icon"
              type="button"
              onClick={onNavigateBack}
              disabled={!canNavigateBack}
              aria-label="Voltar pasta"
              title="Voltar"
            >
              <ChevronLeft size={15} />
            </button>
            <button
              className="icon-only small-icon"
              type="button"
              onClick={onNavigateForward}
              disabled={!canNavigateForward}
              aria-label="Avancar pasta"
              title="Avancar"
            >
              <ChevronRight size={15} />
            </button>
            <Breadcrumb selectedFolder={selectedFolder} onOpenFolder={onOpenFolder} />
          </div>
        </div>
        <div className="toolbar-actions">
          <button
            className="secondary-button danger-button"
            type="button"
            onClick={onTrashSelectedModels}
            disabled={selectedModelIds.size === 0}
            title="Mover selecionados para a Lixeira"
          >
            <Trash2 size={16} />
            Lixeira
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={onUndoLastAction}
            disabled={!undoableAction}
            title={undoableAction ? `Desfazer: ${undoableAction.label}` : "Nada para desfazer"}
          >
            <RotateCcw size={16} />
            Desfazer
          </button>
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

      <div className="filter-bar" aria-label="Filtros da biblioteca">
        <label>
          Tipo
          <select
            value={typeFilter}
            onChange={(event) => onTypeFilterChange(event.currentTarget.value as ModelTypeFilter)}
          >
            <option value="all">Todos</option>
            <option value=".stl">STL</option>
            <option value=".3mf">3MF</option>
          </select>
        </label>
        <label>
          Ordenar
          <select
            value={sortMode}
            onChange={(event) => onSortModeChange(event.currentTarget.value as ModelSortMode)}
          >
            <option value="name">Nome</option>
            <option value="modified">Mais recentes</option>
            <option value="size">Tamanho</option>
          </select>
        </label>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={onlySelected}
            onChange={(event) => onOnlySelectedChange(event.currentTarget.checked)}
          />
          So selecionados
        </label>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={onlyFavorites}
            onChange={(event) => onOnlyFavoritesChange(event.currentTarget.checked)}
          />
          Favoritos
        </label>
        <label className="filter-check">
          <input
            type="checkbox"
            checked={onlyDuplicates}
            onChange={(event) => onOnlyDuplicatesChange(event.currentTarget.checked)}
          />
          Duplicados
        </label>
      </div>

      {availableTags.length > 0 ? (
        <div className="tag-filter-row" aria-label="Filtros por tag">
          {availableTags.map((tag) => (
            <button
              className={`tag-chip ${selectedTags.has(tag) ? "active" : ""}`}
              type="button"
              key={tag}
              onClick={() => onToggleTagFilter(tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}

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

      {actionLogEntries.length > 0 ? (
        <div className="action-log" aria-label="Log de acoes recentes">
          {actionLogEntries.slice(0, 4).map((entry) => (
            <div className={entry.undone ? "undone" : ""} key={entry.id}>
              <strong>{entry.label}</strong>
              <span>{entry.detail}</span>
              {entry.undoable ? <em>desfazer disponivel</em> : null}
              {entry.undone ? <em>desfeito</em> : null}
            </div>
          ))}
        </div>
      ) : null}

      {!hasGridContent ? (
        <div className="empty-state">
          <Box size={28} />
          <strong>Nenhum item nesta visao</strong>
          <span>Tente outra pasta, limpe a busca ou atualize a biblioteca.</span>
        </div>
      ) : (
        <div className="model-grid">
          {folderCards.map((folderCard) => (
            <button
              className={`folder-card ${dragOverFolder === folderCard.id ? "drop-target" : ""}`}
              key={folderCard.id}
              type="button"
              onClick={() => onOpenFolder(folderCard.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                onOpenFolderContextMenu(folderCard.id, event.clientX, event.clientY);
              }}
              onDragOver={(event) => allowFolderDrop(event, folderCard.id)}
              onDragLeave={() => setDragOverFolder(null)}
              onDrop={(event) => dropOnFolder(event, folderCard.id)}
            >
              <div className="folder-card-icon">
                <Folder size={34} />
              </div>
              <div className="model-card-meta">
                <strong title={folderCard.name}>{folderCard.name}</strong>
                <span>
                  {folderCard.modelCount} modelo{folderCard.modelCount === 1 ? "" : "s"}
                  {folderCard.childCount > 0
                    ? ` - ${folderCard.childCount} pasta${folderCard.childCount === 1 ? "" : "s"}`
                    : ""}
                </span>
              </div>
            </button>
          ))}

          {models.map((model) => (
            <ModelCard
              key={model.id}
              model={model}
              metadata={metadataByPath[model.absolutePath]}
              isDuplicate={duplicateModelIds.has(model.id)}
              isSelected={selectedModelId === model.id}
              isChecked={selectedModelIds.has(model.id)}
              onOpenModel={onOpenModel}
              onToggleModelSelection={onToggleModelSelection}
              onDragStartModel={onDragStartModel}
              onDragEndModel={onDragEndModel}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type BreadcrumbProps = {
  selectedFolder: string;
  onOpenFolder: (folderId: string) => void;
};

function Breadcrumb({ selectedFolder, onOpenFolder }: BreadcrumbProps) {
  const parts = selectedFolder === ALL_FOLDERS_ID ? [] : selectedFolder.split("/").filter(Boolean);

  return (
    <nav className="breadcrumbs">
      <button type="button" onClick={() => onOpenFolder(ALL_FOLDERS_ID)}>
        Todos os modelos
      </button>
      {parts.map((part, index) => {
        const folderId = parts.slice(0, index + 1).join("/");

        return (
          <span key={folderId}>
            <ChevronRight size={13} />
            <button type="button" onClick={() => onOpenFolder(folderId)}>
              {part}
            </button>
          </span>
        );
      })}
    </nav>
  );
}

type ModelCardProps = {
  model: ModelFile;
  metadata: ModelUserMetadata | undefined;
  isDuplicate: boolean;
  isSelected: boolean;
  isChecked: boolean;
  onOpenModel: (model: ModelFile, modifiers: { ctrlKey: boolean; shiftKey: boolean }) => void;
  onToggleModelSelection: (model: ModelFile, selected: boolean) => void;
  onDragStartModel: (model: ModelFile) => void;
  onDragEndModel: () => void;
};

function ModelCard({
  model,
  metadata,
  isDuplicate,
  isSelected,
  isChecked,
  onOpenModel,
  onToggleModelSelection,
  onDragStartModel,
  onDragEndModel
}: ModelCardProps) {
  return (
    <div
      className={`model-card ${isSelected ? "selected" : ""} ${isChecked ? "checked" : ""}`}
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
          checked={isChecked}
          onChange={(event) => onToggleModelSelection(model, event.currentTarget.checked)}
          aria-label={`Selecionar ${model.name}`}
        />
      </label>
      {metadata?.favorite ? (
        <div className="favorite-badge" title="Favorito" aria-label="Favorito">
          <Star size={15} fill="currentColor" />
        </div>
      ) : null}
      <button
        className="model-card-main"
        type="button"
        onClick={(event) =>
          onOpenModel(model, {
            ctrlKey: event.ctrlKey || event.metaKey,
            shiftKey: event.shiftKey
          })
        }
      >
        <div className="model-thumb">
          <ModelCardThumbnail model={model} />
        </div>
        <div className="model-card-meta">
          <strong title={model.name}>{model.name}</strong>
          <span title={model.relativeFolder || "Raiz"}>
            {model.relativeFolder || "Raiz"} - {formatBytes(model.sizeBytes)}
          </span>
          {isDuplicate ? <span className="duplicate-label">Possivel duplicado</span> : null}
          {metadata?.tags.length ? (
            <div className="card-tags" aria-label="Tags">
              {metadata.tags.slice(0, 3).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          ) : null}
        </div>
      </button>
    </div>
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
