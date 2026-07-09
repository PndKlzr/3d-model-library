import { ChevronsDownUp, ChevronsUpDown, ChevronRight, Folder, Layers3 } from "lucide-react";
import type { DragEvent, MouseEvent } from "react";
import { useRef, useState } from "react";
import type { FolderNode } from "../lib/folderTree";
import { ALL_FOLDERS_ID } from "../lib/folderFilters";

type FolderTreeProps = {
  folders: FolderNode[];
  selectedFolder: string;
  includeSubfolders: boolean;
  modelCount: number;
  selectedModelCount: number;
  canMoveModels: boolean;
  expandedFolderIds: Set<string>;
  onSelectFolder: (folderId: string) => void;
  onToggleFolder: (folderId: string) => void;
  onExpandAllFolders: () => void;
  onCollapseAllFolders: () => void;
  onToggleIncludeSubfolders: (value: boolean) => void;
  onOpenFolderContextMenu: (folderId: string, x: number, y: number) => void;
  onMoveModelsToFolder: (folderId: string) => void;
};

export function FolderTree({
  folders,
  selectedFolder,
  includeSubfolders,
  modelCount,
  selectedModelCount,
  canMoveModels,
  expandedFolderIds,
  onSelectFolder,
  onToggleFolder,
  onExpandAllFolders,
  onCollapseAllFolders,
  onToggleIncludeSubfolders,
  onOpenFolderContextMenu,
  onMoveModelsToFolder
}: FolderTreeProps) {
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const sidebarRef = useRef<HTMLElement | null>(null);

  function allowFolderDrop(event: DragEvent, folderId: string) {
    if (!canMoveModels) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    scrollSidebarDuringDrag(event);
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
    <aside
      className="sidebar"
      aria-label="Pastas da biblioteca"
      ref={sidebarRef}
      onDragOver={scrollSidebarDuringDrag}
      onDragLeave={() => setDragOverFolder(null)}
    >
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
        onContextMenu={(event) => {
          event.preventDefault();
          onOpenFolderContextMenu(ALL_FOLDERS_ID, event.clientX, event.clientY);
        }}
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

      {selectedModelCount > 0 ? (
        <div className="selection-hint">
          {selectedModelCount} selecionado{selectedModelCount === 1 ? "" : "s"} para organizar
        </div>
      ) : null}

      <div className="folder-tree-actions" aria-label="Acoes da arvore de pastas">
        <button type="button" onClick={onExpandAllFolders} title="Expandir tudo">
          <ChevronsUpDown size={15} />
          Expandir tudo
        </button>
        <button type="button" onClick={onCollapseAllFolders} title="Recolher tudo">
          <ChevronsDownUp size={15} />
          Recolher tudo
        </button>
      </div>

      <div className="folder-list">
        {folders.map((folder) => (
          <FolderNodeButton
            key={folder.id}
            folder={folder}
            selectedFolder={selectedFolder}
            dragOverFolder={dragOverFolder}
            canMoveModels={canMoveModels}
            expandedFolderIds={expandedFolderIds}
            onSelectFolder={onSelectFolder}
            onToggleFolder={onToggleFolder}
            onOpenFolderContextMenu={onOpenFolderContextMenu}
            onDragOverFolder={allowFolderDrop}
            onDragLeaveFolder={() => setDragOverFolder(null)}
            onDropOnFolder={dropOnFolder}
          />
        ))}
      </div>
    </aside>
  );

  function scrollSidebarDuringDrag(event: DragEvent) {
    if (!canMoveModels) {
      return;
    }

    const sidebar = sidebarRef.current;

    if (!sidebar) {
      return;
    }

    event.preventDefault();
    const edgeSize = 72;
    const scrollStep = 18;
    const rect = sidebar.getBoundingClientRect();

    if (event.clientY < rect.top + edgeSize) {
      sidebar.scrollTop -= scrollStep;
    } else if (event.clientY > rect.bottom - edgeSize) {
      sidebar.scrollTop += scrollStep;
    }
  }
}

function FolderNodeButton({
  folder,
  selectedFolder,
  dragOverFolder,
  canMoveModels,
  expandedFolderIds,
  onSelectFolder,
  onToggleFolder,
  onOpenFolderContextMenu,
  onDragOverFolder,
  onDragLeaveFolder,
  onDropOnFolder,
  depth = 0
}: {
  folder: FolderNode;
  selectedFolder: string;
  dragOverFolder: string | null;
  canMoveModels: boolean;
  expandedFolderIds: Set<string>;
  onSelectFolder: (folderId: string) => void;
  onToggleFolder: (folderId: string) => void;
  onOpenFolderContextMenu: (folderId: string, x: number, y: number) => void;
  onDragOverFolder: (event: DragEvent, folderId: string) => void;
  onDragLeaveFolder: () => void;
  onDropOnFolder: (event: DragEvent, folderId: string) => void;
  depth?: number;
}) {
  const isExpanded = expandedFolderIds.has(folder.id);
  const hasChildren = folder.children.length > 0;

  function openContextMenu(event: MouseEvent) {
    event.preventDefault();
    onOpenFolderContextMenu(folder.id, event.clientX, event.clientY);
  }

  return (
    <div>
      <div
        className={`folder-row folder-tree-row ${selectedFolder === folder.id ? "selected" : ""} ${
          dragOverFolder === folder.id ? "drop-target" : ""
        }`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onDragOver={(event) => onDragOverFolder(event, folder.id)}
        onDragLeave={onDragLeaveFolder}
        onDrop={(event) => onDropOnFolder(event, folder.id)}
        onContextMenu={openContextMenu}
      >
        {hasChildren ? (
          <button
            className={`folder-disclosure ${isExpanded ? "expanded" : ""}`}
            type="button"
            onClick={() => onToggleFolder(folder.id)}
            aria-label={isExpanded ? `Recolher ${folder.name}` : `Expandir ${folder.name}`}
            aria-expanded={isExpanded}
          >
            <ChevronRight size={14} />
          </button>
        ) : (
          <span className="folder-disclosure-placeholder">
            <Folder size={14} />
          </span>
        )}
        <button className="folder-name-button" type="button" onClick={() => onSelectFolder(folder.id)}>
          <span>{folder.name}</span>
        </button>
        {canMoveModels ? <span className="drop-cue">Soltar</span> : null}
      </div>
      {isExpanded ? folder.children.map((child) => (
        <FolderNodeButton
          key={child.id}
          folder={child}
          selectedFolder={selectedFolder}
          dragOverFolder={dragOverFolder}
          canMoveModels={canMoveModels}
          expandedFolderIds={expandedFolderIds}
          onSelectFolder={onSelectFolder}
          onToggleFolder={onToggleFolder}
          onOpenFolderContextMenu={onOpenFolderContextMenu}
          onDragOverFolder={onDragOverFolder}
          onDragLeaveFolder={onDragLeaveFolder}
          onDropOnFolder={onDropOnFolder}
          depth={depth + 1}
        />
      )) : null}
    </div>
  );
}
