import "@testing-library/jest-dom/vitest";
import { fireEvent, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ModelGrid } from "../../src/components/ModelGrid";
import { SUPPORTED_FILE_EXTENSIONS } from "../../src/shared/fileCapabilities";

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe("ModelGrid filters", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  });

  it("removes an exclusion chip through its real control", () => {
    const onRemoveFolderExclusion = vi.fn();
    const view = renderGrid({
      excludedFolders: ["parts/archive"],
      onRemoveFolderExclusion
    });

    fireEvent.click(view.getByRole("button", { name: "Mostrar resultados de parts/archive" }));

    expect(onRemoveFolderExclusion).toHaveBeenCalledOnce();
    expect(onRemoveFolderExclusion).toHaveBeenCalledWith("parts/archive");
  });

  it("clears every filter through the single clear action", () => {
    const callbacks = {
      onSearchChange: vi.fn(),
      onVisibleExtensionsChange: vi.fn(),
      onClearFolderExclusions: vi.fn(),
      onOnlySelectedChange: vi.fn(),
      onOnlyFavoritesChange: vi.fn(),
      onOnlyDuplicatesChange: vi.fn(),
      onUsageFilterChange: vi.fn(),
      onNotesFilterChange: vi.fn(),
      onTagMatchModeChange: vi.fn(),
      onToggleTagFilter: vi.fn()
    };
    const view = renderGrid({
      ...callbacks,
      searchQuery: "helmet",
      visibleExtensions: new Set([".stl"]),
      excludedFolders: ["archive"],
      onlySelected: true,
      onlyFavorites: true,
      onlyDuplicates: true,
      usageFilter: "recent",
      notesFilter: "with-notes",
      tagMatchMode: "any",
      selectedTags: new Set(["cosplay", "draft"])
    });

    fireEvent.click(view.getByRole("button", { name: "Limpar filtros" }));

    expect(callbacks.onSearchChange).toHaveBeenCalledWith("");
    expect([...callbacks.onVisibleExtensionsChange.mock.calls[0][0]])
      .toEqual([...SUPPORTED_FILE_EXTENSIONS]);
    expect(callbacks.onClearFolderExclusions).toHaveBeenCalledOnce();
    expect(callbacks.onOnlySelectedChange).toHaveBeenCalledWith(false);
    expect(callbacks.onOnlyFavoritesChange).toHaveBeenCalledWith(false);
    expect(callbacks.onOnlyDuplicatesChange).toHaveBeenCalledWith(false);
    expect(callbacks.onUsageFilterChange).toHaveBeenCalledWith("all");
    expect(callbacks.onNotesFilterChange).toHaveBeenCalledWith("all");
    expect(callbacks.onTagMatchModeChange).toHaveBeenCalledWith("all");
    expect(callbacks.onToggleTagFilter.mock.calls.map(([tag]) => tag).sort())
      .toEqual(["cosplay", "draft"]);
  });

  it("shows the explicit empty-type state even when folder cards are supplied", () => {
    const view = renderGrid({
      visibleExtensions: new Set(),
      folderCards: [{
        id: "parts",
        name: "parts",
        modelCount: 3,
        childCount: 0,
        previewModels: []
      }]
    });

    expect(view.getByText("Todos os tipos estão ocultos")).toBeVisible();
    expect(view.container.querySelector('[data-folder-drop-id="parts"]')).toBeNull();
  });

  it("keeps toolbar, search, filters, and chips in one sticky header region", () => {
    const view = renderGrid({ excludedFolders: ["archive"] });
    const stickyHeader = view.container.querySelector(".library-sticky-header");

    expect(stickyHeader).not.toBeNull();
    expect(stickyHeader).toContainElement(view.container.querySelector(".toolbar"));
    expect(stickyHeader).toContainElement(view.container.querySelector(".search-box"));
    expect(stickyHeader).toContainElement(view.container.querySelector(".filter-bar"));
    expect(stickyHeader).toContainElement(view.container.querySelector(".exclusion-filter-row"));
    expect(stickyHeader).not.toContainElement(view.container.querySelector(".empty-state"));
  });
});

function renderGrid(overrides: Partial<ComponentProps<typeof ModelGrid>> = {}) {
  const noop = vi.fn();
  const props: ComponentProps<typeof ModelGrid> = {
    models: [],
    folderCards: [],
    scanErrors: [],
    selectedModelId: null,
    selectedModelIds: new Set(),
    searchQuery: "",
    visibleExtensions: new Set(SUPPORTED_FILE_EXTENSIONS),
    excludedFolders: [],
    sortMode: "name",
    onlySelected: false,
    onlyFavorites: false,
    onlyDuplicates: false,
    usageFilter: "all",
    notesFilter: "all",
    tagMatchMode: "all",
    availableTags: [],
    selectedTags: new Set(),
    metadataByPath: {},
    duplicateModelIds: new Set(),
    thumbnailRetryGenerations: {},
    thumbnailDiagnostics: {
      queued: { selected: 0, visible: 0, nearby: 0, mosaic: 0, historical: 0, total: 0 },
      queuedByStage: { io: 0, render: 0, total: 0 },
      running: { io: 0, render: 0, total: 0 },
      cacheHits: 0,
      cacheMisses: 0,
      embeddedHits: 0,
      renders: 0,
      failures: 0,
      discardedHistorical: 0,
      longTasks: { count: 0, maximumMs: 0 },
      retainedResults: { current: 0, peak: 0 },
      durationMs: {
        io: { count: 0, average: 0, maximum: 0 },
        render: { count: 0, average: 0, maximum: 0 },
        total: { count: 0, average: 0, maximum: 0 }
      }
    },
    isScanning: false,
    monitorStatus: "active",
    isFilteringStale: false,
    canMoveModels: false,
    pointerDragOverFolder: null,
    operationMessage: null,
    selectedFolder: "__all__",
    viewMode: "grid",
    fileDragBehavior: "organize-default",
    canNavigateBack: false,
    canNavigateForward: false,
    onSearchChange: noop,
    onVisibleExtensionsChange: noop,
    onRemoveFolderExclusion: noop,
    onClearFolderExclusions: noop,
    onSortModeChange: noop,
    onOnlySelectedChange: noop,
    onOnlyFavoritesChange: noop,
    onOnlyDuplicatesChange: noop,
    onUsageFilterChange: noop,
    onNotesFilterChange: noop,
    onTagMatchModeChange: noop,
    onToggleTagFilter: noop,
    onViewModeChange: noop,
    onFileDragBehaviorChange: noop,
    onNavigateBack: noop,
    onNavigateForward: noop,
    onOpenFolder: noop,
    onOpenFolderContextMenu: noop,
    onMoveModelsToFolder: noop,
    onOpenModel: noop,
    onOpenDefaultSlicer: noop,
    onOpenModelContextMenu: noop,
    onToggleModelSelection: noop,
    onDragStartModel: noop,
    onDragEndModel: noop,
    onRefresh: noop,
    onOpenSettings: noop,
    ...overrides
  };

  return render(<ModelGrid {...props} />);
}
