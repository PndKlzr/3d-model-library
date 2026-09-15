import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import type {
  AppSettings,
  LibraryActivationResult,
  LibraryScanResult,
  LibrarySessionRef,
  ModelFile
} from "../../src/shared/types";

const thumbnail = vi.hoisted(() => ({
  beginLibrarySession: vi.fn(),
  getDiagnostics: vi.fn(() => ({ queued: { total: 0 }, running: { io: 0, render: 0 }, failures: 0 })),
  subscribe: vi.fn(() => () => undefined)
}));

vi.mock("../../src/lib/modelThumbnailService", () => ({ modelThumbnailService: thumbnail }));
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () => Array.from({ length: count }, (_, index) => ({
      index,
      key: index,
      start: index * estimateSize()
    })),
    measure: () => undefined,
    measureElement: () => undefined
  })
}));
vi.mock("../../src/lib/thumbnailDiagnostics", () => ({
  observeThumbnailLongTasks: () => ({ start() {}, stop() {} })
}));
vi.mock("../../src/components/ModelCardThumbnail", () => ({ ModelCardThumbnail: () => null }));
vi.mock("../../src/components/FolderCardThumbnail", () => ({ FolderCardThumbnail: () => null }));
vi.mock("../../src/components/ThumbnailQueueStatus", () => ({ ThumbnailQueueStatus: () => null }));
vi.mock("../../src/components/FolderTree", () => ({
  FolderTree: ({ onSelectFolder }: { onSelectFolder: (folderId: string) => void }) => (
    <button type="button" onClick={() => onSelectFolder("parts")}>Open parts</button>
  )
}));
vi.mock("../../src/components/DetailsPanel", () => ({ DetailsPanel: () => null }));
vi.mock("../../src/components/SettingsDialog", () => ({
  SettingsDialog: ({ onChooseLibraryFolder }: { onChooseLibraryFolder: () => void }) =>
    <button type="button" onClick={onChooseLibraryFolder}>Choose synthetic library</button>
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const A: LibrarySessionRef = { generation: 1, libraryId: "synthetic-a", rootPath: "C:\\synthetic-a" };
const B: LibrarySessionRef = { generation: 2, libraryId: "synthetic-b", rootPath: "C:\\synthetic-b" };

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

describe("App library workflow", () => {
  it("applies real search, type, and favorite controls without scanning, after a positive activation scan", async () => {
    const api = installApi();
    render(<App />);
    await waitFor(() => expect(api.scanLibrary).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: "Somente favoritos" });
    const scanCount = api.scanLibrary.mock.calls.length;

    fireEvent.change(screen.getByPlaceholderText("Buscar por nome, pasta, tag ou nota"), {
      target: { value: "fixture" }
    });
    await waitFor(() => expect(screen.getByPlaceholderText("Buscar por nome, pasta, tag ou nota"))
      .toHaveValue("fixture"));
    fireEvent.click(screen.getByRole("button", { name: "Somente favoritos" }));
    expect(screen.getByRole("button", { name: "Somente favoritos" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Filtrar tipos de arquivo" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "STL" }));
    expect(screen.getByRole("checkbox", { name: "STL" })).not.toBeChecked();
    await waitFor(() => expect(screen.getByText("Nenhum item nesta visão")).toBeVisible());
    expect(api.scanLibrary).toHaveBeenCalledTimes(scanCount);

    fireEvent.click(screen.getByRole("button", { name: "Atualizar biblioteca" }));
    await waitFor(() => expect(api.scanLibrary).toHaveBeenCalledTimes(scanCount + 1));
  });

  it("removes A from the mounted UI before B cache is published", async () => {
    const pendingB = deferred<LibraryActivationResult>();
    const api = installApi({ activationB: pendingB.promise });
    const view = render(<App />);
    await screen.findByRole("button", { name: "synthetic-tag-a" });
    fireEvent.click(screen.getByRole("button", { name: /fixture-a.stl/i }));
    expect(view.container.querySelector(".model-card.selected")).not.toBeNull();
    const search = screen.getByPlaceholderText("Buscar por nome, pasta, tag ou nota");
    fireEvent.change(search, { target: { value: "fixture-a" } });
    expect(search).toHaveValue("fixture-a");

    fireEvent.click(screen.getByRole("button", { name: "Configurações" }));
    fireEvent.click(screen.getByRole("button", { name: "Choose synthetic library" }));
    await waitFor(() => expect(api.activateLibrary).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("button", { name: "synthetic-tag-a" })).toBeNull());
    expect(screen.queryByRole("button", { name: "synthetic-tag-b" })).toBeNull();
    expect(search).toHaveValue("");
    expect(view.container.querySelector(".model-card.selected")).toBeNull();

    thumbnail.beginLibrarySession.mockImplementationOnce((session: LibrarySessionRef) => {
      expect(session).toEqual(B);
      expect(view.queryByRole("button", { name: "synthetic-tag-a" })).toBeNull();
    });
    await act(async () => pendingB.resolve(activation(B, "b")));
    await screen.findByRole("button", { name: "synthetic-tag-b" });
    expect(screen.queryByRole("button", { name: "synthetic-tag-a" })).toBeNull();
    expect(thumbnail.beginLibrarySession).toHaveBeenCalledWith(B);
  });

  it("restores search and filters when navigating back to a previous folder", async () => {
    installApi();
    render(<App />);
    await screen.findByRole("button", { name: "Somente favoritos" });
    const search = screen.getByPlaceholderText("Buscar por nome, pasta, tag ou nota");

    fireEvent.change(search, { target: { value: "fixture" } });
    fireEvent.click(screen.getByRole("button", { name: "Somente favoritos" }));
    fireEvent.click(screen.getByRole("button", { name: "Open parts" }));
    fireEvent.change(search, { target: { value: "different" } });
    fireEvent.click(screen.getByRole("button", { name: "Somente favoritos" }));
    fireEvent.click(screen.getByRole("button", { name: "Voltar pasta" }));

    expect(search).toHaveValue("fixture");
    expect(screen.getByRole("button", { name: "Somente favoritos" }))
      .toHaveAttribute("aria-pressed", "true");
  });
});

function installApi(options: { activationB?: Promise<LibraryActivationResult> } = {}) {
  const settings: AppSettings = {
    libraryPath: A.rootPath,
    includeSubfolders: true,
    monitorLibrary: false,
    fileDragBehavior: "organize-default",
    archiveExtractorPath: "",
    defaultSlicerId: null,
    slicers: []
  };
  const scanLibrary = vi.fn(async (session: LibrarySessionRef) => ({
    session,
    result: catalog(session, session.libraryId === A.libraryId ? "a" : "b")
  }));
  const activateLibrary = vi.fn(async (rootPath: string) =>
    rootPath === A.rootPath ? activation(A, "a") : options.activationB ?? activation(B, "b"));
  const api = {
    getThumbnailBenchmark: vi.fn(async () => null),
    getSettings: vi.fn(async () => settings),
    saveSettings: vi.fn(async (next: AppSettings) => next),
    chooseLibraryFolder: vi.fn(async () => B.rootPath),
    activateLibrary,
    scanLibrary,
    getModelHashes: vi.fn(async () => ({})),
    onLibraryChanged: vi.fn(() => () => undefined),
    onLibraryMonitoringError: vi.fn(() => () => undefined),
    onFileDragStatus: vi.fn(() => () => undefined)
  };
  Object.defineProperty(window, "modelLibrary", { configurable: true, value: api });
  return api;
}

function activation(session: LibrarySessionRef, suffix: string): LibraryActivationResult {
  const model = catalog(session, suffix).models[0];
  return {
    session,
    cachedResult: catalog(session, suffix),
    metadata: {
      models: { [model.absolutePath]: { favorite: true, tags: [`synthetic-tag-${suffix}`], notes: `note-${suffix}` } },
      tagCatalog: [`synthetic-tag-${suffix}`],
      slicerHistory: []
    },
    metadataStatus: { availability: "ready", writable: true, source: "primary", message: null }
  };
}

function catalog(session: LibrarySessionRef, suffix: string): LibraryScanResult {
  const model: ModelFile = {
    id: `${session.rootPath}\\fixture-${suffix}.stl`,
    absolutePath: `${session.rootPath}\\fixture-${suffix}.stl`,
    name: `fixture-${suffix}.stl`,
    relativeFolder: "",
    extension: ".stl",
    sizeBytes: 20,
    modifiedAt: "2026-09-12T00:00:00.000Z",
    dimensionsMm: null,
    objectCount: null,
    previewError: null
  };
  return { rootPath: session.rootPath, models: [model], folders: [], errors: [] };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
