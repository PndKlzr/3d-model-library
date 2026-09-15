import { createContext, useContext, useMemo, type ReactNode } from "react";
import { translate, type TranslationParams } from "./translate.js";
import type { TranslationKey } from "./catalog.js";
import type { AppLocale } from "../shared/types.js";

type I18nValue = {
  locale: AppLocale;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

function createI18nValue(locale: AppLocale): I18nValue {
  return {
    locale,
    t: (key, params) => translate(locale, key, params),
    formatDate: (input, options) =>
      new Intl.DateTimeFormat(locale, options).format(new Date(input)),
    formatNumber: (input, options) => new Intl.NumberFormat(locale, options).format(input)
  };
}

const I18nContext = createContext<I18nValue>(createI18nValue("pt-BR"));

export function I18nProvider({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  const value = useMemo<I18nValue>(() => createI18nValue(locale), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  return value;
}
