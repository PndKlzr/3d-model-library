import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnavailableLibrary } from "../../src/components/UnavailableLibrary";
import { I18nProvider } from "../../src/i18n/I18nProvider";

describe("UnavailableLibrary", () => {
  it("keeps the saved path visible and offers recovery actions", () => {
    const onRetry = vi.fn();
    const onChooseFolder = vi.fn();

    render(
      <I18nProvider locale="pt-BR">
        <UnavailableLibrary
          libraryPath={"F:\\Stls"}
          retrying={false}
          themeMode="dark"
          onRetry={onRetry}
          onChooseFolder={onChooseFolder}
        />
      </I18nProvider>
    );

    expect(screen.getByText("F:\\Stls")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    fireEvent.click(screen.getByRole("button", { name: "Escolher outra pasta" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(onChooseFolder).toHaveBeenCalledOnce();
  });
});
