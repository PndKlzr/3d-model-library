import { describe, expect, it } from "vitest";
import {
  toAppErrorPayload,
  localizeOperationMessage,
  localizeErrorMessage,
  translateAppError,
  type AppErrorPayload
} from "../../src/shared/appError";

describe("application errors", () => {
  it("classifies known library and slicer failures with stable codes", () => {
    expect(toAppErrorPayload(new Error("A biblioteca não está ativa."))).toEqual({
      code: "libraryInactive"
    });
    expect(toAppErrorPayload(new Error("O executável do Cura não foi encontrado."))).toEqual({
      code: "slicerExecutableMissing",
      params: { name: "Cura" }
    });
  });

  it("turns unknown failures into a safe generic payload", () => {
    expect(toAppErrorPayload(new Error("secret implementation detail"))).toEqual({
      code: "unexpected"
    });
  });

  it("preserves detailed Portuguese errors but never leaks untranslated errors in English", () => {
    expect(localizeErrorMessage("pt-BR", new Error("Detalhe útil da operação."))).toBe(
      "Detalhe útil da operação."
    );
    expect(localizeErrorMessage("en", new Error("Detalhe interno em português."))).toBe(
      "Something went wrong. Please try again."
    );
  });

  it("keeps explicitly supplied path parameters verbatim when translating", () => {
    const payload: AppErrorPayload = {
      code: "pathOutsideLibrary",
      params: { path: "C:\\Models\\Peça + teste.stl" }
    };

    expect(translateAppError("en", payload)).toBe(
      "C:\\Models\\Peça + teste.stl is outside the active library."
    );
    expect(translateAppError("pt-BR", payload)).toBe(
      "C:\\Models\\Peça + teste.stl está fora da biblioteca ativa."
    );
  });

  it("localizes common operation results while preserving counts and names", () => {
    expect(localizeOperationMessage("en", "Pasta criada.")).toBe("Folder created.");
    expect(localizeOperationMessage("en", "3 arquivos movidos.")).toBe("3 files moved.");
    expect(localizeOperationMessage("en", "Abrindo peça + final.stl no Cura.")).toBe(
      "Opening peça + final.stl in Cura."
    );
    expect(localizeOperationMessage("pt-BR", "Pasta criada.")).toBe("Pasta criada.");
  });

  it("localizes native drag and slicer validation messages", () => {
    expect(localizeOperationMessage("en", "Arraste iniciado para 1 arquivo(s).")).toBe(
      "Drag started for 1 file."
    );
    expect(localizeOperationMessage("en", "Arraste iniciado para 2 arquivo(s).")).toBe(
      "Drag started for 2 files."
    );
    expect(localizeOperationMessage("en", "Slicer não configurado.")).toBe(
      "No slicer is configured."
    );
    expect(
      localizeOperationMessage(
        "en",
        "Selecione pelo menos um STL ou 3MF para abrir no slicer."
      )
    ).toBe("Select at least one STL or 3MF file to open in the slicer.");
  });
});
