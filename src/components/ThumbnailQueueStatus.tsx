import { useEffect, useRef, useState } from "react";
import type { ThumbnailDiagnosticsSnapshot } from "../lib/thumbnailDiagnostics";
import type { ThumbnailWarmupProgress } from "../lib/thumbnailWarmup";
import { useI18n } from "../i18n/I18nProvider";
import type { TranslationKey } from "../i18n/catalog";
import type { TranslationParams } from "../i18n/translate";

type QueueStatus =
  | { kind: "preparing" | "loading" | "rendering"; count: number; total?: number }
  | { kind: "complete" | "failed"; count?: number };

type ThumbnailQueueStatusProps = {
  snapshot: ThumbnailDiagnosticsSnapshot;
  delayMs?: number;
  completionMs?: number;
  warmup?: ThumbnailWarmupProgress | null;
};

export function ThumbnailQueueStatus({
  snapshot,
  delayMs = 250,
  completionMs = 1800,
  warmup = null
}: ThumbnailQueueStatusProps) {
  const { t } = useI18n();
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

  useEffect(() => {
    if (warmup?.phase !== "complete") return;
    updateStatus(warmup.failures > 0
      ? { kind: "failed", count: warmup.failures }
      : { kind: "complete" });
    clearTimer(completionTimerRef);
    completionTimerRef.current = window.setTimeout(() => {
      completionTimerRef.current = null;
      updateStatus(null);
    }, completionMs);
  }, [completionMs, warmup?.failures, warmup?.phase]);

  const warmupStatus: QueueStatus | null = warmup && warmup.remaining > 0
    ? {
        kind: getActiveCount(snapshot) > 0
          ? snapshot.queuedByStage.render > 0 || snapshot.running.render > 0
            ? "rendering"
            : "loading"
          : "preparing",
        count: warmup.remaining,
        total: warmup.total
      }
    : null;
  const displayedStatus = warmupStatus ?? status;

  return (
    <div
      className={`thumbnail-queue-status ${displayedStatus?.kind ?? "idle"}`}
      aria-live="polite"
      title={displayedStatus ? getStatusLabel(displayedStatus, t) : undefined}
    >
      {displayedStatus ? <i aria-hidden="true" /> : null}
      {displayedStatus ? (
        <span className="thumbnail-status-label">{getStatusLabel(displayedStatus, t)}</span>
      ) : null}
      {displayedStatus?.total ? (
        <span
          className="thumbnail-progress"
          role="progressbar"
          aria-label={t("thumbnail.progress")}
          aria-valuemin={0}
          aria-valuemax={displayedStatus.total}
          aria-valuenow={displayedStatus.total - displayedStatus.count}
        >
          <span
            aria-hidden="true"
            style={{
              width: `${((displayedStatus.total - displayedStatus.count) / displayedStatus.total) * 100}%`
            }}
          />
        </span>
      ) : null}
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

function getStatusLabel(
  status: QueueStatus,
  t: (key: TranslationKey, params?: TranslationParams) => string
) {
  if (status.kind === "preparing" || status.kind === "loading" || status.kind === "rendering") {
    return t("thumbnail.remaining", { count: status.count });
  }
  if (status.kind === "failed") {
    return status.count
      ? t("thumbnail.failedCount", { count: status.count })
      : t("thumbnail.failed");
  }
  return t("thumbnail.complete");
}

function clearTimer(timerRef: { current: number | null }) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}
