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
import { ResponsivePanelControls } from "./ResponsivePanelControls";
import {
  reconcileThumbnailWarmupProgress,
  startThumbnailWarmup,
  type ThumbnailWarmupProgress
} from "../lib/thumbnailWarmup";
import { modelThumbnailService } from "../lib/modelThumbnailService";
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
import { buildVirtualRows, findVirtualRowIndex } from "../lib/virtualGrid";
import type { FileDragBehavior, ModelFile, ModelUserMetadata } from "../shared/types";
import { isArchive, SUPPORTED_FILE_EXTENSIONS, type SupportedFileExtension } from "../shared/fileCapabilities";
import type { ThumbnailDiagnosticsSnapshot } from "../lib/thumbnailDiagnostics";
import type { ResponsivePanel } from "../lib/responsivePanels";
import { useI18n } from "../i18n/I18nProvider";
import { localizeErrorMessage } from "../shared/appError";

type ModelGridProps = {
  models: ModelFile[];
  scopeModelCount: number;
  thumbnailModels?: ModelFile[];
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
  responsivePanel: ResponsivePanel;
  scrollRestoreRequest?: { key: number; top: number } | null;
  modelRevealRequest?: { key: number; modelId: string } | null;
  onScrollTopChange?: (top: number) => void;
  onSearchChange: (query: string) => void;
  onVisibleExtensionsChange: (visibleExtensions: ReadonlySet<SupportedFileExtension>) => void;
  onRemoveFolderExclusion: (folderId: string) => void;
  onClearFolderExclusions: () => void;
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
  onCopyCurrentFolderPath: () => void;
  onOpenFolder: (folderId: string) => void;
  onOpenFolderContextMenu: (folderId: string, x: number, y: number) => void;
  onMoveModelsToFolder: (folderId: string) => void;
  onOpenModel: (model: ModelFile, modifiers: { ctrlKey: boolean; shiftKey: boolean }) => void;
  onOpenDefaultFile: (model: ModelFile) => void;
  onOpenModelContextMenu: (model: ModelFile, x: number, y: number) => void;
  onToggleModelSelection: (model: ModelFile, selected: boolean) => void;
  onDragStartModel: (model: ModelFile, mode: "external" | "internal") => void;
  onDragEndModel: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onToggleFolders: () => void;
  onToggleDetails: () => void;
  settingsNeedsAttention?: boolean;
};

type CollectionItem =
  | { kind: "folder"; id: string; folder: GridFolderCard }
  | { kind: "model"; id: string; model: ModelFile };

