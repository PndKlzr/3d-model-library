import {
  Archive,
  Calendar,
  Copy,
  Eye,
  Box,
  File,
  FileText,
  Folder,
  FolderOpen,
  FolderSearch,
  LoaderCircle,
  Image as ImageIcon,
  Pencil,
  Scissors,
  Star,
  Weight
} from "lucide-react";
import { useEffect, useState } from "react";
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

type DetailsTab = "info" | "notes" | "actions";

type DetailsPanelProps = {
  model: ModelFile | null;
  settings: AppSettings;
  modelMetadata: ModelUserMetadata | null;
  availableTags: string[];
  launchMessage: string | null;
  metadataStatus: LibraryMetadataStatus;
  metadataWritable: boolean;
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
};

export function DetailsPanel({
  model,
  settings,
  modelMetadata,
  availableTags,
  launchMessage,
  metadataStatus,
  metadataWritable,
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
  onConvertThreeMfToStl
}: DetailsPanelProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState<DetailsTab>("info");
  const [notesDraft, setNotesDraft] = useState("");
  const [archiveEntries, setArchiveEntries] = useState<ArchiveEntry[]>([]);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [imageOpenMessage, setImageOpenMessage] = useState<string | null>(null);
  const [isArchiveLoading, setIsArchiveLoading] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<number | null>(null);
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
    setActiveTab("info");
    setArchiveEntries([]);
    setArchiveMessage(null);
    setImageOpenMessage(null);
    setConversionProgress(null);
  }, [model?.id]);

  async function openImage(modelPath: string) {
    setImageOpenMessage(null);
    try {
      await onOpenLibraryFile(modelPath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      setImageOpenMessage(`Não foi possível abrir a imagem. ${detail}`);
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
        if (isMounted) {
          setArchiveEntries(result.entries);
        }
      })
      .catch((error) => {
        if (isMounted) {
          setArchiveMessage(error instanceof Error ? error.message : String(error));
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
  }, [archive, model]);

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
    <aside className="details-panel" aria-label="Detalhes do modelo">
      <div className="preview-stage">
        {model && archive ? (
          <div className="preview-placeholder">
            <Archive size={30} />
            <strong>Arquivo compactado</strong>
            <span>Veja todo o conteúdo do pacote e escolha onde extrair.</span>
          </div>
        ) : model && directImage ? (
          <div className="preview-placeholder image-preview-placeholder">
            <ImageIcon size={30} />
            <strong>Arquivo de imagem</strong>
            <span>Abra no aplicativo padrão do Windows para ver em tamanho completo.</span>
            <button
              className="primary-button"
              type="button"
              onClick={() => void openImage(model.absolutePath)}
            >
              Abrir imagem
            </button>
            {imageOpenMessage ? (
              <span className="operation-message" role="status">{imageOpenMessage}</span>
            ) : null}
          </div>
        ) : model && showPreview ? (
          <ModelViewer model={model} />
        ) : model ? (
          <div className="preview-placeholder">
            <Eye size={28} />
            <strong>Preview pausado</strong>
            <span>Para manter a biblioteca leve, o 3D só carrega quando você pedir.</span>
            <button className="primary-button" type="button" onClick={() => setShowPreview(true)}>
              Carregar preview 3D
            </button>
          </div>
        ) : (
          <span>Visualizador 3D</span>
        )}
      </div>

      <div className="details-content">
        <p className="eyebrow">Selecionado</p>
        <div className="details-title-row">
          <h2 title={model?.name}>{model ? model.name : "Nenhum modelo selecionado"}</h2>
          {model ? (
            <div className="details-title-actions">
              <button
                className={`icon-only ${favorite ? "active-icon" : ""}`}
                type="button"
                onClick={() => onToggleFavorite(model.absolutePath)}
                disabled={!metadataWritable}
                aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              >
                <Star size={16} fill={favorite ? "currentColor" : "none"} />
              </button>
            </div>
          ) : null}
        </div>

        {!model ? (
          <p>Selecione um arquivo para ver dados, notas e ações.</p>
        ) : (
          <>
            {metadataStatus.availability !== "ready" || metadataStatus.message ? (
              <div className="notice warning metadata-recovery-notice">
                <span>{metadataStatus.message ?? "Os dados desta biblioteca estão somente para leitura."}</span>
                {metadataStatus.availability !== "ready" ? (
                  <button type="button" onClick={() => void onRetryMetadata()}>
                    Tentar novamente
                  </button>
                ) : null}
              </div>
            ) : null}
            <div className="details-tabs" role="tablist" aria-label="Detalhes do arquivo">
              <button
                className={activeTab === "info" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={activeTab === "info"}
                onClick={() => setActiveTab("info")}
              >
                Info
              </button>
              <button
                className={activeTab === "notes" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={activeTab === "notes"}
                onClick={() => setActiveTab("notes")}
              >
                Notas
              </button>
              <button
                className={activeTab === "actions" ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={activeTab === "actions"}
                onClick={() => setActiveTab("actions")}
              >
                Ações
              </button>
            </div>

            {activeTab === "info" ? (
              <>
                <dl className="metadata-list">
                  <div>
                    <dt>
                      <FolderOpen size={15} />
                      Pasta
                    </dt>
                    <dd>{model.relativeFolder || "Raiz"}</dd>
                  </div>
                  <div>
                    <dt>
                      <FolderSearch size={15} />
                      Localização
                    </dt>
                    <dd className="metadata-location-value" title={model.absolutePath}>
                      <span>{relativeLocation}</span>
                      <span className="metadata-location-actions">
                        <button
                          className="icon-only"
                          type="button"
                          onClick={() => void window.modelLibrary.copyText(model.absolutePath)}
                          aria-label="Copiar caminho completo"
                          title="Copiar caminho completo"
                        >
                          <Copy size={15} />
                        </button>
                        <button
                          className="icon-only"
                          type="button"
                          onClick={() => void onShowModelInFolder(model.absolutePath)}
                          aria-label="Mostrar no Explorer"
                          title="Mostrar no Explorer"
                        >
                          <FolderSearch size={15} />
                        </button>
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>
                      <Weight size={15} />
                      Tamanho
                    </dt>
                    <dd>{formatBytes(model.sizeBytes)}</dd>
                  </div>
                  <div>
                    <dt>
                      <Calendar size={15} />
                      Modificado
                    </dt>
                    <dd>{new Date(model.modifiedAt).toLocaleString()}</dd>
                  </div>
                </dl>
                {isGeometryOnlyPreview(model.extension) ? (
                  <div className="notice">
                    OBJ exibe somente a geometria; materiais e texturas externas não são carregados.
                  </div>
                ) : null}
                {archive ? (
                  <div className="archive-panel">
                    <p className="eyebrow">Conteúdo do pacote</p>
                    {isArchiveLoading ? <div className="notice">Lendo arquivo compactado...</div> : null}
                    {archiveMessage ? <div className="notice warning">{archiveMessage}</div> : null}
                    {!isArchiveLoading && !archiveMessage && archiveEntries.length === 0 ? (
                      <div className="notice">Este arquivo compactado está vazio.</div>
                    ) : null}
                    {archiveEntries.length > 0 ? (
                      <>
                        <div className="archive-entry-list">
                          {archiveEntries.map((entry) => (
                            <div className="archive-entry-row" key={entry.path}>
                              <ArchiveEntryIcon entry={entry} />
                              <span title={entry.path}>{entry.path}</span>
                              <em>{entry.isDirectory ? "Pasta" : formatBytes(entry.sizeBytes)}</em>
                            </div>
                          ))}
                        </div>
                        <div className="archive-actions">
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => void extractWholeArchive("here")}
                          >
                            Extrair aqui
                          </button>
                          <button
                            className="primary-button"
                            type="button"
                            onClick={() => void extractWholeArchive("named-folder")}
                          >
                            Extrair para {getArchiveBaseName(model.name)}\
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
                  disabledReason={metadataStatus.message}
                />
                <label>
                  <span>Notas</span>
                  <textarea
                    value={notesDraft}
                    onChange={(event) => setNotesDraft(event.currentTarget.value)}
                    onBlur={() => void saveNotes()}
                    disabled={!metadataWritable}
                    title={!metadataWritable ? metadataStatus.message ?? undefined : undefined}
                    placeholder="Configuração de impressão, filamento, observações..."
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
                    Renomear arquivo
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
                        {conversionProgress !== null ? "Convertendo..." : "Converter para STL"}
                      </button>
                      {conversionProgress !== null ? (
                        <div className="conversion-progress-status">
                          <div
                            className="conversion-progress-track"
                            role="progressbar"
                            aria-label="Progresso da conversao para STL"
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
                  <p className="eyebrow">Slicers</p>
                  {archive ? (
                    <div className="notice">
                      Extraia um STL ou 3MF do pacote antes de abrir no slicer.
                    </div>
                  ) : !canUseSlicer ? (
                    <div className="notice">Este tipo de arquivo não é enviado ao slicer.</div>
                  ) : enabledSlicers.length === 0 ? (
                    <div className="notice">
                      <Scissors size={16} />
                      <span>Configure Cura ou Creality Print para abrir este modelo.</span>
                      <button type="button" onClick={onOpenSettings}>
                        Configurar
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
                        Abrir no {slicer.name}
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
