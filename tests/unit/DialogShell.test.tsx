import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DialogShell } from "../../src/components/DialogShell";

describe("DialogShell", () => {
  it("cancels with Escape and restores the previous focus", () => {
    const onCancel = vi.fn();
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const view = render(
      <DialogShell className="test-dialog" title="Teste" onCancel={onCancel}>
        <button type="button">Conteúdo</button>
      </DialogShell>
    );
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledOnce();
    view.unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });

  it("cancels only when the backdrop itself is pressed", () => {
    const onCancel = vi.fn();
    render(
      <DialogShell className="test-dialog" title="Teste" onCancel={onCancel}>
        <button type="button">Conteúdo</button>
      </DialogShell>
    );

    fireEvent.pointerDown(screen.getByRole("button", { name: "Conteúdo" }));
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.pointerDown(screen.getByRole("presentation"));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
