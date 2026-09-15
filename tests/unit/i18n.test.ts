import { describe, expect, it } from "vitest";
import { en, ptBR } from "../../src/i18n/catalog";
import { resolveAppLocale, translate } from "../../src/i18n/translate";

describe("i18n", () => {
  it("resolves supported Windows locale variants", () => {
    expect(resolveAppLocale("pt-BR")).toBe("pt-BR");
    expect(resolveAppLocale("pt")).toBe("pt-BR");
    expect(resolveAppLocale("en-US")).toBe("en");
    expect(resolveAppLocale("fr-FR")).toBe("pt-BR");
    expect(resolveAppLocale(null)).toBe("pt-BR");
  });

  it("interpolates parameters and plural branches", () => {
    expect(translate("en", "thumbnail.remaining", { count: 3 }))
      .toBe("Thumbnails - 3 remaining");
    expect(translate("pt-BR", "library.modelCount", { count: 1 })).toBe("1 modelo");
    expect(translate("en", "library.modelCount", { count: 2 })).toBe("2 models");
  });

  it("translates settings and performance diagnostics", () => {
    expect(translate("en", "settings.libraryFolder")).toBe("Library folder");
    expect(translate("pt-BR", "diagnostics.cacheMisses")).toBe("Não encontradas no cache");
    expect(translate("en", "diagnostics.renderQueueWait")).toBe(
      "Render queue wait average / maximum"
    );
  });

  it("keeps both catalogs structurally identical", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ptBR).sort());
  });
});
