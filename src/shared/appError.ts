import type { AppLocale } from "./types.js";
import { translate, type TranslationParams } from "../i18n/translate.js";

export type AppErrorCode =
  | "unexpected"
  | "libraryInactive"
  | "slicerExecutableMissing"
  | "pathOutsideLibrary";

export type AppErrorPayload = {
  code: AppErrorCode;
  params?: TranslationParams;
};

export function toAppErrorPayload(error: unknown): AppErrorPayload {
  const message = unwrapElectronError(error instanceof Error ? error.message : String(error));

  if (/biblioteca não está ativa|library (session )?is not active/i.test(message)) {
    return { code: "libraryInactive" };
  }

  const slicerMatch = message.match(/(?:executável do|executable for) (.+?) (?:não foi encontrado|was not found)/i);
  if (slicerMatch) {
    return { code: "slicerExecutableMissing", params: { name: slicerMatch[1] } };
  }

  return { code: "unexpected" };
}

export function translateAppError(locale: AppLocale, payload: AppErrorPayload): string {
  return translate(locale, `error.${payload.code}`, payload.params);
}

export function localizeErrorMessage(locale: AppLocale, error: unknown): string {
  const message = unwrapElectronError(error instanceof Error ? error.message : String(error));
  if (locale === "pt-BR") return message;
  return translateAppError(locale, toAppErrorPayload(error));
}

export function localizeOperationMessage(locale: AppLocale, message: string): string {
  if (locale === "pt-BR") return message;

  const exactKeys: Record<string, Parameters<typeof translate>[1]> = {
    "Pasta criada.": "operation.folderCreated",
    "Pasta renomeada.": "operation.folderRenamed",
    "Pasta movida.": "operation.folderMoved",
    "Pasta movida para a Lixeira.": "operation.folderTrashed",
    "Arquivo renomeado.": "operation.fileRenamed",
    "STL convertido salvo.": "operation.convertedStl",
    "Acao desfeita.": "operation.undoDone",
    "Ação desfeita.": "operation.undoDone",
    "Nada para desfazer.": "operation.nothingToUndo",
    "Nenhum arquivo selecionado.": "operation.noFilesSelected",
    "Nenhum arquivo extraido.": "operation.noFilesExtracted",
    "Nenhum arquivo extraído.": "operation.noFilesExtracted",
    "Selecione pelo menos um modelo para abrir no slicer.": "operation.selectModel",
    "Slicer não configurado.": "operation.slicerNotConfigured",
    "Selecione pelo menos um STL ou 3MF para abrir no slicer.": "operation.selectSlicerFiles",
    "O modelo selecionado não foi encontrado.": "operation.modelMissing"
  };
  const exactKey = exactKeys[message];
  if (exactKey) return translate(locale, exactKey);

  const countMatch = message.match(/^(\d+) arquivo(?:s)? movido(?:s)?( para a Lixeira)?\.$/);
  if (countMatch) {
    return translate(locale, countMatch[2] ? "operation.filesTrashed" : "operation.filesMoved", {
      count: Number(countMatch[1])
    });
  }

  const dragStartedMatch = message.match(/^Arraste iniciado para (\d+) arquivo\(s\)\.$/);
  if (dragStartedMatch) {
    return translate(locale, "operation.dragStarted", { count: Number(dragStartedMatch[1]) });
  }

  const extractedMatch = message.match(/^(\d+) arquivo(?:s)? extra[ií]do(?:s)?\.$/);
  if (extractedMatch) {
    return translate(locale, "operation.filesExtracted", { count: Number(extractedMatch[1]) });
  }

  const openingFileMatch = message.match(/^Abrindo (.+) no (.+)\.$/);
  if (openingFileMatch) {
    return translate(locale, "operation.openingFile", {
      file: openingFileMatch[1],
      name: openingFileMatch[2]
    });
  }

  const openingModelsMatch = message.match(/^Abrindo (\d+) modelos no (.+)\.$/);
  if (openingModelsMatch) {
    return translate(locale, "operation.openingModels", {
      count: Number(openingModelsMatch[1]),
      name: openingModelsMatch[2]
    });
  }

  const slicerDisabledMatch = message.match(/^(.+) está desativado nas configurações\.$/);
  if (slicerDisabledMatch) {
    return translate(locale, "operation.slicerDisabled", { name: slicerDisabledMatch[1] });
  }

  const configureSlicerMatch = message.match(
    /^Configure o caminho do executável do (.+) antes de abrir modelos\.$/
  );
  if (configureSlicerMatch) {
    return translate(locale, "operation.configureSlicer", { name: configureSlicerMatch[1] });
  }

  const slicerMissingMatch = message.match(/^O executável do (.+) não foi encontrado\.$/);
  if (slicerMissingMatch) {
    return translate(locale, "operation.slicerMissing", { name: slicerMissingMatch[1] });
  }

  return translate(locale, "operation.completed");
}

function unwrapElectronError(message: string): string {
  return message.split(/Error invoking remote method '[^']+': Error: /).pop() ?? message;
}
