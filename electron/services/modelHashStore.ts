import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { ModelHashInput, ModelHashResult } from "../../src/shared/types.js";

export type ModelHashMetadata = {
  hashes: Record<string, ModelHashCacheEntry>;
};

export type ModelHashCacheEntry = {
  sizeBytes: number;
  modifiedAt: string;
  hash: string;
};

export type ModelHashBackend = {
  get: () => ModelHashMetadata | undefined;
  set: (metadata: ModelHashMetadata) => void;
};

export type ModelHashStore = {
  getHashes: (models: ModelHashInput[]) => Promise<ModelHashResult>;
};

export type HashFileReader = (absolutePath: string) => Promise<string>;

export function createModelHashStore(
  backend?: ModelHashBackend,
  readHash: HashFileReader = hashFile
): ModelHashStore {
  let memoryMetadata = backend ? undefined : createDefaultModelHashMetadata();

  function getMetadata(): ModelHashMetadata {
    return cloneMetadata(backend?.get() ?? memoryMetadata ?? createDefaultModelHashMetadata());
  }

  function saveMetadata(metadata: ModelHashMetadata) {
    const nextMetadata = cloneMetadata(metadata);

    if (backend) {
      backend.set(nextMetadata);
    } else {
      memoryMetadata = nextMetadata;
    }
  }

  return {
    async getHashes(models) {
      const metadata = getMetadata();
      const hashes: ModelHashResult = {};
      let didChange = false;

      for (const model of models) {
        const cachedEntry = metadata.hashes[model.absolutePath];

        if (
          cachedEntry &&
          cachedEntry.sizeBytes === model.sizeBytes &&
          cachedEntry.modifiedAt === model.modifiedAt
        ) {
          hashes[model.absolutePath] = cachedEntry.hash;
          continue;
        }

        const hash = await readHash(model.absolutePath);
        metadata.hashes[model.absolutePath] = {
          sizeBytes: model.sizeBytes,
          modifiedAt: model.modifiedAt,
          hash
        };
        hashes[model.absolutePath] = hash;
        didChange = true;
      }

      if (didChange) {
        saveMetadata(metadata);
      }

      return hashes;
    }
  };
}

export async function createElectronModelHashStore(): Promise<ModelHashStore> {
  const { default: Store } = (await import("electron-store")) as {
    default: new (options: {
      name: string;
      defaults: { metadata: ModelHashMetadata };
    }) => {
      get: (key: "metadata") => ModelHashMetadata;
      set: (key: "metadata", value: ModelHashMetadata) => void;
    };
  };
  const store = new Store({
    name: "model-hashes",
    defaults: {
      metadata: createDefaultModelHashMetadata()
    }
  });

  return createModelHashStore({
    get: () => store.get("metadata"),
    set: (metadata) => store.set("metadata", metadata)
  });
}

function createDefaultModelHashMetadata(): ModelHashMetadata {
  return {
    hashes: {}
  };
}

function cloneMetadata(metadata: unknown): ModelHashMetadata {
  if (!isModelHashMetadata(metadata)) {
    return createDefaultModelHashMetadata();
  }

  return {
    hashes: Object.fromEntries(
      Object.entries(metadata.hashes).map(([absolutePath, entry]) => [
        absolutePath,
        {
          sizeBytes: Number(entry.sizeBytes),
          modifiedAt: entry.modifiedAt,
          hash: entry.hash
        }
      ])
    )
  };
}

function isModelHashMetadata(metadata: unknown): metadata is ModelHashMetadata {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    "hashes" in metadata &&
    typeof (metadata as { hashes?: unknown }).hashes === "object" &&
    (metadata as { hashes?: unknown }).hashes !== null
  );
}

function hashFile(absolutePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(absolutePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
