import {
  Box,
  CheckSquare2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Folder,
  FolderInput,
  LayoutGrid,
  List,
  RotateCw,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  X
} from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
  type RefObject
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ModelCardThumbnail } from "./ModelCardThumbnail";
import { FolderCardThumbnail } from "./FolderCardThumbnail";
import { ThumbnailQueueStatus } from "./ThumbnailQueueStatus";
import { FileTypeFilter } from "./FileTypeFilter";
import {
  ALL_FOLDERS_ID,
  type ModelSortMode,
  type NotesFilter,
  type TagMatchMode,
  type UsageFilter
} from "../lib/folderFilters";
import type { GridFolderCard } from "../lib/gridFolders";
import type { ModelViewMode } from "../lib/viewPreferences";
import { buildVirtualRows } from "../lib/virtualGrid";
import type { FileDragBehavior, ModelFile, ModelUserMetadata } from "../shared/types";
import { SUPPORTED_FILE_EXTENSIONS, type SupportedFileExtension } from "../shared/fileCapabilities";
import type { ThumbnailDiagnosticsSnapshot } from "../lib/thumbnailDiagnostics";

type ModelGridProps = {
  models: ModelFile[];
  folderCards: GridFolderCard[];
  scanErrors: Array<{ path: string; message: string }>;
  selectedModelId: string | null;
  selectedModelIds: Set<string>;
  searchQuery: string;
  visibleExtensions: ReadonlySet<SupportedFileExtension>;
  excludedFolders: readonly string[];
  sortMode: ModelSortMode;
  onlySelected: boolean;
  onlyFavorites: boolean;
  onlyDuplicates: boolean;
  usageFilter: UsageFilter;
  notesFilter: NotesFilter;
  tagMatchMode: TagMatchMode;
  availableTags: string[];
  selectedTags: Set<string>;
  metadataByPath: Record<string, ModelUserMetadata>;
  duplicateModelIds: Set<string>;
  thumbnailRetryGenerations: Record<string, number>;
  thumbnailDiagnostics: ThumbnailDiagnosticsSnapshot;
  isScanning: boolean;
  monitorStatus: "active" | "disabled" | "error";
  isFilteringStale: boolean;
  canMoveModels: boolean;
  pointerDragOverFolder: string | null;
  operationMessage: string | null;
  selectedFolder: string;
  viewMode: ModelViewMode;
  fileDragBehavior: FileDragBehavior;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  onSearchChange: (query: string) => void;
  onVisibleExtensionsChange: (visibleExtensions: ReadonlySet<SupportedFileExtension>) => void;
  onRemoveFolderExclusion: (folderId: string) => void;
  onClearFilters: () => void;
  onSortModeChange: (sortMode: ModelSortMode) => void;
  onOnlySelectedChange: (onlySelected: boolean) => void;
  onOnlyFavoritesChange: (onlyFavorites: boolean) => void;
  onOnlyDuplicatesChange: (onlyDuplicates: boolean) => void;
  onUsageFilterChange: (usageFilter: UsageFilter) => void;
  onNotesFilterChange: (notesFilter: NotesFilter) => void;
  onTagMatchModeChange: (tagMatchMode: TagMatchMode) => void;
  onToggleTagFilter: (tag: string) => void;
  onViewModeChange: (viewMode: ModelViewMode) => void;
  onFileDragBehaviorChange: (behavior: FileDragBehavior) => void;
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  onOpenFolder: (folderId: string) => void;
  onOpenFolderContextMenu: (folderId: string, x: number, y: number) => void;
  onMoveModelsToFolder: (folderId: string) => void;
  onOpenModel: (model: ModelFile, modifiers: { ctrlKey: boolean; shiftKey: boolean }) => void;
  onOpenDefaultSlicer: (model: ModelFile) => void;
  onOpenModelContextMenu: (model: ModelFile, x: number, y: number) => void;
  onToggleModelSelection: (model: ModelFile, selected: boolean) => void;
  onDragStartModel: (model: ModelFile, mode: "external" | "internal") => void;
  onDragEndModel: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
};

type CollectionItem =
  | { kind: "folder"; id: string; folder: GridFolderCard }
  | { kind: "model"; id: string; model: ModelFile };

