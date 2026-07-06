import {
  Box,
  ChevronLeft,
  ChevronRight,
  Folder,
  GripVertical,
  LayoutGrid,
  List,
  Search,
  Settings,
  Star
} from "lucide-react";
import { useState, type DragEvent } from "react";
import { ModelCardThumbnail } from "./ModelCardThumbnail";
import { ALL_FOLDERS_ID, type ModelSortMode, type ModelTypeFilter } from "../lib/folderFilters";
import type { GridFolderCard } from "../lib/gridFolders";
import type { ModelViewMode } from "../lib/viewPreferences";
import type { ModelFile, ModelUserMetadata } from "../shared/types";

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
  selectedFolder: string;
  viewMode: ModelViewMode;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onSearchChange: (query: string) => void;
  onTypeFilterChange: (type: ModelTypeFilter) => void;
  onSortModeChange: (sortMode: ModelSortMode) => void;
  onOnlySelectedChange: (onlySelected: boolean) => void;
  onOnlyFavoritesChange: (onlyFavorites: boolean) => void;
  onOnlyDuplicatesChange: (onlyDuplicates: boolean) => void;
  onToggleTagFilter: (tag: string) => void;
  onViewModeChange: (viewMode: ModelViewMode) => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onOpenFolder: (folderId: string) => void;
  onOpenFolderContextMenu: (folderId: string, x: number, y: number) => void;
  onMoveModelsToFolder: (folderId: string) => void;
  onOpenModel: (model: ModelFile, modifiers: { ctrlKey: boolean; shiftKey: boolean }) => void;
  onOpenModelContextMenu: (model: ModelFile, x: number, y: number) => void;
  onToggleModelSelection: (model: ModelFile, selected: boolean) => void;
  onDragStartModel: (model: ModelFile) => void;
  onDragEndModel: () => void;
  onStartFileDrag: (model: ModelFile) => void;
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
  selectedFolder,
  viewMode,
  canNavigateBack,
  canNavigateForward,
  onSearchChange,
  onTypeFilterChange,
  onSortModeChange,
  onOnlySelectedChange,
  onOnlyFavoritesChange,
  onOnlyDuplicatesChange,
  onToggleTagFilter,
  onViewModeChange,
  onNavigateBack,
  onNavigateForward,
  onOpenFolder,
  onOpenFolderContextMenu,
  onMoveModelsToFolder,
  onOpenModel,
  onOpenModelContextMenu,
  onToggleModelSelection,
  onDragStartModel,
  onDragEndModel,
  onStartFileDrag,
  onRefresh,
  onOpenSettings
}: ModelGridProps) {
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const hasGridContent = folderCards.length > 0 || models.length > 0;

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
            <Breadcrumb
              selectedFolder={selectedFolder}
              dragOverFolder={dragOverFolder}
              onOpenFolder={onOpenFolder}
              onDragOverFolder={allowFolderDrop}
              onDropOnFolder={dropOnFolder}
              onDragLeaveFolder={() => setDragOverFolder(null)}
            />
          </div>
        </div>
        <div className="toolbar-actions">
          <div className="view-mode-toggle" role="group" aria-label="Modo de visualizacao">
            <button
              className={viewMode === "grid" ? "active" : ""}
              type="button"
              onClick={() => onViewModeChange("grid")}
              aria-label="Ver em grade"
              title="Grade"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={viewMode === "list" ? "active" : ""}
              type="button"
              onClick={() => onViewModeChange("list")}
              aria-label="Ver em lista"
              title="Lista"
            >
              <List size={16} />
            </button>
          </div>
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

      {!hasGridContent ? (
        <div className="empty-state">
          <Box size={28} />
          <strong>Nenhum item nesta visao</strong>
          <span>Tente outra pasta, limpe a busca ou atualize a biblioteca.</span>
        </div>
      ) : viewMode === "list" ? (
        <div className="model-list">
          {folderCards.map((folderCard) => (
            <button
              className={`folder-list-row ${dragOverFolder === folderCard.id ? "drop-target" : ""}`}
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
              <Folder size={20} />
              <strong title={folderCard.name}>{folderCard.name}</strong>
              <span>
                {folderCard.modelCount} modelo{folderCard.modelCount === 1 ? "" : "s"}
              </span>
              <span>
                {folderCard.childCount} pasta{folderCard.childCount === 1 ? "" : "s"}
              </span>
            </button>
          ))}

          {models.map((model) => (
            <ModelListRow
              key={model.id}
              model={model}
              metadata={metadataByPath[model.absolutePath]}
              isDuplicate={duplicateModelIds.has(model.id)}
              isSelected={selectedModelId === model.id}
              isChecked={selectedModelIds.has(model.id)}
              onOpenModel={onOpenModel}
              onOpenModelContextMenu={onOpenModelContextMenu}
              onToggleModelSelection={onToggleModelSelection}
              onDragStartModel={onDragStartModel}
              onDragEndModel={onDragEndModel}
              onStartFileDrag={onStartFileDrag}
            />
          ))}
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
              onOpenModelContextMenu={onOpenModelContextMenu}
              onToggleModelSelection={onToggleModelSelection}
              onDragStartModel={onDragStartModel}
              onDragEndModel={onDragEndModel}
              onStartFileDrag={onStartFileDrag}
            />
          ))}
        </div>
      )}
    </section>
  );
}

type BreadcrumbProps = {
  selectedFolder: string;
  dragOverFolder: string | null;
  onOpenFolder: (folderId: string) => void;
  onDragOverFolder: (event: DragEvent, folderId: string) => void;
  onDropOnFolder: (event: DragEvent, folderId: string) => void;
  onDragLeaveFolder: () => void;
};

