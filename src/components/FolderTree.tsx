import { ChevronRight, Folder, Layers3 } from "lucide-react";
import type { FolderNode } from "../lib/folderTree";
import { ALL_FOLDERS_ID } from "../lib/folderFilters";

type FolderTreeProps = {
  folders: FolderNode[];
  selectedFolder: string;
  includeSubfolders: boolean;
  modelCount: number;
  onSelectFolder: (folderId: string) => void;
  onToggleIncludeSubfolders: (value: boolean) => void;
};

export function FolderTree({
  folders,
  selectedFolder,
  includeSubfolders,
  modelCount,
  onSelectFolder,
  onToggleIncludeSubfolders
}: FolderTreeProps) {
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
        className={`folder-row ${selectedFolder === ALL_FOLDERS_ID ? "selected" : ""}`}
        type="button"
        onClick={() => onSelectFolder(ALL_FOLDERS_ID)}
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

      <div className="folder-list">
        {folders.map((folder) => (
          <FolderNodeButton
            key={folder.id}
            folder={folder}
            selectedFolder={selectedFolder}
            onSelectFolder={onSelectFolder}
          />
        ))}
      </div>
    </aside>
  );
}

function FolderNodeButton({
  folder,
  selectedFolder,
  onSelectFolder,
  depth = 0
}: {
  folder: FolderNode;
  selectedFolder: string;
  onSelectFolder: (folderId: string) => void;
  depth?: number;
}) {
  return (
    <div>
      <button
        className={`folder-row ${selectedFolder === folder.id ? "selected" : ""}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        type="button"
        onClick={() => onSelectFolder(folder.id)}
      >
        {folder.children.length > 0 ? <ChevronRight size={14} /> : <Folder size={14} />}
        <span>{folder.name}</span>
      </button>
      {folder.children.map((child) => (
        <FolderNodeButton
          key={child.id}
          folder={child}
          selectedFolder={selectedFolder}
          onSelectFolder={onSelectFolder}
          depth={depth + 1}
        />
      ))}
    </div>
  );
}
