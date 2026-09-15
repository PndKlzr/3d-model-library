import { createContext, useContext, useMemo, type ReactNode } from "react";
import { translate, type TranslationParams } from "./translate";
import type { TranslationKey } from "./catalog";
import type { AppLocale } from "../shared/types";

type I18nValue = {
  locale: AppLocale;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  formatDate: (value: Date | string | number, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ locale, children }: { locale: AppLocale; children: ReactNode }) {
  const value = useMemo<I18nValue>(() => ({
    locale,
    t: (key, params) => translate(locale, key, params),
    formatDate: (input, options) =>
      new Intl.DateTimeFormat(locale, options).format(new Date(input)),
    formatNumber: (input, options) => new Intl.NumberFormat(locale, options).format(input)
  }), [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
