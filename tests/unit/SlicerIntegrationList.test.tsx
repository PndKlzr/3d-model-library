import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../src/i18n/I18nProvider";
import { SlicerIntegrationList } from "../../src/components/SlicerIntegrationList";
import type { SlicerConfig } from "../../src/shared/types";

const slicers: SlicerConfig[] = [
  { id: "cura", name: "Cura", kind: "built-in", builtInKey: "cura", executablePath: "C:\\Apps\\Cura.exe", enabled: true, pathSource: "manual" },
  { id: "orca-slicer", name: "OrcaSlicer", kind: "built-in", builtInKey: "orca-slicer", executablePath: "C:\\Program Files\\OrcaSlicer 2.3.1\\orca-slicer.exe", enabled: true, pathSource: "detected" },
  { id: "prusa-slicer", name: "PrusaSlicer", kind: "built-in", builtInKey: "prusa-slicer", executablePath: "", enabled: false, pathSource: null },
  { id: "custom-one", name: "Meu Programa", kind: "custom", executablePath: "C:\\Apps\\Custom.exe", enabled: true, pathSource: "manual" }
];

function renderList(locale: "pt-BR" | "en" = "pt-BR") {
  const callbacks = {
    onDetect: vi.fn(), onAdd: vi.fn(), onEnable: vi.fn(), onDefault: vi.fn(),
    onChooseExecutable: vi.fn(), onUseAutomatic: vi.fn(), onRename: vi.fn(), onRemove: vi.fn()
  };
  render(<I18nProvider locale={locale}><SlicerIntegrationList
    slicers={slicers} defaultSlicerId="cura" detecting={false} {...callbacks}
  /></I18nProvider>);
  return callbacks;
}

describe("SlicerIntegrationList", () => {
  it("shows detected, manual, and unconfigured states in Portuguese and English", () => {
    renderList();
    expect(screen.getByText("OrcaSlicer 2.3.1")).toBeTruthy();
    expect(screen.getByText("Encontrado")).toBeTruthy();
    expect(screen.getAllByText("Manual").length).toBeGreaterThan(0);
    expect(screen.getByText("Não configurado")).toBeTruthy();
  });

  it("shows a configured but missing executable as unavailable", () => {
    const callbacks = {
      onDetect: vi.fn(), onAdd: vi.fn(), onEnable: vi.fn(), onDefault: vi.fn(),
      onChooseExecutable: vi.fn(), onUseAutomatic: vi.fn(), onRename: vi.fn(), onRemove: vi.fn()
    };
    render(<I18nProvider locale="pt-BR"><SlicerIntegrationList
      slicers={slicers} defaultSlicerId="cura" detecting={false}
      unavailableSlicerIds={["orca-slicer"]} {...callbacks}
    /></I18nProvider>);

    expect(screen.getByText("Indisponível")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "OrcaSlicer: Padrão" }).hasAttribute("disabled")).toBe(true);
  });

  it("keeps default selection explicit and offers detection and custom creation", () => {
    const callbacks = renderList("en");
    fireEvent.click(screen.getByRole("button", { name: "Detect again" }));
    fireEvent.click(screen.getByRole("button", { name: "Add program" }));
    fireEvent.click(screen.getByRole("radio", { name: "OrcaSlicer: Default" }));
    expect(callbacks.onDetect).toHaveBeenCalledOnce();
    expect(callbacks.onAdd).toHaveBeenCalledOnce();
    expect(callbacks.onDefault).toHaveBeenCalledWith("orca-slicer");
  });

  it("closes its action menu with Escape", () => {
    renderList();
    fireEvent.click(screen.getByRole("button", { name: "Ações de Meu Programa" }));
    expect(screen.getByRole("menuitem", { name: "Renomear" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: "Renomear" })).toBeNull();
  });

  it("offers repair and custom edit actions in an overflow menu", () => {
    const callbacks = renderList();
    fireEvent.click(screen.getByRole("button", { name: "Ações de Meu Programa" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Renomear" }));
    expect(callbacks.onRename).toHaveBeenCalledWith("custom-one");
    fireEvent.click(screen.getByRole("button", { name: "Ações de Meu Programa" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remover" }));
    expect(callbacks.onRemove).toHaveBeenCalledWith("custom-one");
  });

  it("lets a built-in slicer return from a manual override to automatic detection", () => {
    const callbacks = renderList();
    fireEvent.click(screen.getByRole("button", { name: "Ações de Cura" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Voltar para detecção automática" }));
    expect(callbacks.onUseAutomatic).toHaveBeenCalledWith("cura");
  });
});
