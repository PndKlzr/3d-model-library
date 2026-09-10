import { Folder } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  modelThumbnailService,
  type ModelThumbnailRequest
} from "../lib/modelThumbnailService";
import type { ModelFile } from "../shared/types";

type FolderCardThumbnailProps = {
  models: ModelFile[];
};

export function FolderCardThumbnail({ models }: FolderCardThumbnailProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [thumbnailUrls, setThumbnailUrls] = useState<string[]>([]);

  useEffect(() => {
    const element = rootRef.current;
    const outstandingRequests = new Set<ModelThumbnailRequest>();
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
        const requests = models.slice(0, 4).map(loadFolderMosaicThumbnail);
        for (const request of requests) {
          outstandingRequests.add(request);
          void request.promise.then(
            () => releaseRequest(request),
            () => releaseRequest(request)
          );
        }

        void Promise.all(requests.map((request) => request.promise)).then((imageUrls) => {
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
      for (const request of outstandingRequests) request.release();
      outstandingRequests.clear();
    };

    function releaseRequest(request: ModelThumbnailRequest) {
      if (!outstandingRequests.delete(request)) return;
      request.release();
    }
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

export function loadFolderMosaicThumbnail(model: ModelFile): ModelThumbnailRequest {
  return modelThumbnailService.request(model, "mosaic");
}
