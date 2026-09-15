import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import {
  formatThumbnailDiagnosticReport,
  type ThumbnailDiagnosticsSnapshot
} from "../lib/thumbnailDiagnostics";

type PerformanceDiagnosticsProps = {
  snapshot: ThumbnailDiagnosticsSnapshot;
};

export function PerformanceDiagnostics({ snapshot }: PerformanceDiagnosticsProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (copyState === "idle") return;
    const timer = window.setTimeout(() => setCopyState("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [copyState]);

  async function copyDiagnostics() {
    try {
      const runtime = await window.modelLibrary.getRuntimeVersions();
      await navigator.clipboard.writeText(formatThumbnailDiagnosticReport(snapshot, runtime));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <section className="settings-section performance-diagnostics">
      <div className="settings-section-header">
        <div className="settings-section-copy">
          <h3>Diagnostico de miniaturas</h3>
          <p>Resumo local da fila e do tempo de processamento desta sessao.</p>
        </div>
        <button type="button" onClick={() => void copyDiagnostics()}>
          {copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}
          {copyState === "copied" ? "Copiado" : "Copiar diagnostico"}
        </button>
      </div>

      <dl className="diagnostics-grid">
        <DiagnosticValue label="Na fila" value={snapshot.queued.total} />
        <DiagnosticValue label="Na fila de E/S" value={snapshot.queuedByStage.io} />
        <DiagnosticValue label="Na fila de render" value={snapshot.queuedByStage.render} />
        <DiagnosticValue label="Em andamento" value={snapshot.running.total} />
        <DiagnosticValue label="Acertos no cache" value={snapshot.cacheHits} />
        <DiagnosticValue label="Falhas no cache" value={snapshot.cacheMisses} />
        <DiagnosticValue label="Previews incorporadas" value={snapshot.embeddedHits} />
        <DiagnosticValue label="Miniaturas geradas" value={snapshot.renders} />
        <DiagnosticValue label="Falhas" value={snapshot.failures} />
        <DiagnosticValue
          label="Falhas por formato"
          value={formatFailuresByExtension(snapshot.failuresByExtension)}
        />
        <DiagnosticValue label="Historico descartado" value={snapshot.discardedHistorical} />
        <DiagnosticValue
          label="Resultados retidos"
          value={`${snapshot.retainedResults.current} / pico ${snapshot.retainedResults.peak}`}
        />
        <DiagnosticValue label="E/S media / maxima" value={formatDuration(snapshot.durationMs.io)} />
        <DiagnosticValue
          label="Espera de E/S media / maxima"
          value={formatDuration(snapshot.queueWaitMs.io)}
        />
        <DiagnosticValue
          label="Render media / maxima"
          value={formatDuration(snapshot.durationMs.render)}
        />
        <DiagnosticValue
          label="Espera de render media / maxima"
          value={formatDuration(snapshot.queueWaitMs.render)}
        />
        <DiagnosticValue
          label="Total medio / maximo"
          value={formatDuration(snapshot.durationMs.total)}
        />
        <DiagnosticValue
          label="Tarefas longas"
          value={`${snapshot.longTasks.count} / max ${formatMilliseconds(snapshot.longTasks.maximumMs)}`}
        />
      </dl>

      <p className="diagnostics-privacy">
        O relatorio inclui somente versoes do aplicativo e valores agregados. Nomes, caminhos e
        conteudo dos modelos nao sao incluidos.
      </p>
      <span className="diagnostics-copy-status" role="status" aria-live="polite">
        {copyState === "failed" ? "Nao foi possivel copiar o diagnostico." : ""}
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

function formatFailuresByExtension(failures: Record<string, number>) {
  const entries = Object.entries(failures)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1]);
  if (entries.length === 0) return "Nenhuma";
  return entries
    .map(([extension, count]) => `${extension.replace(/^\./, "").toUpperCase()}: ${count}`)
    .join(" | ");
}
