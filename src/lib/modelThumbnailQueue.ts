import { renderThumbnail } from "./thumbnailRenderer";
import {
  createThumbnailScheduler,
  type ThumbnailPriority,
  type ThumbnailRequest
} from "./thumbnailScheduler";
import type { ModelFile } from "../shared/types";
import { THUMBNAIL_RENDER_VERSION } from "../shared/thumbnailVersion";

export type RenderedModelThumbnailRequest = Omit<ThumbnailRequest<string | null>, "promise"> & {
  promise: Promise<string | null>;
};

const thumbnailScheduler = createThumbnailScheduler({
  concurrency: 1,
  shouldCacheResult: (thumbnail) => thumbnail !== null
});

export function requestRenderedModelThumbnail(
  model: ModelFile,
  priority: ThumbnailPriority = "nearby"
): RenderedModelThumbnailRequest {
  const cacheKey = `${THUMBNAIL_RENDER_VERSION}:${model.absolutePath}:${model.modifiedAt}:${model.sizeBytes}`;

  const request = thumbnailScheduler.enqueue(cacheKey, priority, async () => {
    try {
      await waitForIdle();
      const modelBytes = await window.modelLibrary.readModelFile(model.absolutePath);
      await waitForIdle();
      return renderThumbnail(model.extension, modelBytes);
    } catch {
      return null;
    }
  });
  return {
    ...request,
    promise: request.promise.then((thumbnail) => thumbnail ?? null)
  };
}

function waitForIdle(): Promise<void> {
  return new Promise((resolve) => {
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => resolve(), { timeout: 600 });
      return;
    }
    window.setTimeout(resolve, 32);
  });
}
