import { Calendar, Eye, FolderOpen, Pencil, Scissors, Star, Tag, Weight } from "lucide-react";
import { useEffect, useState } from "react";
import { ModelViewer } from "./ModelViewer";
import type { AppSettings, ModelFile, ModelUserMetadata } from "../shared/types";

type DetailsPanelProps = {
  model: ModelFile | null;
  settings: AppSettings;
  modelMetadata: ModelUserMetadata | null;
  launchMessage: string | null;
  onOpenSettings: () => void;
  onLaunchSlicer: (slicerId: string, modelPath: string) => Promise<void>;
  onRenameModelFile: () => void;
  onShowModelInFolder: (modelPath: string) => Promise<void>;
  onToggleFavorite: (modelPath: string) => Promise<void>;
  onSetModelTags: (modelPath: string, tags: string[]) => Promise<void>;
  onSetModelNotes: (modelPath: string, notes: string) => Promise<void>;
};

export function DetailsPanel({
  model,
  settings,
  modelMetadata,
  launchMessage,
  onOpenSettings,
  onLaunchSlicer,
  onRenameModelFile,
  onShowModelInFolder,
  onToggleFavorite,
  onSetModelTags,
  onSetModelNotes
}: DetailsPanelProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const enabledSlicers = settings.slicers.filter((slicer) => slicer.enabled && slicer.executablePath);
  const favorite = modelMetadata?.favorite ?? false;

  useEffect(() => {
    setShowPreview(false);
  }, [model?.id]);

  useEffect(() => {
    setTagDraft(modelMetadata?.tags.join(", ") ?? "");
    setNotesDraft(modelMetadata?.notes ?? "");
  }, [model?.id, modelMetadata?.tags, modelMetadata?.notes]);

  async function saveTags() {
    if (!model) {
      return;
    }

    await onSetModelTags(
      model.absolutePath,
      tagDraft.split(",").map((tag) => tag.trim())
    );
  }

  async function saveNotes() {
    if (!model) {
      return;
    }

    await onSetModelNotes(model.absolutePath, notesDraft);
  }

  return (
    <aside className="details-panel" aria-label="Detalhes do modelo">
      <div className="preview-stage">
        {model && showPreview ? (
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
          <h2>{model ? model.name : "Nenhum modelo selecionado"}</h2>
          {model ? (
            <div className="details-title-actions">
              <button
                className={`icon-only ${favorite ? "active-icon" : ""}`}
                type="button"
                onClick={() => onToggleFavorite(model.absolutePath)}
                aria-label={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              >
                <Star size={16} fill={favorite ? "currentColor" : "none"} />
              </button>
              <button
                className="icon-only"
                type="button"
                onClick={() => onShowModelInFolder(model.absolutePath)}
                aria-label="Mostrar no Explorer"
                title="Mostrar no Explorer"
              >
                <FolderOpen size={16} />
              </button>
              <button
                className="icon-only"
                type="button"
                onClick={onRenameModelFile}
                aria-label="Renomear arquivo"
                title="Renomear arquivo"
              >
                <Pencil size={16} />
              </button>
            </div>
          ) : null}
        </div>
        {!model ? (
          <p>Selecione um arquivo para ver dimensões, data, pasta e abrir no slicer.</p>
        ) : (
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

            <div className="organization-panel">
              <label>
                <span>
                  <Tag size={15} />
                  Tags
                </span>
                <input
                  value={tagDraft}
                  onChange={(event) => setTagDraft(event.currentTarget.value)}
                  onBlur={() => void saveTags()}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void saveTags();
                    }
                  }}
                  placeholder="fidget, casa, suporte"
                />
              </label>
              <label>
                <span>Notas</span>
                <textarea
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.currentTarget.value)}
                  onBlur={() => void saveNotes()}
                  placeholder="Config de impressão, filamento, observações..."
                  rows={4}
                />
              </label>
            </div>

            <div className="slicer-actions">
              <p className="eyebrow">Slicers</p>
              {enabledSlicers.length === 0 ? (
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
          </>
        )}
      </div>
    </aside>
  );
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
