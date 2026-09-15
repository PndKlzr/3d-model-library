import { en, ptBR, type TranslationKey } from "./catalog.js";
import type { AppLocale } from "../shared/types.js";

export type TranslationParams = Record<string, string | number>;

export function resolveAppLocale(value?: string | null): AppLocale {
  const locale = value?.trim().toLowerCase();
  if (locale === "en" || locale?.startsWith("en-")) return "en";
  if (locale === "pt" || locale?.startsWith("pt-")) return "pt-BR";
  return "pt-BR";
}

export function translate(
  locale: AppLocale,
  key: TranslationKey,
  params: TranslationParams = {}
): string {
  const catalog = locale === "en" ? en : ptBR;
  const pluralKeys: TranslationKey[] = [
    "library.modelCount",
    "library.selectedCount",
    "library.folderModelCount",
    "library.childFolderCount",
    "dialog.trashFilesQuestion",
    "action.fileCount"
  ];
  const resolvedKey = pluralKeys.includes(key)
    ? (`${key}.${Number(params.count) === 1 ? "one" : "other"}` as keyof typeof ptBR)
    : key;
  const template = catalog[resolvedKey as keyof typeof ptBR];
  return template.replace(/\{(\w+)\}/g, (_match: string, name: string) => String(params[name] ?? ""));
}
