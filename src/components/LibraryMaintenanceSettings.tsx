import {
  ArchiveRestore,
  DatabaseBackup,
  FolderOpen,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Trash2
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type {
  LibraryDataStatus,
  LibraryHealthIssueCode,
  LibraryHealthSnapshot
} from "../shared/types";
import type { TranslationKey } from "../i18n/catalog";
import { useI18n } from "../i18n/I18nProvider";
import { ConfirmDialog } from "./ConfirmDialog";

export type MaintenanceAction =
  | "export-backup"
  | "restore-backup"
  | "open-data-folder"
  | "verify"
  | "rebuild-index"
  | "clean-thumbnails";

export type LibraryMaintenanceSettingsProps = {
  dataStatus: LibraryDataStatus;
  health: LibraryHealthSnapshot;
  busyAction: MaintenanceAction | null;
  onExportBackup: () => Promise<void>;
  onRestoreBackup: () => Promise<void>;
  onOpenDataFolder: () => Promise<void>;
  onVerify: () => Promise<void>;
  onRebuildIndex: () => Promise<void>;
  onCleanThumbnails: () => Promise<void>;
  onRetryThumbnail: (relativePath: string) => void;
};

type Confirmation = "restore-backup" | "rebuild-index";

const issueLabels: Record<LibraryHealthIssueCode, TranslationKey> = {
  "metadata-recovered-backup": "maintenance.issueMetadataBackup",
  "metadata-read-only": "maintenance.issueMetadataReadOnly",
  "metadata-unavailable": "maintenance.issueMetadataUnavailable",
  "metadata-file-missing": "maintenance.issueMetadataMissing",
  "scan-error": "maintenance.issueScan",
  "thumbnail-failed": "maintenance.issueThumbnail",
  "archive-read-failed": "maintenance.issueArchive",
  "slicer-unavailable": "maintenance.issueSlicer",
  "monitoring-failed": "maintenance.issueMonitoring"
};

export function LibraryMaintenanceSettings({
  dataStatus,
  health,
  busyAction,
  onExportBackup,
  onRestoreBackup,
  onOpenDataFolder,
  onVerify,
  onRebuildIndex,
  onCleanThumbnails,
  onRetryThumbnail
}: LibraryMaintenanceSettingsProps) {
  const { t, formatDate } = useI18n();
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const healthy = health.counts.error === 0 && health.counts.warning === 0 &&
    dataStatus.availability === "ready";
  const statusTitle = healthy
    ? t("maintenance.protected")
    : dataStatus.availability === "read-only"
      ? t("maintenance.readOnly")
      : t("maintenance.needsAttention");

  const run = (operation: () => Promise<void>) => {
    if (busyAction) return;
    void operation();
  };

  return (
    <div className="library-maintenance-settings">
      <section className="settings-section">
        <div className="maintenance-status-row" data-state={healthy ? "healthy" : "attention"}>
          <ShieldCheck size={20} />
          <span>
            <strong>{statusTitle}</strong>
            <small>{t("maintenance.dataSummary", {
              models: dataStatus.modelCount,
              tags: dataStatus.tagCount
            })}</small>
          </span>
        </div>
        <div className="maintenance-actions">
          <ActionButton
            icon={<DatabaseBackup size={16} />}
            label={t("maintenance.exportBackup")}
            busy={busyAction === "export-backup"}
            disabled={Boolean(busyAction)}
            onClick={() => run(onExportBackup)}
          />
          <ActionButton
            icon={<ArchiveRestore size={16} />}
            label={t("maintenance.restoreBackup")}
            busy={busyAction === "restore-backup"}
            disabled={Boolean(busyAction) || !dataStatus.writable}
            onClick={() => setConfirmation("restore-backup")}
          />
          <ActionButton
            icon={<FolderOpen size={16} />}
            label={t("maintenance.openDataFolder")}
            busy={busyAction === "open-data-folder"}
            disabled={Boolean(busyAction) || dataStatus.availability === "unavailable"}
            onClick={() => run(onOpenDataFolder)}
          />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-copy">
          <h3>{t("maintenance.healthTitle")}</h3>
          <p>{health.checkedAt
            ? t("maintenance.lastChecked", { date: formatDate(health.checkedAt) })
            : t("maintenance.notChecked")}</p>
        </div>
        {health.issues.length > 0 ? (
          <div className="maintenance-issues">
            <strong>{t("maintenance.problemsFound")}</strong>
            {health.issues.map((item) => (
              <div className="maintenance-issue" data-severity={item.severity} key={item.id}>
                <span>
                  <strong>{t(issueLabels[item.code])}</strong>
                  <small>{item.relativePath ?? item.detail}</small>
                </span>
                {item.code === "thumbnail-failed" && item.relativePath ? (
                  <button type="button" onClick={() => onRetryThumbnail(item.relativePath!)}>
                    {t("maintenance.retryThumbnail")}
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <div className="maintenance-actions">
          <ActionButton
            icon={<ScanSearch size={16} />}
            label={t("maintenance.verify")}
            busy={busyAction === "verify"}
            disabled={Boolean(busyAction)}
            onClick={() => run(onVerify)}
          />
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-copy">
          <h3>{t("maintenance.toolsTitle")}</h3>
          <p>{t("maintenance.toolsDescription")}</p>
        </div>
        <div className="maintenance-actions">
          <ActionButton
            icon={<RefreshCw size={16} />}
            label={t("maintenance.rebuildIndex")}
            busy={busyAction === "rebuild-index"}
            disabled={Boolean(busyAction)}
            onClick={() => setConfirmation("rebuild-index")}
          />
          <ActionButton
            icon={<Trash2 size={16} />}
            label={t("maintenance.cleanThumbnails")}
            busy={busyAction === "clean-thumbnails"}
            disabled={Boolean(busyAction)}
            onClick={() => run(onCleanThumbnails)}
          />
        </div>
      </section>

      {confirmation ? (
        <ConfirmDialog
          title={t(confirmation === "restore-backup"
            ? "maintenance.restoreConfirmTitle"
            : "maintenance.rebuildConfirmTitle")}
          message={t(confirmation === "restore-backup"
            ? "maintenance.restoreConfirmMessage"
            : "maintenance.rebuildConfirmMessage")}
          confirmLabel={t(confirmation === "restore-backup"
            ? "maintenance.restoreNow"
            : "maintenance.rebuildNow")}
          tone={confirmation === "restore-backup" ? "danger" : "default"}
          onCancel={() => setConfirmation(null)}
          onConfirm={() => {
            const selected = confirmation;
            setConfirmation(null);
            void (selected === "restore-backup" ? onRestoreBackup() : onRebuildIndex());
          }}
        />
      ) : null}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  busy,
  disabled = false,
  onClick
}: {
  icon: ReactNode;
  label: string;
  busy: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t } = useI18n();
  return (
    <button type="button" disabled={disabled || busy} onClick={onClick}>
      {icon}
      <span>{busy ? t("maintenance.working") : label}</span>
    </button>
  );
}
