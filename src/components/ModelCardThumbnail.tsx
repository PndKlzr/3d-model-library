import { Box, FileArchive } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  modelThumbnailService,
  type ModelThumbnailRequest,
  type ThumbnailPriority
} from "../lib/modelThumbnailService";
import type { ModelFile } from "../shared/types";

type ModelCardThumbnailProps = {
  model: ModelFile;
  selected: boolean;
};

export function ModelCardThumbnail({ model, selected }: ModelCardThumbnailProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const requestRef = useRef<ModelThumbnailRequest | null>(null);
  const selectedRef = useRef(selected);
  const isIntersectingRef = useRef(false);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const isArchive = [".zip", ".rar", ".7z"].includes(model.extension);
  const modelSignature = `${model.absolutePath}:${model.modifiedAt}:${model.sizeBytes}`;

  selectedRef.current = selected;

  useEffect(() => {
    const element = rootRef.current;
    let isMounted = true;

    setThumbnailUrl(null);
    if (!element) return;

    const initialPriority: ThumbnailPriority = selected ? "selected" : "nearby";
    const request = modelThumbnailService.request(model, initialPriority);
    requestRef.current = request;
    isIntersectingRef.current = false;
    void request.promise
      .then((imageUrl) => {
        if (isMounted && imageUrl) setThumbnailUrl(imageUrl);
      })
      .catch(() => undefined);

    const visibleObserver = new IntersectionObserver(([entry]) => {
      isIntersectingRef.current = entry.isIntersecting;
      request.setPriority(
        selectedRef.current ? "selected" : entry.isIntersecting ? "visible" : "nearby"
      );
    });

    visibleObserver.observe(element);

    return () => {
      isMounted = false;
      visibleObserver.disconnect();
      request.release();
      if (requestRef.current === request) requestRef.current = null;
    };
  }, [modelSignature]);

  useEffect(() => {
    requestRef.current?.setPriority(
      selected ? "selected" : isIntersectingRef.current ? "visible" : "nearby"
    );
  }, [selected]);

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
