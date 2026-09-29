import {
  Archive,
  Calendar,
  Copy,
  Eye,
  Box,
  File,
  FileText,
  Folder,
  FolderSearch,
  LoaderCircle,
  Image as ImageIcon,
  Pencil,
  Scissors,
  Star,
  Weight
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ModelViewer } from "./ModelViewer";
import { TagSelector } from "./TagSelector";
import type {
  AppSettings,
  ArchiveEntry,
  ArchiveExtractionMode,
  LibraryMetadataStatus,
  ModelFile,
  ModelUserMetadata
} from "../shared/types";
import {
  canConvertToStl,
  canSendToSlicer,
  isArchive,
  isDirectImage,
  isGeometryOnlyPreview
} from "../shared/fileCapabilities";
import { useI18n } from "../i18n/I18nProvider";
import { localizeErrorMessage } from "../shared/appError";

type DetailsTab = "info" | "notes" | "actions";
export type ModelPreviewRequest = { id: number; modelPath: string };

type DetailsPanelProps = {
  model: ModelFile | null;
  settings: AppSettings;
  modelMetadata: ModelUserMetadata | null;
  availableTags: string[];
  launchMessage: string | null;
  metadataStatus: LibraryMetadataStatus;
  metadataWritable: boolean;
  previewRequest?: ModelPreviewRequest | null;
  onOpenSettings: () => void;
  onLaunchSlicer: (slicerId: string, modelPath: string) => Promise<void>;
  onRenameModelFile: () => void;
  onShowModelInFolder: (modelPath: string) => Promise<void>;
  onOpenLibraryFile: (modelPath: string) => Promise<void>;
  onToggleFavorite: (modelPath: string) => Promise<void>;
  onSetModelTags: (modelPath: string, tags: string[]) => Promise<void>;
  onSetModelNotes: (modelPath: string, notes: string) => Promise<void>;
  onRetryMetadata: () => Promise<void>;
  onExtractArchive: (archivePath: string, mode: ArchiveExtractionMode) => Promise<void>;
  onConvertThreeMfToStl: (
    modelPath: string,
    onProgress: (progress: number) => void
  ) => Promise<void>;
  onArchiveFailure?: (model: ModelFile, error: Error) => void;
  onArchiveSuccess?: (model: ModelFile) => void;
};