export function ModelGrid({
  models,
  folderCards,
  scanErrors,
  selectedModelId,
  selectedModelIds,
  searchQuery,
  visibleExtensions,
  excludedFolders,
  sortMode,
  onlySelected,
  onlyFavorites,
  onlyDuplicates,
  usageFilter,
  notesFilter,
  tagMatchMode,
  availableTags,
  selectedTags,
  metadataByPath,
  duplicateModelIds,
  thumbnailRetryGenerations,
  thumbnailDiagnostics,
  isScanning,
  monitorStatus,
  isFilteringStale,
  canMoveModels,
  pointerDragOverFolder,
  operationMessage,
  selectedFolder,
  viewMode,
  fileDragBehavior,
  canNavigateBack,
  canNavigateForward,
  onSearchChange,
  onVisibleExtensionsChange,
  onRemoveFolderExclusion,
  onClearFilters,
  onSortModeChange,
  onOnlySelectedChange,
  onOnlyFavoritesChange,
  onOnlyDuplicatesChange,
  onUsageFilterChange,
  onNotesFilterChange,
  onTagMatchModeChange,
  onToggleTagFilter,
  onViewModeChange,
  onFileDragBehaviorChange,
  onNavigateBack,
  onNavigateForward,
  onOpenFolder,
  onOpenFolderContextMenu,
  onMoveModelsToFolder,
  onOpenModel,
  onOpenDefaultSlicer,
  onOpenModelContextMenu,
  onToggleModelSelection,
  onDragStartModel,
  onDragEndModel,
  onRefresh,
  onOpenSettings
}: ModelGridProps) {
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  const advancedFiltersRef = useRef<HTMLDivElement | null>(null);
  const collectionItems = useMemo<CollectionItem[]>(
    () => [
      ...folderCards.map((folder) => ({ kind: "folder" as const, id: `folder:${folder.id}`, folder })),
      ...models.map((model) => ({ kind: "model" as const, id: `model:${model.id}`, model }))
    ],
    [folderCards, models]
  );
  const hasGridContent = folderCards.length > 0 || models.length > 0;
  const hasActiveFilters =
    searchQuery.length > 0 ||
    visibleExtensions.size < SUPPORTED_FILE_EXTENSIONS.length ||
    excludedFolders.length > 0 ||
    onlySelected ||
    onlyFavorites ||
    onlyDuplicates ||
    selectedTags.size > 0 ||
    usageFilter !== "all" ||
    notesFilter !== "all" ||
    (selectedTags.size > 0 && tagMatchMode !== "all");
  const advancedFilterCount =
    Number(usageFilter !== "all") +
    Number(notesFilter !== "all") +
    Number(selectedTags.size > 0 && tagMatchMode !== "all");

  useEffect(() => {
    if (!isAdvancedFiltersOpen) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!advancedFiltersRef.current?.contains(event.target as Node)) {
        setIsAdvancedFiltersOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsAdvancedFiltersOpen(false);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isAdvancedFiltersOpen]);

  useEffect(() => {
    function setModifierDragReady(key: "Control" | "Shift", isReady: boolean) {
      const panel = panelRef.current;

      if (!panel) {
        return;
      }

      if (key === "Control" && fileDragBehavior === "organize-default") {
        panel.classList.toggle("external-drag-ready", isReady);
      }

      if (key === "Shift" && fileDragBehavior === "external-default") {
        panel.classList.toggle("internal-drag-ready", isReady);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Control" || event.key === "Shift") {
        setModifierDragReady(event.key, true);
      }
    }

    function handleKeyUp(event: KeyboardEvent) {
      if (event.key === "Control" || event.key === "Shift") {
        setModifierDragReady(event.key, false);
      }
    }

    function handleBlur() {
      panelRef.current?.classList.remove("external-drag-ready", "internal-drag-ready");
    }

    panelRef.current?.classList.toggle(
      "external-drag-default",
      fileDragBehavior === "external-default"
    );

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      panelRef.current?.classList.remove(
        "external-drag-ready",
        "internal-drag-ready",
        "external-drag-default"
      );
    };
  }, [fileDragBehavior]);

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

  function clearFilters() {
    onClearFilters();
  }

  return (
    <section className="library-panel" aria-label="Modelos encontrados" ref={panelRef}>
      <div className="external-drag-mode-cue" aria-hidden="true">
        <Copy size={17} />
        <span>
          <strong>Copiar para outro programa</strong>
          <small>Cura, Creality Print ou Explorer</small>
        </span>
      </div>
      <div className="internal-drag-mode-cue" aria-hidden="true">
        <FolderInput size={17} />
        <span>
          <strong>Organizar dentro da biblioteca</strong>
          <small>Solte o modelo em uma pasta</small>
        </span>
      </div>
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
              aria-label="Avançar pasta"
              title="Avançar"
            >
              <ChevronRight size={15} />
            </button>
            <Breadcrumb
              selectedFolder={selectedFolder}
              dragOverFolder={dragOverFolder}
              pointerDragOverFolder={pointerDragOverFolder}
              onOpenFolder={onOpenFolder}
              onDragOverFolder={allowFolderDrop}
              onDropOnFolder={dropOnFolder}
              onDragLeaveFolder={() => setDragOverFolder(null)}
            />
          </div>
        </div>
        <div className="toolbar-actions">
          <div className="drag-behavior-toggle" role="group" aria-label="Modo de arraste">
            <button
              className={fileDragBehavior === "organize-default" ? "active" : ""}
              type="button"
              onClick={() => onFileDragBehaviorChange("organize-default")}
              aria-pressed={fileDragBehavior === "organize-default"}
              aria-label="Organizar na biblioteca"
              title="Arraste para pastas. Ctrl + arraste envia para outro programa."
            >
              <FolderInput size={15} />
              Pasta
            </button>
            <button
              className={fileDragBehavior === "external-default" ? "active" : ""}
              type="button"
              onClick={() => onFileDragBehaviorChange("external-default")}
              aria-pressed={fileDragBehavior === "external-default"}
              aria-label="Enviar para outro programa"
              title="Arraste para Cura, Creality ou Explorer. Shift + arraste organiza."
            >
              <Copy size={15} />
              Externo
            </button>
          </div>
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
            aria-label="Configurações"
            title="Configurações"
          >
            <Settings size={17} />
          </button>
          <div className="toolbar-statuses">
            <ThumbnailQueueStatus snapshot={thumbnailDiagnostics} />
            <span
              className={`library-status ${isScanning ? "scanning" : monitorStatus}`}
              title={
                isScanning
                  ? "Atualizando biblioteca"
                  : monitorStatus === "active"
                    ? "Monitoramento ativo"
                    : "Atualização manual"
              }
            >
              <i aria-hidden="true" />
              {isScanning
                ? "Atualizando biblioteca..."
                : monitorStatus === "active"
                  ? "Monitoramento ativo"
                  : "Atualização manual"}
            </span>
          </div>
          <button
            className="icon-only"
            type="button"
            onClick={onRefresh}
            disabled={isScanning}
            aria-label={isScanning ? "Atualizando biblioteca" : "Atualizar biblioteca"}
            title={isScanning ? "Atualizando biblioteca" : "Atualizar biblioteca"}
          >
            <RotateCw className={isScanning ? "spinning" : ""} size={17} />
          </button>
        </div>
      </header>

      <label className="search-box">
        <Search size={16} />
        <input
          value={searchQuery}
          onChange={(event) => onSearchChange(event.currentTarget.value)}
          placeholder="Buscar por nome, pasta, tag ou nota"
        />
        {searchQuery ? (
          <button
            className="search-clear-button"
            type="button"
            onClick={() => onSearchChange("")}
            aria-label="Limpar busca"
            title="Limpar busca"
          >
            <X size={15} />
          </button>
        ) : null}
      </label>

      <div className="filter-bar" aria-label="Filtros da biblioteca">
        <div className="advanced-filter-wrap" ref={advancedFiltersRef}>
          <button
            className={`filter-toggle ${advancedFilterCount > 0 ? "active" : ""}`}
            type="button"
            aria-expanded={isAdvancedFiltersOpen}
            aria-label="Filtros avançados"
            title="Filtros avançados"
            onClick={() => setIsAdvancedFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={14} />
            {advancedFilterCount > 0 ? <span>{advancedFilterCount}</span> : null}
          </button>
          {isAdvancedFiltersOpen ? (
            <div className="advanced-filter-popover">
              <strong>Filtros avançados</strong>
              <label>
                Uso
                <select
                  value={usageFilter}
                  onChange={(event) => onUsageFilterChange(event.currentTarget.value as UsageFilter)}
                >
                  <option value="all">Qualquer</option>
                  <option value="recent">Abertos nos últimos 30 dias</option>
                  <option value="never">Nunca abertos</option>
                </select>
              </label>
              <label>
                Notas
                <select
                  value={notesFilter}
                  onChange={(event) => onNotesFilterChange(event.currentTarget.value as NotesFilter)}
                >
                  <option value="all">Com ou sem notas</option>
                  <option value="with-notes">Com notas</option>
                  <option value="without-notes">Sem notas</option>
                </select>
              </label>
              <label>
                Tags selecionadas
                <select
                  value={tagMatchMode}
                  disabled={selectedTags.size === 0}
                  onChange={(event) => onTagMatchModeChange(event.currentTarget.value as TagMatchMode)}
                >
                  <option value="all">Todas</option>
                  <option value="any">Qualquer uma</option>
                  <option value="exclude">Excluir</option>
                </select>
              </label>
            </div>
          ) : null}
        </div>
        <FileTypeFilter
          visibleExtensions={visibleExtensions}
          onChange={onVisibleExtensionsChange}
        />
        <label className="filter-select">
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
        <button
          className={`filter-toggle ${onlySelected ? "active" : ""}`}
          type="button"
          aria-pressed={onlySelected}
          aria-label="Somente selecionados"
          title="Mostrar somente os modelos selecionados"
          onClick={() => onOnlySelectedChange(!onlySelected)}
        >
          <CheckSquare2 size={14} />
        </button>
        <button
          className={`filter-toggle ${onlyFavorites ? "active" : ""}`}
          type="button"
          aria-pressed={onlyFavorites}
          aria-label="Somente favoritos"
          title="Mostrar somente favoritos"
          onClick={() => onOnlyFavoritesChange(!onlyFavorites)}
        >
          <Star size={14} fill={onlyFavorites ? "currentColor" : "none"} />
        </button>
        <button
          className={`filter-toggle ${onlyDuplicates ? "active" : ""}`}
          type="button"
          aria-pressed={onlyDuplicates}
          aria-label="Somente possíveis duplicados"
          title="Mostrar possíveis arquivos duplicados"
          onClick={() => onOnlyDuplicatesChange(!onlyDuplicates)}
        >
          <Copy size={14} />
        </button>
        {hasActiveFilters ? (
          <button className="filter-clear" type="button" onClick={clearFilters} title="Limpar filtros">
            <X size={14} />
            Limpar filtros
          </button>
        ) : null}
      </div>

      {excludedFolders.length > 0 ? (
        <div className="exclusion-filter-row" aria-label="Pastas ocultas dos resultados">
          {excludedFolders.map((folder) => (
            <span className="exclusion-chip" key={folder}>
              <span title={folder}>{folder}</span>
              <button
                type="button"
                onClick={() => onRemoveFolderExclusion(folder)}
                aria-label={`Mostrar resultados de ${folder}`}
                title="Remover exclusão"
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

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
          <strong>Alguns itens não puderam ser lidos</strong>
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

      {isFilteringStale ? (
        <div className="operation-message subtle" role="status">
          Atualizando resultados...
        </div>
      ) : null}

      {!hasGridContent ? (
        <div className="empty-state">
          <Box size={28} />
          <strong>Nenhum item nesta visão</strong>
          <span>Tente outra pasta, limpe a busca ou atualize a biblioteca.</span>
        </div>
      ) : (
        <VirtualizedRows
          items={collectionItems}
          mode={viewMode}
          scrollElementRef={panelRef}
          renderItem={(item) => {
            if (item.kind === "folder") {
              const folderCard = item.folder;
              return viewMode === "list" ? (
                <button
                  className={`folder-list-row ${
                    dragOverFolder === folderCard.id || pointerDragOverFolder === folderCard.id
                      ? "drop-target"
                      : ""
                  }`}
                  data-folder-drop-id={folderCard.id}
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
                  <span>{folderCard.modelCount} modelo{folderCard.modelCount === 1 ? "" : "s"}</span>
                  <span className="optional-column">
                    {folderCard.childCount} pasta{folderCard.childCount === 1 ? "" : "s"}
                  </span>
                </button>
              ) : (
                <button
                  className={`folder-card ${
                    dragOverFolder === folderCard.id || pointerDragOverFolder === folderCard.id
                      ? "drop-target"
                      : ""
                  }`}
                  data-folder-drop-id={folderCard.id}
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
                  <FolderCardThumbnail models={folderCard.previewModels} />
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
              );
            }

            const model = item.model;
            const sharedProps = {
              model,
              metadata: metadataByPath[model.absolutePath],
              isDuplicate: duplicateModelIds.has(model.id),
              isSelected: selectedModelId === model.id,
              isChecked: selectedModelIds.has(model.id),
              thumbnailRetryGeneration: thumbnailRetryGenerations[model.absolutePath] ?? 0,
              fileDragBehavior,
              onOpenModel,
              onOpenDefaultSlicer,
              onOpenModelContextMenu,
              onToggleModelSelection,
              onDragStartModel,
              onDragEndModel
            };
            return viewMode === "list" ? <ModelListRow {...sharedProps} /> : <ModelCard {...sharedProps} />;
          }}
        />
      )}
    </section>
  );
}

type VirtualizedRowsProps = {
  items: CollectionItem[];
  mode: ModelViewMode;
  scrollElementRef: RefObject<HTMLElement>;
  renderItem: (item: CollectionItem) => ReactNode;
};

function VirtualizedRows({ items, mode, scrollElementRef, renderItem }: VirtualizedRowsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [columns, setColumns] = useState(mode === "grid" ? 4 : 1);
  const [scrollMargin, setScrollMargin] = useState(0);
  const rows = useMemo(
    () => buildVirtualRows(items, mode === "grid" ? columns : 1),
    [columns, items, mode]
  );
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollElementRef.current,
    estimateSize: () => (mode === "grid" ? 252 : 71),
    overscan: 2,
    scrollMargin
  });

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateLayout = () => {
      const nextColumns = mode === "grid"
        ? Math.max(1, Math.floor((container.clientWidth + 14) / (180 + 14)))
        : 1;
      setColumns((current) => current === nextColumns ? current : nextColumns);
      setScrollMargin((current) => current === container.offsetTop ? current : container.offsetTop);
    };

    updateLayout();
    const resizeObserver = new ResizeObserver(updateLayout);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [mode]);

  useLayoutEffect(() => {
    const nextMargin = containerRef.current?.offsetTop ?? 0;
    setScrollMargin((current) => current === nextMargin ? current : nextMargin);
    rowVirtualizer.measure();
  }, [columns, mode, rowVirtualizer, rows.length, scrollMargin]);

  return (
    <div
      ref={containerRef}
      className={`virtual-collection ${mode === "grid" ? "model-grid" : "model-list"}`}
      style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
    >
      {rowVirtualizer.getVirtualItems().map((virtualRow) => (
        <div
          className={`virtual-collection-row ${mode === "grid" ? "virtual-grid-row" : "virtual-list-row"}`}
          data-index={virtualRow.index}
          key={virtualRow.key}
          ref={rowVirtualizer.measureElement}
          style={{
            transform: `translateY(${virtualRow.start - scrollMargin}px)`,
            gridTemplateColumns: mode === "grid" ? `repeat(${columns}, minmax(0, 1fr))` : undefined
          }}
        >
          {rows[virtualRow.index].map((item) => (
            <div className="virtual-collection-cell" key={item.id}>
              {renderItem(item)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

type BreadcrumbProps = {
  selectedFolder: string;
  dragOverFolder: string | null;
  pointerDragOverFolder: string | null;
  onOpenFolder: (folderId: string) => void;
  onDragOverFolder: (event: DragEvent, folderId: string) => void;
  onDropOnFolder: (event: DragEvent, folderId: string) => void;
  onDragLeaveFolder: () => void;
};

function Breadcrumb({
  selectedFolder,
  dragOverFolder,
  pointerDragOverFolder,
  onOpenFolder,
  onDragOverFolder,
  onDropOnFolder,
  onDragLeaveFolder
}: BreadcrumbProps) {
  const parts = selectedFolder === ALL_FOLDERS_ID ? [] : selectedFolder.split("/").filter(Boolean);

  return (
    <nav className="breadcrumbs">
      <button
        className={
          dragOverFolder === ALL_FOLDERS_ID || pointerDragOverFolder === ALL_FOLDERS_ID
            ? "breadcrumb-drop-target"
            : ""
        }
        data-folder-drop-id={ALL_FOLDERS_ID}
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
              className={
                dragOverFolder === folderId || pointerDragOverFolder === folderId
                  ? "breadcrumb-drop-target"
                  : ""
              }
              data-folder-drop-id={folderId}
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
  thumbnailRetryGeneration: number;
  fileDragBehavior: FileDragBehavior;
  onOpenModel: (model: ModelFile, modifiers: { ctrlKey: boolean; shiftKey: boolean }) => void;
  onOpenDefaultSlicer: (model: ModelFile) => void;
  onOpenModelContextMenu: (model: ModelFile, x: number, y: number) => void;
  onToggleModelSelection: (model: ModelFile, selected: boolean) => void;
  onDragStartModel: (model: ModelFile, mode: "external" | "internal") => void;
  onDragEndModel: () => void;
};

function ModelCard({
  model,
  metadata,
  isDuplicate,
  isSelected,
  isChecked,
  thumbnailRetryGeneration,
  fileDragBehavior,
  onOpenModel,
  onOpenDefaultSlicer,
  onOpenModelContextMenu,
  onToggleModelSelection,
  onDragStartModel,
  onDragEndModel
}: ModelCardProps) {
  return (
    <div
      className={`model-card ${isSelected ? "selected" : ""} ${isChecked ? "checked" : ""}`}
      draggable
      title={getFileDragHelp(fileDragBehavior)}
      onDragStart={(event) => {
        if (shouldStartExternalFileDrag(fileDragBehavior, event)) {
          event.preventDefault();
          onDragStartModel(model, "external");
          return;
        }

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-model-library-model", model.id);
        onDragStartModel(model, "internal");
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
      <span className="external-drag-card-cue" aria-hidden="true">
        <Copy size={14} />
      </span>
      <button
        className="model-card-main"
        type="button"
        onClick={(event) =>
          onOpenModel(model, {
            ctrlKey: event.ctrlKey || event.metaKey,
            shiftKey: event.shiftKey
          })
        }
        onDoubleClick={() => void onOpenDefaultSlicer(model)}
      >
        <div className="model-thumb">
          <ModelCardThumbnail model={model} selected={isSelected} key={thumbnailRetryGeneration} />
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
  thumbnailRetryGeneration,
  fileDragBehavior,
  onOpenModel,
  onOpenDefaultSlicer,
  onOpenModelContextMenu,
  onToggleModelSelection,
  onDragStartModel,
  onDragEndModel
}: ModelCardProps) {
  return (
    <div
      className={`model-list-row ${isSelected ? "selected" : ""} ${isChecked ? "checked" : ""}`}
      draggable
      title={getFileDragHelp(fileDragBehavior)}
      onDragStart={(event) => {
        if (shouldStartExternalFileDrag(fileDragBehavior, event)) {
          event.preventDefault();
          onDragStartModel(model, "external");
          return;
        }

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-model-library-model", model.id);
        onDragStartModel(model, "internal");
      }}
      onDragEnd={onDragEndModel}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenModelContextMenu(model, event.clientX, event.clientY);
      }}
    >
      <span className="external-drag-card-cue" aria-hidden="true">
        <Copy size={14} />
      </span>
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
        onDoubleClick={() => void onOpenDefaultSlicer(model)}
      >
        <div className="list-thumb">
          <ModelCardThumbnail model={model} selected={isSelected} key={thumbnailRetryGeneration} />
        </div>
        <strong title={model.name}>{model.name}</strong>
        <span className="optional-column" title={model.relativeFolder || "Raiz"}>
          {model.relativeFolder || "Raiz"}
        </span>
        <span>{model.extension.toUpperCase()}</span>
        <span className="optional-column">{formatBytes(model.sizeBytes)}</span>
        <span className="optional-column">{new Date(model.modifiedAt).toLocaleDateString()}</span>
        <span className="list-flags optional-column">
          {metadata?.favorite ? <Star size={15} fill="currentColor" aria-label="Favorito" /> : null}
          {isDuplicate ? <em>Duplicado</em> : null}
          {metadata?.tags.slice(0, 2).map((tag) => (
            <em key={tag}>{tag}</em>
          ))}
        </span>
      </button>
    </div>
  );
}

function shouldStartExternalFileDrag(
  behavior: FileDragBehavior,
  event: DragEvent<HTMLElement>
): boolean {
  return behavior === "organize-default" ? event.ctrlKey : !event.shiftKey;
}

function getFileDragHelp(behavior: FileDragBehavior): string {
  return behavior === "organize-default"
    ? "Arraste para organizar. Ctrl + arraste para copiar para outro programa."
    : "Arraste para copiar para outro programa. Shift + arraste para organizar.";
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
