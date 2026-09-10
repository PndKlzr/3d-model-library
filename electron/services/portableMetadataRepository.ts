import { execFile } from "node:child_process";
import {
  copyFile,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import {
  decodePortableMetadata,
  MAX_PORTABLE_METADATA_BYTES,
  PORTABLE_METADATA_DIRECTORY,
  PORTABLE_METADATA_FILENAME,
  type PortableLibraryManifestV1
} from "./portableMetadataCodec.js";

const execFileAsync = promisify(execFile);

export type PortableMetadataLoadResult = {
  manifest: PortableLibraryManifestV1 | null;
  source: "primary" | "backup" | "empty";
  warning: string | null;
  corruptPrimaryPath: string | null;
};

export type PortableMetadataRepository = {
  canonicalizeRoot: (rootPath: string) => Promise<string>;
  checkWritable: (rootPath: string) => Promise<boolean>;
  load: (rootPath: string) => Promise<PortableMetadataLoadResult>;
  save: (
    rootPath: string,
    manifest: PortableLibraryManifestV1,
    options?: { corruptPrimaryPath?: string | null }
  ) => Promise<void>;
};

type PortableMetadataRepositoryOptions = {
  hideDirectory?: (directoryPath: string) => Promise<void>;
  maximumBytes?: number;
  replaceFile?: (sourcePath: string, destinationPath: string) => Promise<void>;
};

type ReadManifestResult =
  | { state: "missing" }
  | { state: "valid"; manifest: PortableLibraryManifestV1 }
  | { state: "invalid"; error: Error };

export function createPortableMetadataRepository({
  hideDirectory = hideDirectoryOnWindows,
  maximumBytes = MAX_PORTABLE_METADATA_BYTES,
  replaceFile = rename
}: PortableMetadataRepositoryOptions = {}): PortableMetadataRepository {
  async function canonicalizeRoot(rootPath: string) {
    const canonicalRoot = await realpath(rootPath);
    const rootStat = await stat(canonicalRoot);

    if (!rootStat.isDirectory()) {
      throw new Error("A pasta da biblioteca não está disponível.");
    }

    return canonicalRoot;
  }

  function getPaths(canonicalRoot: string) {
    const metadataDirectory = path.resolve(canonicalRoot, PORTABLE_METADATA_DIRECTORY);

    if (path.dirname(metadataDirectory).toLowerCase() !== canonicalRoot.toLowerCase()) {
      throw new Error("Caminho interno de metadados inválido.");
    }

    return {
      metadataDirectory,
      primaryPath: path.join(metadataDirectory, PORTABLE_METADATA_FILENAME),
      backupPath: path.join(metadataDirectory, `${PORTABLE_METADATA_FILENAME}.bak`)
    };
  }

  async function readManifestFile(
    canonicalRoot: string,
    filePath: string
  ): Promise<ReadManifestResult> {
    try {
      const fileStat = await stat(filePath);

      if (!fileStat.isFile()) {
        return { state: "invalid", error: new Error("O arquivo de dados não é um arquivo comum.") };
      }

      if (fileStat.size > maximumBytes) {
        return { state: "invalid", error: new Error("O arquivo de dados é grande demais para abrir.") };
      }

      const parsed: unknown = JSON.parse(await readFile(filePath, "utf8"));
      decodePortableMetadata(canonicalRoot, parsed);
      return { state: "valid", manifest: parsed as PortableLibraryManifestV1 };
    } catch (error) {
      if (isMissingError(error)) {
        return { state: "missing" };
      }

      return {
        state: "invalid",
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }

  async function checkWritable(rootPath: string) {
    let probePath: string | null = null;
    let handle: Awaited<ReturnType<typeof open>> | null = null;

    try {
      const canonicalRoot = await canonicalizeRoot(rootPath);
      const { metadataDirectory } = getPaths(canonicalRoot);
      let probeDirectory = canonicalRoot;

      try {
        if ((await stat(metadataDirectory)).isDirectory()) {
          probeDirectory = metadataDirectory;
        }
      } catch (error) {
        if (!isMissingError(error)) {
          return false;
        }
      }

      probePath = path.join(probeDirectory, `.write-probe-${randomUUID()}.tmp`);
      handle = await open(probePath, "wx");
      await handle.sync();
      return true;
    } catch {
      return false;
    } finally {
      await handle?.close().catch(() => undefined);
      if (probePath) {
        await rm(probePath, { force: true }).catch(() => undefined);
      }
    }
  }

  async function load(rootPath: string): Promise<PortableMetadataLoadResult> {
    const canonicalRoot = await canonicalizeRoot(rootPath);
    const { primaryPath, backupPath } = getPaths(canonicalRoot);
    const primary = await readManifestFile(canonicalRoot, primaryPath);

    if (primary.state === "valid") {
      return {
        manifest: primary.manifest,
        source: "primary",
        warning: null,
        corruptPrimaryPath: null
      };
    }

    const backup = await readManifestFile(canonicalRoot, backupPath);

    if (backup.state === "valid") {
      return {
        manifest: backup.manifest,
        source: "backup",
        warning: "Os dados foram recuperados pelo backup. Salve uma alteração para reparar o arquivo principal.",
        corruptPrimaryPath: primary.state === "invalid" ? primaryPath : null
      };
    }

    if (primary.state === "missing" && backup.state === "missing") {
      return {
        manifest: null,
        source: "empty",
        warning: null,
        corruptPrimaryPath: null
      };
    }

    throw primary.state === "invalid"
      ? primary.error
      : backup.state === "invalid"
        ? backup.error
        : new Error("Os dados portáteis da biblioteca não puderam ser lidos.");
  }

  async function save(
    rootPath: string,
    manifest: PortableLibraryManifestV1,
    options: { corruptPrimaryPath?: string | null } = {}
  ) {
    const canonicalRoot = await canonicalizeRoot(rootPath);
    decodePortableMetadata(canonicalRoot, manifest);
    const { metadataDirectory, primaryPath, backupPath } = getPaths(canonicalRoot);
    await mkdir(metadataDirectory, { recursive: true });

    try {
      await hideDirectory(metadataDirectory);
    } catch (error) {
      console.warn("[portable-metadata] não foi possível ocultar a pasta interna", error);
    }

    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

    if (Buffer.byteLength(serialized, "utf8") > maximumBytes) {
      throw new Error("O arquivo de dados é grande demais para salvar.");
    }

    const temporaryPath = path.join(
      metadataDirectory,
      `${PORTABLE_METADATA_FILENAME}.${randomUUID()}.tmp`
    );
    let temporaryHandle: Awaited<ReturnType<typeof open>> | null = null;

    try {
      temporaryHandle = await open(temporaryPath, "wx");
      await temporaryHandle.writeFile(serialized, "utf8");
      await temporaryHandle.sync();
      await temporaryHandle.close();
      temporaryHandle = null;

      if (options.corruptPrimaryPath) {
        if (path.resolve(options.corruptPrimaryPath).toLowerCase() !== primaryPath.toLowerCase()) {
          throw new Error("Caminho de recuperação de metadados inválido.");
        }

        const corruptEvidencePath = path.join(
          metadataDirectory,
          `${PORTABLE_METADATA_FILENAME}.${new Date().toISOString().replaceAll(":", "-")}.corrupt`
        );
        await rename(primaryPath, corruptEvidencePath).catch((error) => {
          if (!isMissingError(error)) {
            throw error;
          }
        });
      } else {
        const currentPrimary = await readManifestFile(canonicalRoot, primaryPath);
        if (currentPrimary.state === "valid") {
          await copyFile(primaryPath, backupPath);
        }
      }

      await replaceFile(temporaryPath, primaryPath);
    } finally {
      await temporaryHandle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  return { canonicalizeRoot, checkWritable, load, save };
}

async function hideDirectoryOnWindows(directoryPath: string): Promise<void> {
  if (process.platform === "win32") {
    await execFileAsync("attrib", ["+H", directoryPath], { windowsHide: true });
  }
}

function isMissingError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
