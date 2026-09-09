import { Box } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { requestRenderedModelThumbnail } from "../lib/modelThumbnailQueue";
import type { ModelFile } from "../shared/types";

type ModelCardThumbnailProps = {
  model: ModelFile;
};

export function ModelCardThumbnail({ model }: ModelCardThumbnailProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const didRequestRef = useRef(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);

  useEffect(() => {
    const element = rootRef.current;
    let isMounted = true;

    if (!element || didRequestRef.current) {
      return () => {
        isMounted = false;
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          return;
        }

        observer.disconnect();
        didRequestRef.current = true;
        void loadModelThumbnail(model).then((imageUrl) => {
          if (isMounted && imageUrl) {
            setThumbnailUrl(imageUrl);
          }
        });
      },
      { rootMargin: "240px" }
    );

    observer.observe(element);

    return () => {
      isMounted = false;
      observer.disconnect();
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

const modelThumbnailCache = new Map<string, Promise<string | null>>();

export async function loadModelThumbnail(model: ModelFile): Promise<string | null> {
  const cacheKey = `${model.absolutePath}:${model.modifiedAt}:${model.sizeBytes}`;
  const cached = modelThumbnailCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const thumbnailPromise = resolveModelThumbnail(model);
  modelThumbnailCache.set(cacheKey, thumbnailPromise);
  return thumbnailPromise;
}

async function resolveModelThumbnail(model: ModelFile) {
  if (model.extension === ".zip" || model.extension === ".rar" || model.extension === ".7z") {
    return null;
  }

  const cachedThumbnail = await window.modelLibrary.readCachedThumbnail(model);

  if (cachedThumbnail) {
    return cachedThumbnail;
  }

  let thumbnail: string | null = null;

  if (model.extension === ".3mf") {
    const embeddedThumbnail = await window.modelLibrary.readModelThumbnail(model.absolutePath);

    if (embeddedThumbnail) {
      thumbnail = embeddedThumbnail;
    }
  }

  thumbnail ??= await requestRenderedModelThumbnail(model);

  if (thumbnail) {
    void window.modelLibrary.writeCachedThumbnail(model, thumbnail).catch(() => undefined);
  }

  return thumbnail;
}
