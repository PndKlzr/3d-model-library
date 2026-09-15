import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DialogHeader } from "../../src/components/DialogHeader";
import { I18nProvider } from "../../src/i18n/I18nProvider";

describe("DialogHeader", () => {
  it("renders a stable accessible close control and preserves the full title", () => {
    const onClose = vi.fn();
    render(
      <DialogHeader
        eyebrow="Tags"
        title="A very long model filename that must remain discoverable.stl"
        onClose={onClose}
      />
    );

    expect(screen.getByRole("heading")).toHaveAttribute(
      "title",
      "A very long model filename that must remain discoverable.stl"
    );
    const close = screen.getByRole("button", { name: "Fechar" });
    expect(close).toHaveClass("dialog-close");
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("updates shared controls for the active language", () => {
    render(
      <I18nProvider locale="en">
        <DialogHeader title="Tags" onClose={() => undefined} />
      </I18nProvider>
    );

    expect(screen.getByRole("button", { name: "Close" })).toBeVisible();
  });
});
