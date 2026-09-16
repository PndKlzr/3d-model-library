import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LibraryMaintenanceSettings } from "../../src/components/LibraryMaintenanceSettings";
import { I18nProvider } from "../../src/i18n/I18nProvider";

describe("LibraryMaintenanceSettings", () => {
  it("shows a calm healthy state and groups maintenance actions", () => {
    renderMaintenance();
    expect(screen.getByText("Biblioteca protegida")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Exportar backup" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reconstruir índice" })).toBeTruthy();
    expect(screen.queryByText("Problemas encontrados")).toBeNull();
  });

  it("confirms index rebuild before running it", () => {
    const onRebuildIndex = vi.fn(async () => undefined);
    renderMaintenance({ onRebuildIndex });
    fireEvent.click(screen.getByRole("button", { name: "Reconstruir índice" }));
    expect(onRebuildIndex).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Reconstruir agora" }));
    expect(onRebuildIndex).toHaveBeenCalledOnce();
  });

  it("shows errors and offers retry only for thumbnail issues", () => {
    const onRetryThumbnail = vi.fn();
    renderMaintenance({
      onRetryThumbnail,
      health: {
        checkedAt: null,
        counts: { warning: 0, error: 1 },
        issues: [{
          id: "thumb",
          code: "thumbnail-failed",
          severity: "error",
          relativePath: "parts/broken.stl",
          detail: "render failed"
        }]
      }
    });
    expect(screen.getByText("Problemas encontrados")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar miniatura novamente" }));
    expect(onRetryThumbnail).toHaveBeenCalledWith("parts/broken.stl");
  });
});

function renderMaintenance(overrides: Partial<React.ComponentProps<typeof LibraryMaintenanceSettings>> = {}) {
  const props: React.ComponentProps<typeof LibraryMaintenanceSettings> = {
    dataStatus: {
      libraryId: "library-a",
      updatedAt: "2026-09-16T12:00:00.000Z",
      availability: "ready",
      writable: true,
      source: "primary",
      modelCount: 12,
      tagCount: 4
    },
    health: { checkedAt: null, counts: { warning: 0, error: 0 }, issues: [] },
    busyAction: null,
    onExportBackup: vi.fn(async () => undefined),
    onRestoreBackup: vi.fn(async () => undefined),
    onOpenDataFolder: vi.fn(async () => undefined),
    onVerify: vi.fn(async () => undefined),
    onRebuildIndex: vi.fn(async () => undefined),
    onCleanThumbnails: vi.fn(async () => undefined),
    onRetryThumbnail: vi.fn(),
    ...overrides
  };
  return render(<I18nProvider locale="pt-BR"><LibraryMaintenanceSettings {...props} /></I18nProvider>);
}
