import { Box } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { requestRenderedModelThumbnail } from "../lib/modelThumbnailQueue";
import type { ThumbnailPriority, ThumbnailRequest } from "../lib/thumbnailScheduler";
import type { ModelFile } from "../shared/types";

type ModelCardThumbnailProps = {
  model: ModelFile;
};

export function ModelCardThumbnail({ model }: ModelCardThumbnailProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    const element = rootRef.current;
    let isMounted = true;
    let isNearby = false;
    let isVisible = false;
    let request: ThumbnailRequest<string | null> | null = null;

    setThumbnailUrl(null);
    if (!element) return;

    const updatePriority = () => {
      request?.setPriority(isVisible ? "visible" : isNearby ? "nearby" : "background");
    };
    const ensureRequested = () => {
      if (request) return;
      request = requestModelThumbnail(model, isVisible ? "visible" : "nearby");
      void request.promise.then((imageUrl) => {
        if (isMounted && imageUrl) setThumbnailUrl(imageUrl);
      });
    };

    const nearbyObserver = new IntersectionObserver(
      ([entry]) => {
        isNearby = entry.isIntersecting;
        if (isNearby) ensureRequested();
        updatePriority();
      },
      { rootMargin: "240px" }
    );
    const visibleObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
      if (isVisible) ensureRequested();
      updatePriority();
    });

    nearbyObserver.observe(element);
    visibleObserver.observe(element);

    return () => {
      isMounted = false;
      nearbyObserver.disconnect();
      visibleObserver.disconnect();
      request?.release();
    };
  }, [model]);

  return (
    <div className="thumb-fallback" ref={rootRef}>
      {thumbnailUrl ? (
        <img className="thumbnail-image" src={thumbnailUrl} alt="" draggable={false} />
      ) : (
        <>
          <Box size={30} />
          <span>{model.extension.toUpperCase()}</span>
        </>
      )}
    </div>
  );
}

export async function loadModelThumbnail(model: ModelFile): Promise<string | null> {
  const request = requestModelThumbnail(model, "background");
  return request.promise.finally(request.release);
}

function requestModelThumbnail(
  model: ModelFile,
  initialPriority: ThumbnailPriority
): ThumbnailRequest<string | null> {
  let priority = initialPriority;
  let released = false;
  let renderRequest: ThumbnailRequest<string | null> | null = null;

  const promise = resolveModelThumbnail(model, () => {
    renderRequest = requestRenderedModelThumbnail(model, released ? "background" : priority);
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
  createRenderRequest: () => ThumbnailRequest<string | null>
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
