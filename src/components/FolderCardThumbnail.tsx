import { Folder } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { modelThumbnailService } from "../lib/modelThumbnailService";
import type { ModelFile } from "../shared/types";

type FolderCardThumbnailProps = {
  models: ModelFile[];
};

export function FolderCardThumbnail({ models }: FolderCardThumbnailProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<string[]>([]);

  useEffect(() => {
    const element = rootRef.current;
    let isMounted = true;

    setThumbnailUrls([]);

    if (!element || models.length === 0) {
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
        void Promise.all(models.slice(0, 4).map(loadFolderMosaicThumbnail)).then((imageUrls) => {
          if (isMounted) {
            setThumbnailUrls(imageUrls.filter((imageUrl): imageUrl is string => Boolean(imageUrl)));
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
  }, [models]);

  return (
    <div className="folder-card-icon" ref={rootRef}>
      {thumbnailUrls.length > 0 ? (
        <div className="folder-thumbnail-mosaic" data-count={thumbnailUrls.length}>
          {thumbnailUrls.map((thumbnailUrl, index) => (
            <img
              key={`${thumbnailUrl}-${index}`}
              src={thumbnailUrl}
              alt=""
              draggable={false}
            />
          ))}
        </div>
      ) : (
        <Folder size={34} />
      )}
      <span className="folder-kind-strip" aria-hidden="true">
        <Folder size={14} fill="currentColor" />
        PASTA
      </span>
    </div>
  );
}

export function loadFolderMosaicThumbnail(model: ModelFile): Promise<string | null> {
  const request = modelThumbnailService.request(model, "mosaic");
  return request.promise.finally(request.release);
}
