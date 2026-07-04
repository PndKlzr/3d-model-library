import { Box } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { requestRenderedModelThumbnail } from "../lib/modelThumbnailQueue";
import type { ModelFile } from "../shared/types";

type ModelCardThumbnailProps = {
  model: ModelFile;
};

export function ModelCardThumbnail({ model }: ModelCardThumbnailProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [didQueue, setDidQueue] = useState(false);

  useEffect(() => {
    const element = rootRef.current;
    let isMounted = true;

    if (!element || didQueue) {
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
        setDidQueue(true);
        void loadThumbnail(model).then((imageUrl) => {
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
  }, [didQueue, model]);

  return (
    <div className="thumb-fallback" ref={rootRef}>
      {thumbnailUrl ? (
        <img className="thumbnail-image" src={thumbnailUrl} alt="" />
      ) : (
        <>
          <Box size={30} />
          <span>{model.extension.toUpperCase()}</span>
        </>
      )}
    </div>
  );
}

async function loadThumbnail(model: ModelFile) {
  if (model.extension === ".3mf") {
    const embeddedThumbnail = await window.modelLibrary.readModelThumbnail(model.absolutePath);

    if (embeddedThumbnail) {
      return embeddedThumbnail;
    }
  }

  return requestRenderedModelThumbnail(model);
}
