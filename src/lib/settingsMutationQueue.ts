export type SettingsMutationQueue<T> = {
  enqueue: (mutation: (current: T) => T) => Promise<T>;
};

export function createSettingsMutationQueue<T>(
  initial: T,
  persist: (next: T, previous: T) => Promise<T>
): SettingsMutationQueue<T> {
  let committed = initial;
  let tail = Promise.resolve();

  function enqueue(mutation: (current: T) => T): Promise<T> {
    const result = tail.then(async () => {
      const next = mutation(committed);
      const saved = await persist(next, committed);
      committed = saved;
      return saved;
    });
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  return { enqueue };
}
