import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PerformanceDiagnostics } from "../../src/components/PerformanceDiagnostics";
import { ThumbnailQueueStatus } from "../../src/components/ThumbnailQueueStatus";
import type { ThumbnailDiagnosticsSnapshot } from "../../src/lib/thumbnailDiagnostics";

describe("ThumbnailQueueStatus", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not flash for work that finishes before 250 ms", () => {
    vi.useFakeTimers();
    const { queryByText, rerender } = render(
      <ThumbnailQueueStatus snapshot={busyIoSnapshot(2)} />
    );

    rerender(<ThumbnailQueueStatus snapshot={idleSnapshot()} />);
    act(() => vi.advanceTimersByTime(250));

    expect(queryByText(/miniaturas/i)).toBeNull();
  });

  it("shows render work after the delay and completion for 1800 ms", () => {
    vi.useFakeTimers();
    const { getByText, queryByText, rerender } = render(
      <ThumbnailQueueStatus snapshot={busyRenderSnapshot(8)} />
    );

    act(() => vi.advanceTimersByTime(250));
    expect(getByText("Gerando miniaturas - 8 restantes")).toBeVisible();

    rerender(<ThumbnailQueueStatus snapshot={idleSnapshot({ renders: 8 })} />);
    expect(getByText("Miniaturas concluidas")).toBeVisible();
    act(() => vi.advanceTimersByTime(1799));
    expect(getByText("Miniaturas concluidas")).toBeVisible();
    act(() => vi.advanceTimersByTime(1));
    expect(queryByText(/miniaturas/i)).toBeNull();
  });

  it("shows render work when rendering is queued but not running", () => {
    vi.useFakeTimers();
    const snapshot = idleSnapshot({
      queued: { ...idleSnapshot().queued, visible: 4, total: 4 },
      queuedByStage: { io: 0, render: 4, total: 4 }
    });
    const { getByText } = render(<ThumbnailQueueStatus snapshot={snapshot} />);

    act(() => vi.advanceTimersByTime(250));

    expect(getByText("Gerando miniaturas - 4 restantes")).toBeVisible();
  });

  it("announces aggregate failures after a visible batch", () => {
    vi.useFakeTimers();
    const { getByText, rerender } = render(
      <ThumbnailQueueStatus snapshot={busyIoSnapshot(3)} />
    );

    act(() => vi.advanceTimersByTime(250));
    expect(getByText("Carregando miniaturas - 3 restantes")).toBeVisible();
    rerender(<ThumbnailQueueStatus snapshot={idleSnapshot({ failures: 1 })} />);

    expect(getByText("Algumas miniaturas falharam")).toBeVisible();
    expect(getByText("Algumas miniaturas falharam").parentElement).toHaveAttribute(
      "aria-live",
      "polite"
    );
  });

  it("keeps the background remaining count visible between generated thumbnails", () => {
    const { getByRole, getByText, rerender } = render(
      <ThumbnailQueueStatus
        snapshot={idleSnapshot()}
        warmup={{ phase: "preparing", remaining: 27, total: 40, failures: 0 }}
      />
    );
    expect(getByText("Preparando miniaturas - 27 restantes")).toBeVisible();
    expect(getByRole("progressbar", { name: "Progresso das miniaturas" })).toHaveAttribute(
      "aria-valuenow",
      "13"
    );

    rerender(
      <ThumbnailQueueStatus
        snapshot={busyRenderSnapshot(1)}
        warmup={{ phase: "generating", remaining: 27, total: 40, failures: 0 }}
      />
    );
    expect(getByText("Gerando miniaturas - 27 restantes")).toBeVisible();
  });

  it("reports a completed recursive pass with failures", () => {
    const { getByText } = render(
      <ThumbnailQueueStatus
        snapshot={idleSnapshot()}
        warmup={{ phase: "complete", remaining: 0, total: 40, failures: 3 }}
      />
    );
    expect(getByText("3 miniaturas não puderam ser geradas")).toBeVisible();
  });
});

describe("PerformanceDiagnostics", () => {
  it("copies only runtime versions and aggregate diagnostics", async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    window.modelLibrary = {
      getRuntimeVersions: vi.fn(async () => ({
        appVersion: "0.1.0",
        electronVersion: "33.2.1",
        chromiumVersion: "130"
      }))
    } as unknown as Window["modelLibrary"];

    const { getByRole } = render(<PerformanceDiagnostics snapshot={idleSnapshot()} />);
    fireEvent.click(getByRole("button", { name: "Copiar diagnostico" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const report = JSON.parse(writeText.mock.calls[0][0]);
    expect(report.runtime).toEqual({
      appVersion: "0.1.0",
      electronVersion: "33.2.1",
      chromiumVersion: "130"
    });
    expect(report.thumbnail).toEqual(idleSnapshot());
    expect(report).not.toHaveProperty("settings");
  });
});

function busyIoSnapshot(total: number) {
  return idleSnapshot({
    queued: { ...idleSnapshot().queued, visible: total - 1, total: total - 1 },
    running: { io: 1, render: 0, total: 1 }
  });
}

function busyRenderSnapshot(total: number) {
  return idleSnapshot({
    queued: { ...idleSnapshot().queued, visible: total - 1, total: total - 1 },
    running: { io: 0, render: 1, total: 1 }
  });
}

function idleSnapshot(
  overrides: Partial<ThumbnailDiagnosticsSnapshot> = {}
): ThumbnailDiagnosticsSnapshot {
  return {
    queued: { selected: 0, visible: 0, nearby: 0, mosaic: 0, historical: 0, total: 0 },
    queuedByStage: { io: 0, render: 0, total: 0 },
    running: { io: 0, render: 0, total: 0 },
    cacheHits: 0,
    cacheMisses: 0,
    embeddedHits: 0,
    renders: 0,
    failures: 0,
    discardedHistorical: 0,
    longTasks: { count: 0, maximumMs: 0 },
    retainedResults: { current: 0, peak: 0 },
    durationMs: {
      io: { count: 0, average: 0, maximum: 0 },
      render: { count: 0, average: 0, maximum: 0 },
      total: { count: 0, average: 0, maximum: 0 }
    },
    ...overrides
  };
}
