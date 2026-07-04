type QueueTask = () => Promise<void> | void;

export function createTaskQueue(maxConcurrent: number) {
  const pending: QueueTask[] = [];
  let activeCount = 0;

  function runNext() {
    if (activeCount >= maxConcurrent) {
      return;
    }

    const task = pending.shift();

    if (!task) {
      return;
    }

    activeCount += 1;

    Promise.resolve(task())
      .catch(() => undefined)
      .finally(() => {
        activeCount -= 1;
        runNext();
      });
  }

  return {
    enqueue(task: QueueTask) {
      pending.push(task);
      runNext();
    },
    getActiveCount() {
      return activeCount;
    },
    getPendingCount() {
      return pending.length;
    }
  };
}

export const thumbnailRenderQueue = createTaskQueue(2);
