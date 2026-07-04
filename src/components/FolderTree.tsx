import { ChevronRight, Folder, FolderPen, FolderPlus, Layers3 } from "lucide-react";
import type { DragEvent } from "react";
import { useState } from "react";
import type { FolderNode } from "../lib/folderTree";
import { ALL_FOLDERS_ID } from "../lib/folderFilters";

type FolderTreeProps = {
  folders: FolderNode[];
  selectedFolder: string;
  includeSubfolders: boolean;
  modelCount: number;
  selectedModelCount: number;
  canMoveModels: boolean;
  onSelectFolder: (folderId: string) => void;
  onToggleIncludeSubfolders: (value: boolean) => void;
  onCreateFolder: () => void;
  onRenameFolder: () => void;
  onMoveModelsToFolder: (folderId: string) => void;
};

export function FolderTree({
  folders,
  selectedFolder,
  includeSubfolders,
  modelCount,
  selectedModelCount,
  canMoveModels,
  onSelectFolder,
  onToggleIncludeSubfolders,
  onCreateFolder,
  onRenameFolder,
  onMoveModelsToFolder
}: FolderTreeProps) {
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  function allowFolderDrop(event: DragEvent, folderId: string) {
    if (!canMoveModels) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverFolder(folderId);
  }

  function dropOnFolder(event: DragEvent, folderId: string) {
    if (!canMoveModels) {
      return;
    }

    event.preventDefault();
    setDragOverFolder(null);
    onMoveModelsToFolder(folderId);
  }

  return (
    <aside className="sidebar" aria-label="Pastas da biblioteca">
      <div className="brand-block">
        <span className="brand-mark">3D</span>
        <div>
          <h1>Model Library</h1>
          <p>{modelCount} modelos</p>
        </div>
      </div>

      <button
        className={`folder-row ${selectedFolder === ALL_FOLDERS_ID ? "selected" : ""} ${
          dragOverFolder === ALL_FOLDERS_ID ? "drop-target" : ""
        }`}
        type="button"
        onClick={() => onSelectFolder(ALL_FOLDERS_ID)}
        onDragOver={(event) => allowFolderDrop(event, ALL_FOLDERS_ID)}
        onDragLeave={() => setDragOverFolder(null)}
        onDrop={(event) => dropOnFolder(event, ALL_FOLDERS_ID)}
      >
        <Layers3 size={16} />
        <span>Todos os modelos</span>
      </button>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={includeSubfolders}
          onChange={(event) => onToggleIncludeSubfolders(event.currentTarget.checked)}
        />
        <span>Incluir subpastas</span>
      </label>

      <div className="folder-tools" aria-label="Organizar pastas">
        <button type="button" onClick={onCreateFolder} title="Criar pasta">
          <FolderPlus size={16} />
          <span>Nova pasta</span>
        </button>
        <button
          type="button"
          onClick={onRenameFolder}
          disabled={selectedFolder === ALL_FOLDERS_ID}
          title="Renomear pasta selecionada"
        >
          <FolderPen size={16} />
          <span>Renomear</span>
        </button>
      </div>

      {selectedModelCount > 0 ? (
        <div className="selection-hint">
          {selectedModelCount} selecionado{selectedModelCount === 1 ? "" : "s"} para organizar
        </div>
      ) : null}

      <div className="folder-list">
        {folders.map((folder) => (
          <FolderNodeButton
            key={folder.id}
            folder={folder}
            selectedFolder={selectedFolder}
            dragOverFolder={dragOverFolder}
            canMoveModels={canMoveModels}
            onSelectFolder={onSelectFolder}
            onDragOverFolder={allowFolderDrop}
            onDragLeaveFolder={() => setDragOverFolder(null)}
            onDropOnFolder={dropOnFolder}
          />
        ))}
      </div>
    </aside>
  );
}

function FolderNodeButton({
  folder,
  selectedFolder,
  dragOverFolder,
  canMoveModels,
  onSelectFolder,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
  depth = 0
}: {
  folder: FolderNode;
  selectedFolder: string;
  dragOverFolder: string | null;
  canMoveModels: boolean;
  onSelectFolder: (folderId: string) => void;
  onDragOverFolder: (event: DragEvent, folderId: string) => void;
  onDragLeaveFolder: () => void;
  onDropOnFolder: (event: DragEvent, folderId: string) => void;
  depth?: number;
}) {
  return (
    <div>
      <button
        className={`folder-row ${selectedFolder === folder.id ? "selected" : ""} ${
          dragOverFolder === folder.id ? "drop-target" : ""
        }`}
        style={{ paddingLeft: 10 + depth * 14 }}
        type="button"
        onClick={() => onSelectFolder(folder.id)}
        onDragOver={(event) => onDragOverFolder(event, folder.id)}
        onDragLeave={onDragLeaveFolder}
        onDrop={(event) => onDropOnFolder(event, folder.id)}
      >
        {folder.children.length > 0 ? <ChevronRight size={14} /> : <Folder size={14} />}
        <span>{folder.name}</span>
        {canMoveModels ? <span className="drop-cue">Soltar</span> : null}
      </button>
      {folder.children.map((child) => (
        <FolderNodeButton
          key={child.id}
          folder={child}
          selectedFolder={selectedFolder}
          dragOverFolder={dragOverFolder}
          canMoveModels={canMoveModels}
          onSelectFolder={onSelectFolder}
          onDragOverFolder={onDragOverFolder}
          onDragLeaveFolder={onDragLeaveFolder}
          onDropOnFolder={onDropOnFolder}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
