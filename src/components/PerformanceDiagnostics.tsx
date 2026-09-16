import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import {
  formatThumbnailDiagnosticReport,
  type ThumbnailDiagnosticsSnapshot
} from "../lib/thumbnailDiagnostics";
import { useI18n } from "../i18n/I18nProvider";

type PerformanceDiagnosticsProps = {
  snapshot: ThumbnailDiagnosticsSnapshot;
};

export function PerformanceDiagnostics({ snapshot }: PerformanceDiagnosticsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const { t } = useI18n();

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copyDiagnostics() {
    try {
      const runtime = await window.modelLibrary.getRuntimeVersions();
      await window.modelLibrary.copyText(formatThumbnailDiagnosticReport(snapshot, runtime));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <section className="settings-section performance-diagnostics">
      <div className="settings-section-header">
        <div className="settings-section-copy">
          <h3>{t("diagnostics.title")}</h3>
          <p>{t("diagnostics.description")}</p>
        </div>
        <button type="button" onClick={() => void copyDiagnostics()}>
          {copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}
          {copyState === "copied" ? t("diagnostics.copied") : t("diagnostics.copy")}
        </button>
      </div>

      <dl className="diagnostics-grid">
        <DiagnosticValue label={t("diagnostics.queued")} value={snapshot.queued.total} />
        <DiagnosticValue label={t("diagnostics.queuedIo")} value={snapshot.queuedByStage.io} />
        <DiagnosticValue label={t("diagnostics.queuedRender")} value={snapshot.queuedByStage.render} />
        <DiagnosticValue label={t("diagnostics.running")} value={snapshot.running.total} />
        <DiagnosticValue label={t("diagnostics.cacheHits")} value={snapshot.cacheHits} />
        <DiagnosticValue label={t("diagnostics.cacheMisses")} value={snapshot.cacheMisses} />
        <DiagnosticValue label={t("diagnostics.embedded")} value={snapshot.embeddedHits} />
        <DiagnosticValue label={t("diagnostics.generated")} value={snapshot.renders} />
        <DiagnosticValue label={t("diagnostics.failures")} value={snapshot.failures} />
        <DiagnosticValue
          label={t("diagnostics.failuresByFormat")}
          value={formatFailuresByExtension(snapshot.failuresByExtension, t("diagnostics.none"))}
        />
        <DiagnosticValue label={t("diagnostics.discarded")} value={snapshot.discardedHistorical} />
        <DiagnosticValue
          label={t("diagnostics.retained")}
          value={t("diagnostics.retainedValue", snapshot.retainedResults)}
        />
        <DiagnosticValue label={t("diagnostics.ioDuration")} value={formatDuration(snapshot.durationMs.io)} />
        <DiagnosticValue
          label={t("diagnostics.ioQueueWait")}
          value={formatDuration(snapshot.queueWaitMs.io)}
        />
        <DiagnosticValue
          label={t("diagnostics.renderDuration")}
          value={formatDuration(snapshot.durationMs.render)}
        />
        <DiagnosticValue
          label={t("diagnostics.renderQueueWait")}
          value={formatDuration(snapshot.queueWaitMs.render)}
        />
        <DiagnosticValue
          label={t("diagnostics.totalDuration")}
          value={formatDuration(snapshot.durationMs.total)}
        />
        <DiagnosticValue
          label={t("diagnostics.longTasks")}
          value={t("diagnostics.longTasksValue", {
            count: snapshot.longTasks.count,
            maximum: formatMilliseconds(snapshot.longTasks.maximumMs)
          })}
        />
      </dl>

      <p className="diagnostics-privacy">
        {t("diagnostics.privacy")}
      </p>
      <span className="diagnostics-copy-status" role="status" aria-live="polite">
        {copyState === "failed" ? t("diagnostics.copyFailed") : ""}
      </span>
    </section>
  );
}

function DiagnosticValue({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDuration(duration: { average: number; maximum: number }) {
  return `${formatMilliseconds(duration.average)} / ${formatMilliseconds(duration.maximum)}`;
}

function formatMilliseconds(value: number) {
  return `${Math.round(value)} ms`;
}

function formatFailuresByExtension(failures: Record<string, number>, emptyLabel: string) {
  const entries = Object.entries(failures)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1]);
  if (entries.length === 0) return emptyLabel;
  return entries
    .map(([extension, count]) => `${extension.replace(/^\./, "").toUpperCase()}: ${count}`)
    .join(" | ");
}