export function DetailsPanel({
  model,
  settings,
  modelMetadata,
  availableTags,
  launchMessage,
  metadataStatus,
  metadataWritable,
  previewRequest = null,
  onOpenSettings,
  onLaunchSlicer,
  onRenameModelFile,
  onShowModelInFolder,
  onOpenLibraryFile,
  onToggleFavorite,
  onSetModelTags,
  onSetModelNotes,
  onRetryMetadata,
  onExtractArchive,
  onConvertThreeMfToStl,
  onArchiveFailure,
  onArchiveSuccess
}: DetailsPanelProps) {
  const { locale, t, formatDate } = useI18n();
  const [showPreview, setShowPreview] = useState(false);
  const [previewRenderKey, setPreviewRenderKey] = useState(0);
  const handledPreviewRequestRef = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<DetailsTab>("info");
  const [notesDraft, setNotesDraft] = useState("");
  const [archiveEntries, setArchiveEntries] = useState<ArchiveEntry[]>([]);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [imageOpenMessage, setImageOpenMessage] = useState<string | null>(null);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<number | null>(null);
  const metadataMessage = metadataStatus.message
    ? localizeErrorMessage(locale, new Error(metadataStatus.message))
    : null;
  const enabledSlicers = settings.slicers.filter((slicer) => slicer.enabled && slicer.executablePath);
  const favorite = modelMetadata?.favorite ?? false;
  const archive = Boolean(model && isArchive(model.extension));
  const directImage = Boolean(model && isDirectImage(model.extension));
  const canUseSlicer = Boolean(model && canSendToSlicer(model.extension));
  const relativeLocation = model
    ? [model.relativeFolder, model.name].filter(Boolean).join("/")
    : "";

  useEffect(() => {
    setShowPreview(false);
    setPreviewRenderKey(0);
    setActiveTab("info");
    setArchiveEntries([]);
    setArchiveMessage(null);
    setImageOpenMessage(null);
    setConversionProgress(null);
  }, [model?.id]);

  useEffect(() => {
    if (
      !model ||
      !previewRequest ||
      previewRequest.modelPath !== model.absolutePath ||
      handledPreviewRequestRef.current === previewRequest.id
    ) {
      return;
    }

    handledPreviewRequestRef.current = previewRequest.id;
    setPreviewRenderKey(previewRequest.id);
    setShowPreview(true);
  }, [model, previewRequest]);

  async function openImage(modelPath: string) {
    setImageOpenMessage(null);
    try {
      await onOpenLibraryFile(modelPath);
    } catch (error) {
      const detail = localizeErrorMessage(locale, error);
      setImageOpenMessage(t("details.imageOpenFailed", { detail }));
    }
  }

  async function convertModelToStl(modelPath: string) {
    setConversionProgress(0);

    try {
      await onConvertThreeMfToStl(modelPath, setConversionProgress);
    } finally {
      setConversionProgress(null);
    }
  }

  useEffect(() => {
    setNotesDraft(modelMetadata?.notes ?? "");
  }, [model?.id, modelMetadata?.notes]);

  useEffect(() => {
    let isMounted = true;

    if (!model || !archive) {
      return () => {
        isMounted = false;
      };
    }

    setIsArchiveLoading(true);
    setArchiveMessage(null);

    window.modelLibrary
      .listArchiveEntries(model.absolutePath)
      .then((result) => {
        onArchiveSuccess?.(model);
        if (isMounted) {
          setArchiveEntries(result.entries);
        }
      })
      .catch((error) => {
        onArchiveFailure?.(
          model,
          error instanceof Error ? error : new Error(String(error))
        );
        if (isMounted) {
          setArchiveMessage(localizeErrorMessage(locale, error));
          setArchiveEntries([]);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsArchiveLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [archive, locale, model]);

  async function saveNotes() {
    if (!model || !metadataWritable) {
      return;
    }

    await onSetModelNotes(model.absolutePath, notesDraft);
  }

  async function extractWholeArchive(mode: ArchiveExtractionMode) {
    if (!model) {
      return;
    }
    await onExtractArchive(model.absolutePath, mode);
  }

  return (
    <aside className="details-panel" aria-label={t("details.region")}>
      <div className="preview-stage">
        {model && archive ? (
          <div className="preview-placeholder">
            <Archive size={30} />
            <strong>{t("details.archiveTitle")}</strong>
            <span>{t("details.archiveDescription")}</span>
          </div>
        ) : model && directImage ? (
          <div className="preview-placeholder image-preview-placeholder">
            <ImageIcon size={30} />
            <strong>{t("details.imageTitle")}</strong>
            <span>{t("details.imageDescription")}</span>
            <button
              className="primary-button"
              type="button"
              onClick={() => void openImage(model.absolutePath)}
            >
              {t("details.openImage")}
            </button>
            {imageOpenMessage ? (
              <span className="operation-message" role="status">{imageOpenMessage}</span>
            ) : null}
          </div>
        ) : model && showPreview ? (
          <ModelViewer key={`${model.id}:${previewRenderKey}`} model={model} />
        ) : model ? (
          <div className="preview-placeholder">
            <Eye size={28} />
            <strong>{t("details.previewPaused")}</strong>
            <span>{t("details.previewPausedDescription")}</span>
            <button className="primary-button" type="button" onClick={() => setShowPreview(true)}>
              {t("details.loadPreview")}
            </button>
          </div>
        ) : (
          <span>{t("details.viewer")}</span>
        )}
      </div>

      <div className="details-content">
        <p className="eyebrow">{t("details.selected")}</p>
        <div className="details-title-row">
          <h2 title={model?.name}>{model ? model.name : t("details.noneSelected")}</h2>
          {model ? (
            <div className="details-title-actions">
              <button
                className={`icon-only ${favorite ? "active-icon" : ""}`}
                type="button"
                onClick={() => onToggleFavorite(model.absolutePath)}
                disabled={!metadataWritable}
                aria-label={favorite ? t("details.removeFavorite") : t("details.addFavorite")}
                title={favorite ? t("details.removeFavorite") : t("details.addFavorite")}
              >
                <Star size={16} fill={favorite ? "currentColor" : "none"} />
              </button>
            </div>
          ) : null}
        </div>

        {!model ? (
          <p>{t("details.selectHelp")}</p>
        ) : (
          <>
            {metadataStatus.availability !== "ready" || metadataMessage ? (
              <div className="notice warning metadata-recovery-notice">
                <span>{metadataMessage ?? t("details.readOnly")}</span>
                {metadataStatus.availability !== "ready" ? (
                  <button type="button" onClick={() => void onRetryMetadata()}>
                    {t("common.retry")}
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="details-tabs" role="tablist" aria-label={t("details.tabs")}>
              <button
                className={activeTab === "info" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={activeTab === "info"}
                onClick={() => setActiveTab("info")}
              >
                {t("details.info")}
              </button>
              <button
                className={activeTab === "notes" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={activeTab === "notes"}
                onClick={() => setActiveTab("notes")}
              >
                {t("library.notes")}
              </button>
              <button
                className={activeTab === "actions" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={activeTab === "actions"}
                onClick={() => setActiveTab("actions")}
              >
                {t("details.actions")}
              </button>
            </div>

            {activeTab === "info" ? (
              <>
                <dl className="metadata-list">
                  <div>
                    <dt>
                      <FolderSearch size={15} />
                      {t("details.location")}
                    </dt>
                    <dd className="metadata-location-value" title={model.absolutePath}>
                      <span>{relativeLocation}</span>
                      <span className="metadata-location-actions">
                        <button
                          className="icon-only"
                          type="button"
                          onClick={() => void window.modelLibrary.copyText(model.absolutePath)}
                          aria-label={t("details.copyPath")}
                          title={t("details.copyPath")}
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          className="icon-only"
                          type="button"
                          onClick={() => void onShowModelInFolder(model.absolutePath)}
                          aria-label={t("details.showExplorer")}
                          title={t("details.showExplorer")}
                        >
                          <FolderSearch size={15} />
                        </button>
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <Weight size={15} />
                      {t("details.size")}
                    </dt>
                    <dd>{formatBytes(model.sizeBytes)}</dd>
                  </div>
                  <div>
                    <dt>
                      <Calendar size={15} />
                      {t("details.modified")}
                    </dt>
                    <dd>{formatDate(model.modifiedAt, { dateStyle: "short", timeStyle: "medium" })}</dd>
                  </div>
                </dl>
                {isGeometryOnlyPreview(model.extension) ? (
                  <div className="notice">
                    {t("details.objGeometryOnly")}
                  </div>
                ) : null}
                {archive ? (
                  <div className="archive-panel">
                    <p className="eyebrow">{t("details.archiveContents")}</p>
                    {isArchiveLoading ? <div className="notice">{t("details.archiveReading")}</div> : null}
                    {archiveMessage ? <div className="notice warning">{archiveMessage}</div> : null}
                    {!isArchiveLoading && !archiveMessage && archiveEntries.length === 0 ? (
                      <div className="notice">{t("details.archiveEmpty")}</div>
                    ) : null}
                    {archiveEntries.length > 0 ? (
                      <>
                        <div className="archive-entry-list">
                          {archiveEntries.map((entry) => (
                            <div className="archive-entry-row" key={entry.path}>
                              <ArchiveEntryIcon entry={entry} />
                              <span title={entry.path}>{entry.path}</span>
                              <em>{entry.isDirectory ? t("common.folder") : formatBytes(entry.sizeBytes)}</em>
                            </div>
                          ))}
                        </div>
                        <div className="archive-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => void extractWholeArchive("here")}
                          >
                            {t("details.extractHere")}
                          </button>
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => void extractWholeArchive("named-folder")}
                          >
                            {t("details.extractTo", { name: getArchiveBaseName(model.name) })}
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}

            {activeTab === "notes" ? (
              <div className="organization-panel">
                <TagSelector
                  selectedTags={modelMetadata?.tags ?? []}
                  availableTags={availableTags}
                  onChange={(tags) => onSetModelTags(model.absolutePath, tags)}
                  disabled={!metadataWritable}
                  disabledReason={metadataMessage}
                />
                <label>
                  <span>{t("library.notes")}</span>
                  <textarea
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.currentTarget.value)}
                    onBlur={() => void saveNotes()}
                    disabled={!metadataWritable}
                    title={!metadataWritable ? metadataMessage ?? undefined : undefined}
                    placeholder={t("details.notesPlaceholder")}
                    rows={4}
                  />
                </label>
              </div>
            ) : null}

            {activeTab === "actions" ? (
              <div className="details-actions-tab">
                <div className="quick-actions">
                  <button className="secondary-button" type="button" onClick={onRenameModelFile}>
                    <Pencil size={16} />
                    {t("details.renameFile")}
                  </button>
                  {canConvertToStl(model.extension) ? (
                    <div className="conversion-action">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={conversionProgress !== null}
                        onClick={() => void convertModelToStl(model.absolutePath)}
                      >
                        {conversionProgress !== null ? (
                          <LoaderCircle className="spinning" size={16} />
                        ) : (
                          <Archive size={16} />
                        )}
                        {conversionProgress !== null ? t("details.converting") : t("details.convertToStl")}
                      </button>
                      {conversionProgress !== null ? (
                        <div className="conversion-progress-status">
                          <div
                            className="conversion-progress-track"
                            role="progressbar"
                            aria-label={t("details.conversionProgress")}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={conversionProgress}
                          >
                            <span style={{ width: `${conversionProgress}%` }} />
                          </div>
                          <span>{conversionProgress}%</span>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="slicer-actions">
                  <p className="eyebrow">{t("details.slicers")}</p>
                  {archive ? (
                    <div className="notice">
                      {t("details.archiveSlicerHelp")}
                    </div>
                  ) : !canUseSlicer ? (
                    <div className="notice">{t("details.unsupportedSlicer")}</div>
                  ) : enabledSlicers.length === 0 ? (
                    <div className="notice">
                      <Scissors size={16} />
                      <span>{t("details.configureSlicer")}</span>
                      <button type="button" onClick={onOpenSettings}>
                        {t("common.configure")}
                      </button>
                    </div>
                  ) : (
                    enabledSlicers.map((slicer) => (
                      <button
                        className="primary-button"
                        type="button"
                        key={slicer.id}
                        onClick={() => onLaunchSlicer(slicer.id, model.absolutePath)}
                      >
                        {t("details.openIn", { name: slicer.name })}
                      </button>
                    ))
                  )}
                  {launchMessage ? <div className="notice">{launchMessage}</div> : null}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function ArchiveEntryIcon({ entry }: { entry: ArchiveEntry }) {
  if (entry.isDirectory) {
    return <Folder className="archive-entry-icon" size={15} aria-hidden="true" />;
  }

  if ([".stl", ".3mf", ".obj"].includes(entry.extension)) {
    return <Box className="archive-entry-icon" size={15} aria-hidden="true" />;
  }

  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"].includes(entry.extension)) {
    return <ImageIcon className="archive-entry-icon" size={15} aria-hidden="true" />;
  }

  if ([".pdf", ".txt", ".md", ".doc", ".docx"].includes(entry.extension)) {
    return <FileText className="archive-entry-icon" size={15} aria-hidden="true" />;
  }

  return <File className="archive-entry-icon" size={15} aria-hidden="true" />;
}

function getArchiveBaseName(fileName: string) {
  return fileName.replace(/\.(zip|rar|7z)$/i, "");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
