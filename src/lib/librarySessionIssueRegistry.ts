import type {
  LibrarySessionIssueFact,
  LibrarySessionIssueKind
} from "../shared/types";

export type LibrarySessionIssueRegistry = {
  record: (kind: LibrarySessionIssueKind, modelPath: string, error: unknown) => void;
  resolve: (kind: LibrarySessionIssueKind, modelPath: string) => void;
  reset: () => void;
  getSnapshot: () => LibrarySessionIssueFact[];
  subscribe: (listener: (issues: LibrarySessionIssueFact[]) => void) => () => void;
};

export function createLibrarySessionIssueRegistry(
  limit = 250,
  reportIssue?: (issue: LibrarySessionIssueFact) => void
): LibrarySessionIssueRegistry {
  const boundedLimit = Math.max(1, Math.min(250, Math.floor(limit)));
  const issues = new Map<string, LibrarySessionIssueFact>();
  const listeners = new Set<(issues: LibrarySessionIssueFact[]) => void>();

  function snapshot() {
    return [...issues.values()].map((issue) => ({ ...issue }));
  }

  function publish() {
    const current = snapshot();
    for (const listener of listeners) listener(current.map((issue) => ({ ...issue })));
  }

  return {
    record(kind, modelPath, error) {
      const key = `${kind}\0${modelPath}`;
      const issue = {
        kind,
        modelPath,
        detail: (error instanceof Error ? error.message : String(error)).slice(0, 500)
      } satisfies LibrarySessionIssueFact;
      issues.delete(key);
      issues.set(key, issue);
      while (issues.size > boundedLimit) issues.delete(issues.keys().next().value!);
      reportIssue?.({ ...issue });
      publish();
    },
    resolve(kind, modelPath) {
      if (issues.delete(`${kind}\0${modelPath}`)) publish();
    },
    reset() {
      if (issues.size === 0) return;
      issues.clear();
      publish();
    },
    getSnapshot: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    }
  };
}

export const librarySessionIssueRegistry = createLibrarySessionIssueRegistry(250, (issue) => {
  console.error(`[library-issue] ${JSON.stringify(issue)}`);
});
