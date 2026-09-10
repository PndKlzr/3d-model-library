import { useEffect, useRef, useState } from "react";
import type { ThumbnailDiagnosticsSnapshot } from "../lib/thumbnailDiagnostics";

type QueueStatus =
  | { kind: "loading" | "rendering"; count: number }
  | { kind: "complete" | "failed" };

type ThumbnailQueueStatusProps = {
  snapshot: ThumbnailDiagnosticsSnapshot;
  delayMs?: number;
  completionMs?: number;
};

export function ThumbnailQueueStatus({
  snapshot,
  delayMs = 250,
  completionMs = 1800
}: ThumbnailQueueStatusProps) {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const statusRef = useRef<QueueStatus | null>(null);
  const latestSnapshotRef = useRef(snapshot);
  const wasBusyRef = useRef(false);
  const failuresAtBatchStartRef = useRef(snapshot.failures);
  const delayTimerRef = useRef<number | null>(null);
  const completionTimerRef = useRef<number | null>(null);

  function updateStatus(nextStatus: QueueStatus | null) {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
  }

  useEffect(() => {
    latestSnapshotRef.current = snapshot;
    const isBusy = getActiveCount(snapshot) > 0;

    if (isBusy) {
      if (!wasBusyRef.current) {
        failuresAtBatchStartRef.current = snapshot.failures;
        clearTimer(completionTimerRef);
        updateStatus(null);
      }

      wasBusyRef.current = true;
      if (statusRef.current?.kind === "loading" || statusRef.current?.kind === "rendering") {
        updateStatus(getWorkStatus(snapshot));
      } else if (delayTimerRef.current === null) {
        delayTimerRef.current = window.setTimeout(() => {
          delayTimerRef.current = null;
          if (getActiveCount(latestSnapshotRef.current) > 0) {
            updateStatus(getWorkStatus(latestSnapshotRef.current));
          }
        }, delayMs);
      }
      return;
    }

    clearTimer(delayTimerRef);
    if (wasBusyRef.current && isWorkStatus(statusRef.current)) {
      const nextStatus: QueueStatus = snapshot.failures > failuresAtBatchStartRef.current
        ? { kind: "failed" }
        : { kind: "complete" };
      updateStatus(nextStatus);
      clearTimer(completionTimerRef);
      completionTimerRef.current = window.setTimeout(() => {
        completionTimerRef.current = null;
        updateStatus(null);
      }, completionMs);
    }
    wasBusyRef.current = false;
  }, [completionMs, delayMs, snapshot]);

  useEffect(() => () => {
    clearTimer(delayTimerRef);
    clearTimer(completionTimerRef);
  }, []);

  return (
    <div className={`thumbnail-queue-status ${status?.kind ?? "idle"}`} aria-live="polite">
      {status ? <i aria-hidden="true" /> : null}
      {status ? <span>{getStatusLabel(status)}</span> : null}
    </div>
  );
}

function getActiveCount(snapshot: ThumbnailDiagnosticsSnapshot) {
  return snapshot.queued.total + snapshot.running.total;
}

function getWorkStatus(snapshot: ThumbnailDiagnosticsSnapshot): QueueStatus {
  return {
    kind: snapshot.queuedByStage.render > 0 || snapshot.running.render > 0
      ? "rendering"
      : "loading",
    count: getActiveCount(snapshot)
  };
}

function isWorkStatus(status: QueueStatus | null) {
  return status?.kind === "loading" || status?.kind === "rendering";
}

function getStatusLabel(status: QueueStatus) {
  if (status.kind === "loading") return `Carregando miniaturas - ${status.count}`;
  if (status.kind === "rendering") return `Gerando miniaturas - ${status.count}`;
  if (status.kind === "failed") return "Algumas miniaturas falharam";
  return "Miniaturas concluidas";
}

function clearTimer(timerRef: { current: number | null }) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}
