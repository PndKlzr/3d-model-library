import { Box, FileArchive } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  requestRenderedModelThumbnail,
  type RenderedModelThumbnailRequest
} from "../lib/modelThumbnailQueue";
import type { ThumbnailPriority } from "../lib/thumbnailScheduler";
import type { ModelFile } from "../shared/types";

type ModelCardThumbnailProps = {
  model: ModelFile;
};

export function ModelCardThumbnail({ model }: ModelCardThumbnailProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const isArchive = [".zip", ".rar", ".7z"].includes(model.extension);

  useEffect(() => {
    const element = rootRef.current;
    let isMounted = true;

    setThumbnailUrl(null);
    if (!element) return;

    let request = requestModelThumbnail(model, "nearby");
    void request.promise
      .then((imageUrl) => {
        if (isMounted && imageUrl) setThumbnailUrl(imageUrl);
      })
      .catch(() => undefined);

    const visibleObserver = new IntersectionObserver(([entry]) => {
      request.setPriority(entry.isIntersecting ? "visible" : "nearby");
    });

    visibleObserver.observe(element);

    return () => {
      isMounted = false;
      visibleObserver.disconnect();
      request.release();
    };
  }, [model]);

  return (
    <div className={`thumb-fallback${isArchive ? " archive-thumb-fallback" : ""}`} ref={rootRef}>
      {thumbnailUrl ? (
        <img className="thumbnail-image" src={thumbnailUrl} alt="" draggable={false} />
      ) : (
        <>
          {isArchive ? <FileArchive size={34} strokeWidth={1.7} /> : <Box size={30} />}
          <span className={isArchive ? "archive-extension" : undefined}>
            {model.extension.toUpperCase()}
          </span>
        </>
      )}
    </div>
  );
}

export async function loadModelThumbnail(model: ModelFile): Promise<string | null> {
  const request = requestModelThumbnail(model, "historical");
  return request.promise.finally(request.release);
}

function requestModelThumbnail(
  model: ModelFile,
  initialPriority: ThumbnailPriority
): RenderedModelThumbnailRequest {
  let priority = initialPriority;
  let released = false;
  let renderRequest: RenderedModelThumbnailRequest | null = null;

  const promise = resolveModelThumbnail(model, () => {
    renderRequest = requestRenderedModelThumbnail(model, released ? "historical" : priority);
    if (released) renderRequest.release();
    return renderRequest;
  });

  return {
    promise,
    setPriority(nextPriority) {
      priority = nextPriority;
      renderRequest?.setPriority(nextPriority);
    },
    release() {
      released = true;
      renderRequest?.release();
    }
  };
}

async function resolveModelThumbnail(
  model: ModelFile,
  createRenderRequest: () => RenderedModelThumbnailRequest
) {
  if ([".zip", ".rar", ".7z"].includes(model.extension)) return null;

  const cachedThumbnail = await window.modelLibrary.readCachedThumbnail(model);
  if (cachedThumbnail) return cachedThumbnail;

  let thumbnail: string | null = null;
  if (model.extension === ".3mf") {
    thumbnail = await window.modelLibrary.readModelThumbnail(model.absolutePath);
  }

  thumbnail ??= await createRenderRequest().promise;
  if (thumbnail) void window.modelLibrary.writeCachedThumbnail(model, thumbnail).catch(() => undefined);
  return thumbnail;
}
