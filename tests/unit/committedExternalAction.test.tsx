import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { runAfterCommittedUpdate } from "../../src/lib/committedExternalAction";

describe("runAfterCommittedUpdate", () => {
  it("removes the folder context menu before invoking showLibraryFolder", async () => {
    const showLibraryFolder = vi.fn(async () => {
      expect(screen.queryByRole("menu")).toBeNull();
    });

    function Harness() {
      const [menuOpen, setMenuOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setMenuOpen(true)}>Abrir menu</button>
          {menuOpen ? (
            <div role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => void runAfterCommittedUpdate(
                  () => setMenuOpen(false),
                  () => showLibraryFolder()
                )}
              >
                Mostrar no Explorer
              </button>
            </div>
          ) : null}
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir menu" }));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.click(screen.getByRole("menuitem", { name: "Mostrar no Explorer" }));

    expect(showLibraryFolder).toHaveBeenCalledOnce();
  });
});
