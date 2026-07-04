import type { LibraryActionLogEntry } from "../shared/types";

const ACTION_LOG_LIMIT = 20;

export function appendActionLogEntry(
  entries: LibraryActionLogEntry[],
  entry: LibraryActionLogEntry
): LibraryActionLogEntry[];
export function appendActionLogEntry<TEntry extends LibraryActionLogEntry>(
  entries: TEntry[],
  entry: TEntry
): TEntry[];
export function appendActionLogEntry<TEntry extends LibraryActionLogEntry>(
  entries: TEntry[],
  entry: TEntry
): TEntry[] {
  return [entry, ...entries].slice(0, ACTION_LOG_LIMIT);
}

export function markActionUndone(
  entries: LibraryActionLogEntry[],
  actionId: string
): LibraryActionLogEntry[];
export function markActionUndone<TEntry extends LibraryActionLogEntry>(
  entries: TEntry[],
  actionId: string
): TEntry[];
export function markActionUndone<TEntry extends LibraryActionLogEntry>(
  entries: TEntry[],
  actionId: string
): TEntry[] {
  return entries.map((entry) =>
    entry.id === actionId ? { ...entry, undoable: false, undone: true } : entry
  );
}
