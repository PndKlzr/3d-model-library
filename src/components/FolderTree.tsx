import {
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronRight,
  EyeOff,
  Folder,
  FolderOpen,
  Layers3,
  Pin,
  PinOff
} from "lucide-react";
import type { CSSProperties, DragEvent, MouseEvent } from "react";
import { useRef, useState } from "react";
import type { FolderNode } from "../lib/folderTree";
import { ALL_FOLDERS_ID } from "../lib/folderFilters";
import { useI18n } from "../i18n/I18nProvider";

type FolderTreeProps = {
  folders: FolderNode[];
  selectedFolder: string;
  includeSubfolders: boolean;
  modelCount: number;
  selectedModelCount: number;
  canMoveModels: boolean;
  pointerDragOverFolder: string | null;
  expandedFolderIds: Set<string>;
  excludedFolderIds: ReadonlySet<string>;
  onSelectFolder: (folderId: string) => void;
  onToggleFolder: (folderId: string) => void;
  onExpandAllFolders: () => void;
  onCollapseAllFolders: () => void;
  onToggleIncludeSubfolders: (value: boolean) => void;
  onOpenFolderContextMenu: (folderId: string, x: number, y: number) => void;
  onMoveModelsToFolder: (folderId: string) => void;
  foldersPinned: boolean;
  onToggleFoldersPinned: () => void;
};

export function FolderTree({
  folders,
  selectedFolder,
  includeSubfolders,
  modelCount,
  selectedModelCount,
  canMoveModels,
  pointerDragOverFolder,
  expandedFolderIds,
  excludedFolderIds,
  onSelectFolder,
  onToggleFolder,
  onExpandAllFolders,
  onCollapseAllFolders,
  onToggleIncludeSubfolders,
  onOpenFolderContextMenu,
  onMoveModelsToFolder,
  foldersPinned,
  onToggleFoldersPinned
}: FolderTreeProps) {
  const { t } = useI18n();
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
      aria-label={t("navigation.folderTree")}
      ref={sidebarRef}
      onDragOver={scrollSidebarDuringDrag}
      onDragLeave={() => setDragOverFolder(null)}
    >
      <div className="brand-block">
        <span className="brand-mark">3D</span>
        <div>
          <h1>Model Library</h1>
          <p>{t("library.modelCount", { count: modelCount })}</p>
        </div>
      </div>

      <button
        className={`folder-row ${selectedFolder === ALL_FOLDERS_ID ? "selected" : ""} ${
          dragOverFolder === ALL_FOLDERS_ID || pointerDragOverFolder === ALL_FOLDERS_ID
            ? "drop-target"
            : ""
        }`}
        data-folder-drop-id={ALL_FOLDERS_ID}
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
        <span>{t("navigation.allModels")}</span>
      </button>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={includeSubfolders}
          onChange={(event) => onToggleIncludeSubfolders(event.currentTarget.checked)}
        />
        <span>{t("navigation.includeSubfolders")}</span>
      </label>

      {selectedModelCount > 0 ? (
        <div className="selection-hint">
          {t("library.selectedCount", { count: selectedModelCount })}
        </div>
      ) : null}

      <div className="folder-tree-heading">
        <span>{t("navigation.folders")}</span>
        <div className="folder-tree-actions" aria-label={t("navigation.folderActions")}>
          <button
            className="folder-pin-button"
            type="button"
            onClick={onToggleFoldersPinned}
            aria-pressed={foldersPinned}
            title={t(foldersPinned ? "navigation.unpinFolders" : "navigation.pinFolders")}
            aria-label={t(foldersPinned ? "navigation.unpinFolders" : "navigation.pinFolders")}
          >
            {foldersPinned ? <PinOff size={15} /> : <Pin size={15} />}
          </button>
          <button
            type="button"
            onClick={onExpandAllFolders}
            title={t("navigation.expandAll")}
            aria-label={t("navigation.expandAll")}
          >
            <ChevronsUpDown size={15} />
          </button>
          <button
            type="button"
            onClick={onCollapseAllFolders}
            title={t("navigation.collapseAll")}
            aria-label={t("navigation.collapseAll")}
          >
            <ChevronsDownUp size={15} />
          </button>
        </div>
      </div>

      <div className="folder-list">
        {folders.map((folder) => (
          <FolderNodeButton
            key={folder.id}
            folder={folder}
            selectedFolder={selectedFolder}
            dragOverFolder={dragOverFolder}
            pointerDragOverFolder={pointerDragOverFolder}
            canMoveModels={canMoveModels}
            expandedFolderIds={expandedFolderIds}
            excludedFolderIds={excludedFolderIds}
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
  pointerDragOverFolder,
  canMoveModels,
  expandedFolderIds,
  excludedFolderIds,
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
  pointerDragOverFolder: string | null;
  canMoveModels: boolean;
  expandedFolderIds: Set<string>;
  excludedFolderIds: ReadonlySet<string>;
  onSelectFolder: (folderId: string) => void;
  onToggleFolder: (folderId: string) => void;
  onOpenFolderContextMenu: (folderId: string, x: number, y: number) => void;
  onDragOverFolder: (event: DragEvent, folderId: string) => void;
  onDragLeaveFolder: () => void;
  onDropOnFolder: (event: DragEvent, folderId: string) => void;
  depth?: number;
}) {
  const { t } = useI18n();
  const isExpanded = expandedFolderIds.has(folder.id);
  const hasChildren = folder.children.length > 0;
  const isExcluded = excludedFolderIds.has(folder.id);

  function openContextMenu(event: MouseEvent) {
    event.preventDefault();
    onOpenFolderContextMenu(folder.id, event.clientX, event.clientY);
  }

  return (
    <div>
      <div
        className={`folder-row folder-tree-row ${canMoveModels ? "drag-target-ready" : ""} ${
          selectedFolder === folder.id ? "selected" : ""
        } ${isExcluded ? "excluded" : ""} ${
          dragOverFolder === folder.id || pointerDragOverFolder === folder.id ? "drop-target" : ""
        }`}
        data-folder-drop-id={folder.id}
        style={
          {
            "--folder-indent": `${Math.min(depth, 4) * 12}px`
          } as CSSProperties
        }
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
            aria-label={t(isExpanded ? "navigation.collapseFolder" : "navigation.expandFolder", {
              name: folder.name
            })}
            aria-expanded={isExpanded}
          >
            <ChevronRight size={14} />
          </button>
        ) : (
          <span className="folder-disclosure-placeholder" aria-hidden="true" />
        )}
        <span className="folder-node-icon" aria-hidden="true">
          {isExpanded && hasChildren ? <FolderOpen size={15} /> : <Folder size={15} />}
        </span>
        <button className="folder-name-button" type="button" onClick={() => onSelectFolder(folder.id)}>
          <span>{folder.name}</span>
        </button>
        {isExcluded ? (
          <span
            className="folder-excluded-indicator"
            aria-label={t("navigation.hiddenFolder", { name: folder.name })}
            title={t("navigation.hiddenResults")}
          >
            <EyeOff size={13} />
          </span>
        ) : null}
        {canMoveModels ? <span className="drop-cue">{t("navigation.drop")}</span> : null}
      </div>
      {isExpanded ? folder.children.map((child) => (
        <FolderNodeButton
          key={child.id}
          folder={child}
          selectedFolder={selectedFolder}
          dragOverFolder={dragOverFolder}
          pointerDragOverFolder={pointerDragOverFolder}
          canMoveModels={canMoveModels}
          expandedFolderIds={expandedFolderIds}
          excludedFolderIds={excludedFolderIds}
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
