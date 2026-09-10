import { Box, FileArchive } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { modelThumbnailService } from "../lib/modelThumbnailService";
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

    const request = modelThumbnailService.request(model, "nearby");
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
  const request = modelThumbnailService.request(model, "historical");
  return request.promise.finally(request.release);
}
