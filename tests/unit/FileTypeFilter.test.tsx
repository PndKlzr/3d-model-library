import "@testing-library/jest-dom/vitest";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FileTypeFilter } from "../../src/components/FileTypeFilter";
import { SUPPORTED_FILE_EXTENSIONS } from "../../src/shared/fileCapabilities";

describe("FileTypeFilter", () => {
  it("exposes checked, mixed, and unchecked category states", () => {
    const { getByRole } = renderFilter(new Set([".stl", ".3mf", ".obj", ".png"]));
    fireEvent.click(getByRole("button", { name: "Filtrar tipos de arquivo" }));

    expect(getByRole("checkbox", { name: "Modelos" })).toBeChecked();
    expect(getByRole("checkbox", { name: "Imagens" })).toHaveAttribute("aria-checked", "mixed");
    expect(getByRole("checkbox", { name: "Arquivos compactados" })).not.toBeChecked();
  });

  it("toggles all category children from a mixed state", () => {
    const onChange = vi.fn();
    const { getByRole } = renderFilter(new Set([".png"]), onChange);
    fireEvent.click(getByRole("button", { name: "Filtrar tipos de arquivo" }));

    fireEvent.click(getByRole("checkbox", { name: "Imagens" }));

    expect([...onChange.mock.calls[0][0]]).toEqual([
      ".png", ".jpg", ".jpeg", ".webp"
    ]);
  });

  it("toggles individual extensions without changing unrelated types", () => {
    const onChange = vi.fn();
    const { getByRole } = renderFilter(new Set([".stl", ".png"]), onChange);
    fireEvent.click(getByRole("button", { name: "Filtrar tipos de arquivo" }));

    fireEvent.click(getByRole("checkbox", { name: "3MF" }));

    expect([...onChange.mock.calls[0][0]]).toEqual([".stl", ".3mf", ".png"]);
  });

  it("allows zero selected types and announces the empty state", () => {
    const onChange = vi.fn();
    const { getByRole, getByText } = renderFilter(new Set(), onChange);
    fireEvent.click(getByRole("button", { name: "Filtrar tipos de arquivo" }));

    expect(getByText("Todos os tipos estão ocultos")).toBeVisible();
    fireEvent.click(getByRole("checkbox", { name: "PNG" }));
    expect([...onChange.mock.calls[0][0]]).toEqual([".png"]);
  });

  it("opens an accessible popover and closes it with Escape", () => {
    const { getByRole, queryByRole } = renderFilter(new Set(SUPPORTED_FILE_EXTENSIONS));

    const trigger = getByRole("button", { name: "Filtrar tipos de arquivo" });
    fireEvent.click(trigger);
    expect(getByRole("dialog", { name: "Tipos de arquivo" }))
      .toHaveClass("viewport-safe-popover");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(queryByRole("dialog", { name: "Tipos de arquivo" })).toBeNull();
  });
});

function renderFilter(
  visibleExtensions: ReadonlySet<(typeof SUPPORTED_FILE_EXTENSIONS)[number]>,
  onChange = vi.fn()
) {
  return render(
    <FileTypeFilter visibleExtensions={visibleExtensions} onChange={onChange} />
  );
}
