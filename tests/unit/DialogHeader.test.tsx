import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DialogHeader } from "../../src/components/DialogHeader";

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
});