export function ModelGrid({
  models,
  scopeModelCount,
  thumbnailModels = models,
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
  responsivePanel,
  scrollRestoreRequest = null,
  modelRevealRequest = null,
  onScrollTopChange = () => undefined,
  onSearchChange,
  onVisibleExtensionsChange,
  onRemoveFolderExclusion,
  onClearFolderExclusions,
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
  onCopyCurrentFolderPath,
  onOpenFolder,
  onOpenFolderContextMenu,
  onMoveModelsToFolder,
  onOpenModel,
  onOpenDefaultFile,
  onOpenModelContextMenu,
  onToggleModelSelection,
  onDragStartModel,
  onDragEndModel,
  onRefresh,
  onOpenSettings,
  onToggleFolders,
  onToggleDetails,
  settingsNeedsAttention = false
}: ModelGridProps) {
  const { locale, t } = useI18n();
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = useState(false);
  const [thumbnailWarmup, setThumbnailWarmup] = useState<ThumbnailWarmupProgress | null>(null);
  const supportedThumbnailModels = useMemo(
    () => thumbnailModels.filter((model) => !isArchive(model.extension)),
    [thumbnailModels]
  );
  const displayedThumbnailWarmup = useMemo(
    () => thumbnailWarmup
      ? reconcileThumbnailWarmupProgress(
          thumbnailWarmup,
          supportedThumbnailModels,
          modelThumbnailService.isReady
        )
      : null,
    [thumbnailWarmup, supportedThumbnailModels, thumbnailDiagnostics]
  );
  const panelRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (scrollRestoreRequest && panelRef.current) {
      panelRef.current.scrollTop = scrollRestoreRequest.top;
    }
  }, [scrollRestoreRequest]);
  useEffect(() => {
    if (supportedThumbnailModels.length === 0) {
      setThumbnailWarmup(null);
      return;
    }
    const warmup = startThumbnailWarmup(
      supportedThumbnailModels,
      modelThumbnailService.request,
      setThumbnailWarmup,
      modelThumbnailService.isReady
    );
    return () => {
      warmup.stop();
    };
  }, [supportedThumbnailModels]);
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
    onSearchChange("");
    onVisibleExtensionsChange(new Set(SUPPORTED_FILE_EXTENSIONS));
    onClearFolderExclusions();
    onOnlySelectedChange(false);
    onOnlyFavoritesChange(false);
    onOnlyDuplicatesChange(false);
    onUsageFilterChange("all");
    onNotesFilterChange("all");
    onTagMatchModeChange("all");
    selectedTags.forEach(onToggleTagFilter);
  }

  return (
    <section
      className="library-panel"
      aria-label={t("library.region")}
      ref={panelRef}
      onScroll={(event) => onScrollTopChange(event.currentTarget.scrollTop)}
    >
      <div className="external-drag-mode-cue" aria-hidden="true">
        <Copy size={17} />
        <span>
          <strong>{t("library.dragExternalCue")}</strong>
          <small>{t("library.dragExternalTargets")}</small>
        </span>
      </div>
      <div className="internal-drag-mode-cue" aria-hidden="true">
        <FolderInput size={17} />
        <span>
          <strong>{t("library.dragInternalCue")}</strong>
          <small>{t("library.dragInternalTarget")}</small>
        </span>
      </div>
      <div className="library-sticky-header">
      <header className="toolbar">
        <div className="library-heading">
          <p className="eyebrow">{t("library.eyebrow")}</p>
          <h2>{t("library.title")}</h2>
          <div className="breadcrumb-row" aria-label={t("library.folderPath")}>
            <button
              className="icon-only small-icon"
              type="button"
              onClick={onNavigateBack}
              disabled={!canNavigateBack}
              aria-label={t("library.backFolder")}
              title={t("navigation.back")}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              className="icon-only small-icon"
              type="button"
              onClick={onNavigateForward}
              disabled={!canNavigateForward}
              aria-label={t("library.forwardFolder")}
              title={t("navigation.forward")}
            >
              <ChevronRight size={15} />
            </button>
            <div className="breadcrumb-actions">
              <Breadcrumb
                selectedFolder={selectedFolder}
                dragOverFolder={dragOverFolder}
                pointerDragOverFolder={pointerDragOverFolder}
                onOpenFolder={onOpenFolder}
                onDragOverFolder={allowFolderDrop}
                onDropOnFolder={dropOnFolder}
                onDragLeaveFolder={() => setDragOverFolder(null)}
              />
              <button
                className="icon-only small-icon breadcrumb-copy-button"
                type="button"
                onClick={onCopyCurrentFolderPath}
                aria-label={t("library.copyFolderPath")}
                title={t("library.copyFolderPath")}
              >
                <Copy size={14} />
              </button>
            </div>
          </div>
        </div>
        <div className="toolbar-actions">
          <ResponsivePanelControls
            openPanel={responsivePanel}
            onToggleFolders={onToggleFolders}
            onToggleDetails={onToggleDetails}
          />
          <div className="drag-behavior-toggle" role="group" aria-label={t("library.dragMode")}>
            <button
              className={fileDragBehavior === "organize-default" ? "active" : ""}
              type="button"
              onClick={() => onFileDragBehaviorChange("organize-default")}
              aria-pressed={fileDragBehavior === "organize-default"}
              aria-label={t("library.organize")}
              title={t("library.organizeHelp")}
            >
              <FolderInput size={15} />
              {t("navigation.folders")}
            </button>
            <button
              className={fileDragBehavior === "external-default" ? "active" : ""}
              type="button"
              onClick={() => onFileDragBehaviorChange("external-default")}
              aria-pressed={fileDragBehavior === "external-default"}
              aria-label={t("library.external")}
              title={t("library.externalHelp")}
            >
              <Copy size={15} />
              {t("library.externalShort")}
            </button>
          </div>
          <div className="view-mode-toggle" role="group" aria-label={t("library.viewMode")}>
            <button
              className={viewMode === "grid" ? "active" : ""}
              type="button"
              onClick={() => onViewModeChange("grid")}
              aria-label={t("library.grid")}
              title={t("library.grid")}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              className={viewMode === "list" ? "active" : ""}
              type="button"
              onClick={() => onViewModeChange("list")}
              aria-label={t("library.list")}
              title={t("library.list")}
            >
              <List size={16} />
            </button>
          </div>
          <button
            className="icon-only settings-toolbar-button"
            type="button"
            onClick={onOpenSettings}
            aria-label={t("common.settings")}
            title={t("common.settings")}
          >
            <Settings size={17} />
            {settingsNeedsAttention ? (
              <span
                className="settings-attention-dot"
                aria-label={t("maintenance.needsAttention")}
              />
            ) : null}
          </button>
          <div className="toolbar-statuses">
            <span className="result-count">
              {hasActiveFilters
                ? t("library.filteredModelCount", {
                    count: scopeModelCount,
                    visible: models.length,
                    total: scopeModelCount
                  })
                : t("library.modelCount", { count: scopeModelCount })}
            </span>
            <ThumbnailQueueStatus snapshot={thumbnailDiagnostics} warmup={displayedThumbnailWarmup} />
            <span
              className={`library-status ${isScanning ? "scanning" : monitorStatus}`}
              title={
                isScanning
                  ? t("library.updating")
                  : monitorStatus === "active"
                    ? t("library.monitoring")
                    : t("library.manual")
              }
            >
              <i aria-hidden="true" />
              {isScanning
                ? t("library.updatingProgress")
                : monitorStatus === "active"
                  ? t("library.monitoring")
                  : t("library.manual")}
            </span>
          </div>
          <button
            className="icon-only"
            type="button"
            onClick={onRefresh}
            disabled={isScanning}
            aria-label={isScanning ? t("library.updating") : t("common.refresh")}
            title={isScanning ? t("library.updating") : t("common.refresh")}
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
          placeholder={t("library.search")}
        />
        {searchQuery ? (
          <button
            className="search-clear-button"
            type="button"
            onClick={() => onSearchChange("")}
            aria-label={t("library.clearSearch")}
            title={t("library.clearSearch")}
          >
            <X size={15} />
          </button>
        ) : null}
      </label>

      <div className="filter-bar" aria-label={t("library.filters")}>
        <div className="advanced-filter-wrap" ref={advancedFiltersRef}>
          <button
            className={`filter-toggle ${advancedFilterCount > 0 ? "active" : ""}`}
            type="button"
            aria-expanded={isAdvancedFiltersOpen}
            aria-label={t("library.advancedFilters")}
            title={t("library.advancedFilters")}
            onClick={() => setIsAdvancedFiltersOpen((open) => !open)}
          >
            <SlidersHorizontal size={14} />
            {advancedFilterCount > 0 ? <span>{advancedFilterCount}</span> : null}
          </button>
          {isAdvancedFiltersOpen ? (
            <div className="advanced-filter-popover">
              <strong>{t("library.advancedFilters")}</strong>
              <label>
                {t("library.usage")}
                <select
                  value={usageFilter}
                  onChange={(event) => onUsageFilterChange(event.currentTarget.value as UsageFilter)}
                >
                  <option value="all">{t("library.usageAny")}</option>
                  <option value="recent">{t("library.usageRecent")}</option>
                  <option value="never">{t("library.usageNever")}</option>
                </select>
              </label>
              <label>
                {t("library.notes")}
                <select
                  value={notesFilter}
                  onChange={(event) => onNotesFilterChange(event.currentTarget.value as NotesFilter)}
                >
                  <option value="all">{t("library.notesAny")}</option>
                  <option value="with-notes">{t("library.notesWith")}</option>
                  <option value="without-notes">{t("library.notesWithout")}</option>
                </select>
              </label>
              <label>
                {t("library.selectedTags")}
                <select
                  value={tagMatchMode}
                  disabled={selectedTags.size === 0}
                  onChange={(event) => onTagMatchModeChange(event.currentTarget.value as TagMatchMode)}
                >
                  <option value="all">{t("library.tagsAll")}</option>
                  <option value="any">{t("library.tagsAny")}</option>
                  <option value="exclude">{t("library.tagsExclude")}</option>
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
          {t("library.sort")}
          <select
            value={sortMode}
            onChange={(event) => onSortModeChange(event.currentTarget.value as ModelSortMode)}
          >
            <option value="name">{t("library.sortName")}</option>
            <option value="modified">{t("library.sortRecent")}</option>
            <option value="size">{t("library.sortSize")}</option>
          </select>
        </label>
        <button
          className={`filter-toggle ${onlySelected ? "active" : ""}`}
          type="button"
          aria-pressed={onlySelected}
          aria-label={t("library.onlySelected")}
          title={t("library.onlySelectedHelp")}
          onClick={() => onOnlySelectedChange(!onlySelected)}
        >
          <CheckSquare2 size={14} />
        </button>
        <button
          className={`filter-toggle ${onlyFavorites ? "active" : ""}`}
          type="button"
          aria-pressed={onlyFavorites}
          aria-label={t("library.onlyFavorites")}
          title={t("library.onlyFavoritesHelp")}
          onClick={() => onOnlyFavoritesChange(!onlyFavorites)}
        >
          <Star size={14} fill={onlyFavorites ? "currentColor" : "none"} />
        </button>
        <button
          className={`filter-toggle ${onlyDuplicates ? "active" : ""}`}
          type="button"
          aria-pressed={onlyDuplicates}
          aria-label={t("library.onlyDuplicates")}
          title={t("library.onlyDuplicatesHelp")}
          onClick={() => onOnlyDuplicatesChange(!onlyDuplicates)}
        >
          <Copy size={14} />
        </button>
        {hasActiveFilters ? (
          <button className="filter-clear" type="button" onClick={clearFilters} title={t("library.clearFilters")}>
            <X size={14} />
            {t("library.clearFilters")}
          </button>
        ) : null}
      </div>

      {excludedFolders.length > 0 ? (
        <div className="exclusion-filter-row" aria-label={t("library.excludedFolders")}>
          {excludedFolders.map((folder) => (
            <span className="exclusion-chip" key={folder}>
              <span title={folder}>{folder}</span>
              <button
                type="button"
                onClick={() => onRemoveFolderExclusion(folder)}
                aria-label={t("library.showFolderResults", { name: folder })}
                title={t("library.removeExclusion")}
              >
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {availableTags.length > 0 ? (
        <div className="tag-filter-row" aria-label={t("library.tagFilters")}>
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
      </div>

      {scanErrors.length > 0 ? (
        <div className="scan-errors" role="status">
          <strong>{t("library.scanErrors")}</strong>
          {scanErrors.slice(0, 4).map((error) => (
            <span key={`${error.path}-${error.message}`}>
              {error.path}: {localizeErrorMessage(locale, new Error(error.message))}
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
          {t("library.filtering")}
        </div>
      ) : null}

      {visibleExtensions.size === 0 ? (
        <div className="empty-state" role="status">
          <Box size={28} />
          <strong>{t("library.allTypesHidden")}</strong>
          <span>{t("library.enableType")}</span>
        </div>
      ) : !hasGridContent ? (
        <div className="empty-state">
          <Box size={28} />
          <strong>{t("library.empty")}</strong>
          <span>{t("library.emptyHelp")}</span>
        </div>
      ) : (
        <VirtualizedRows
          items={collectionItems}
          mode={viewMode}
          scrollElementRef={panelRef}
          modelRevealRequest={modelRevealRequest}
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
                  <span>{t("library.folderModelCount", { count: folderCard.modelCount })}</span>
                  <span className="optional-column">
                    {t("library.childFolderCount", { count: folderCard.childCount })}
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
                      {t("library.folderModelCount", { count: folderCard.modelCount })}
                      {folderCard.childCount > 0
                        ? ` - ${t("library.childFolderCount", { count: folderCard.childCount })}`
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
              onOpenDefaultFile,
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
  modelRevealRequest?: { key: number; modelId: string } | null;
  renderItem: (item: CollectionItem) => ReactNode;
};

function VirtualizedRows({
  items,
  mode,
  scrollElementRef,
  modelRevealRequest,
  renderItem
}: VirtualizedRowsProps) {
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

  useLayoutEffect(() => {
    if (!modelRevealRequest) return;
    const rowIndex = findVirtualRowIndex(
      items.map((item) => item.id),
      mode === "grid" ? columns : 1,
      `model:${modelRevealRequest.modelId}`
    );
    if (rowIndex !== null) rowVirtualizer.scrollToIndex(rowIndex, { align: "center" });
  }, [columns, items, mode, modelRevealRequest, rowVirtualizer]);

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
  const { t } = useI18n();
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
        title={t("navigation.allModels")}
        onClick={() => onOpenFolder(ALL_FOLDERS_ID)}
        onDragOver={(event) => onDragOverFolder(event, ALL_FOLDERS_ID)}
        onDragLeave={onDragLeaveFolder}
        onDrop={(event) => onDropOnFolder(event, ALL_FOLDERS_ID)}
      >
        {t("navigation.allModels")}
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
              title={part}
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
  onOpenDefaultFile: (model: ModelFile) => void;
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
  onOpenDefaultFile,
  onOpenModelContextMenu,
  onToggleModelSelection,
  onDragStartModel,
  onDragEndModel
}: ModelCardProps) {
  const { t } = useI18n();
  return (
    <div
      className={`model-card ${isSelected ? "selected" : ""} ${isChecked ? "checked" : ""}`}
      draggable
      title={t(fileDragBehavior === "organize-default" ? "library.organizeDragHelp" : "library.externalDragHelp")}
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
          aria-label={t("library.selectModel", { name: model.name })}
        />
      </label>
      {metadata?.favorite ? (
        <div className="favorite-badge" title={t("library.favorite")} aria-label={t("library.favorite")}>
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
        onDoubleClick={() => void onOpenDefaultFile(model)}
      >
        <div className="model-thumb">
          <ModelCardThumbnail model={model} selected={isSelected} key={thumbnailRetryGeneration} />
        </div>
        <div className="model-card-meta">
          <strong title={model.name}>{model.name}</strong>
          <span title={model.relativeFolder || t("common.root")}>
            {model.relativeFolder || t("common.root")} - {formatBytes(model.sizeBytes)}
          </span>
          {isDuplicate ? <span className="duplicate-label">{t("library.possibleDuplicate")}</span> : null}
          {metadata?.tags.length ? (
            <div className="card-tags" aria-label={t("library.tags")}>
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
  onOpenDefaultFile,
  onOpenModelContextMenu,
  onToggleModelSelection,
  onDragStartModel,
  onDragEndModel
}: ModelCardProps) {
  const { t, formatDate } = useI18n();
  return (
    <div
      className={`model-list-row ${isSelected ? "selected" : ""} ${isChecked ? "checked" : ""}`}
      draggable
      title={t(fileDragBehavior === "organize-default" ? "library.organizeDragHelp" : "library.externalDragHelp")}
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
          aria-label={t("library.selectModel", { name: model.name })}
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
        onDoubleClick={() => void onOpenDefaultFile(model)}
      >
        <div className="list-thumb">
          <ModelCardThumbnail model={model} selected={isSelected} key={thumbnailRetryGeneration} />
        </div>
        <strong title={model.name}>{model.name}</strong>
        <span className="optional-column" title={model.relativeFolder || t("common.root")}>
          {model.relativeFolder || t("common.root")}
        </span>
        <span>{model.extension.toUpperCase()}</span>
        <span className="optional-column">{formatBytes(model.sizeBytes)}</span>
        <span className="optional-column">{formatDate(model.modifiedAt)}</span>
        <span className="list-flags optional-column">
          {metadata?.favorite ? <Star size={15} fill="currentColor" aria-label={t("library.favorite")} /> : null}
          {isDuplicate ? <em>{t("library.duplicate")}</em> : null}
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