function Breadcrumb({
  selectedFolder,
  dragOverFolder,
  onOpenFolder,
  onDragOverFolder,
  onDropOnFolder,
  onDragLeaveFolder
}: BreadcrumbProps) {
  const parts = selectedFolder === ALL_FOLDERS_ID ? [] : selectedFolder.split("/").filter(Boolean);

  return (
    <nav className="breadcrumbs">
      <button
        className={dragOverFolder === ALL_FOLDERS_ID ? "breadcrumb-drop-target" : ""}
        type="button"
        onClick={() => onOpenFolder(ALL_FOLDERS_ID)}
        onDragOver={(event) => onDragOverFolder(event, ALL_FOLDERS_ID)}
        onDragLeave={onDragLeaveFolder}
        onDrop={(event) => onDropOnFolder(event, ALL_FOLDERS_ID)}
      >
        Todos os modelos
      </button>
      {parts.map((part, index) => {
        const folderId = parts.slice(0, index + 1).join("/");

        return (
          <span key={folderId}>
            <ChevronRight size={13} />
            <button
              className={dragOverFolder === folderId ? "breadcrumb-drop-target" : ""}
              type="button"
              onClick={() => onOpenFolder(folderId)}
              onDragOver={(event) => onDragOverFolder(event, folderId)}
              onDragLeave={onDragLeaveFolder}
              onDrop={(event) => onDropOnFolder(event, folderId)}
            >
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
  onOpenModelContextMenu: (model: ModelFile, x: number, y: number) => void;
  onToggleModelSelection: (model: ModelFile, selected: boolean) => void;
  onDragStartModel: (model: ModelFile) => void;
  onDragEndModel: () => void;
  onStartFileDrag: (model: ModelFile) => void;
};

function ModelCard({
  model,
  metadata,
  isDuplicate,
  isSelected,
  isChecked,
  onOpenModel,
  onOpenModelContextMenu,
  onToggleModelSelection,
  onDragStartModel,
  onDragEndModel,
  onStartFileDrag
}: ModelCardProps) {
  return (
    <div
      className={`model-card ${isSelected ? "selected" : ""} ${isChecked ? "checked" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copyMove";
        event.dataTransfer.setData("application/x-model-library-model", model.id);
        onDragStartModel(model);
      }}
      onDragEnd={onDragEndModel}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenModelContextMenu(model, event.clientX, event.clientY);
      }}
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
      {isNativeDraggableModel(model) ? (
        <button
          className="native-file-drag-handle"
          type="button"
          draggable
          title="Arrastar arquivo para Cura ou Creality Print"
          aria-label={`Arrastar ${model.name} para outro programa`}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.preventDefault()}
          onDragStart={(event) =>
            startNativeFileDrag(event, model, onDragStartModel, onStartFileDrag)
          }
          onDragEnd={onDragEndModel}
        >
          <GripVertical size={16} />
        </button>
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

function ModelListRow({
  model,
  metadata,
  isDuplicate,
  isSelected,
  isChecked,
  onOpenModel,
  onOpenModelContextMenu,
  onToggleModelSelection,
  onDragStartModel,
  onDragEndModel,
  onStartFileDrag
}: ModelCardProps) {
  return (
    <div
      className={`model-list-row ${isSelected ? "selected" : ""} ${isChecked ? "checked" : ""}`}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "copyMove";
        event.dataTransfer.setData("application/x-model-library-model", model.id);
        onDragStartModel(model);
      }}
      onDragEnd={onDragEndModel}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenModelContextMenu(model, event.clientX, event.clientY);
      }}
    >
      <label className="list-check" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(event) => onToggleModelSelection(model, event.currentTarget.checked)}
          aria-label={`Selecionar ${model.name}`}
        />
      </label>
      <button
        className="model-list-main"
        type="button"
        onClick={(event) =>
          onOpenModel(model, {
            ctrlKey: event.ctrlKey || event.metaKey,
            shiftKey: event.shiftKey
          })
        }
      >
        <div className="list-thumb">
          <ModelCardThumbnail model={model} />
        </div>
        <strong title={model.name}>{model.name}</strong>
        <span title={model.relativeFolder || "Raiz"}>{model.relativeFolder || "Raiz"}</span>
        <span>{model.extension.toUpperCase()}</span>
        <span>{formatBytes(model.sizeBytes)}</span>
        <span>{new Date(model.modifiedAt).toLocaleDateString()}</span>
        <span className="list-flags">
          {metadata?.favorite ? <Star size={15} fill="currentColor" aria-label="Favorito" /> : null}
          {isDuplicate ? <em>Duplicado</em> : null}
          {metadata?.tags.slice(0, 2).map((tag) => (
            <em key={tag}>{tag}</em>
          ))}
        </span>
      </button>
      {isNativeDraggableModel(model) ? (
        <button
          className="native-file-drag-handle list-native-file-drag-handle"
          type="button"
          draggable
          title="Arrastar arquivo para Cura ou Creality Print"
          aria-label={`Arrastar ${model.name} para outro programa`}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.preventDefault()}
          onDragStart={(event) =>
            startNativeFileDrag(event, model, onDragStartModel, onStartFileDrag)
          }
          onDragEnd={onDragEndModel}
        >
          <GripVertical size={16} />
        </button>
      ) : null}
    </div>
  );
}

function startNativeFileDrag(
  event: DragEvent<HTMLElement>,
  model: ModelFile,
  onDragStartModel: (model: ModelFile) => void,
  onStartFileDrag: (model: ModelFile) => void
) {
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.effectAllowed = "copy";
  onDragStartModel(model);
  onStartFileDrag(model);
}

function isNativeDraggableModel(model: ModelFile): boolean {
  return model.extension === ".stl" || model.extension === ".3mf";
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
