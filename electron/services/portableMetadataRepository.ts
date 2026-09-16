import { execFile } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
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
  type PortableLibraryManifest
} from "./portableMetadataCodec.js";

const execFileAsync = promisify(execFile);

export type PortableMetadataLoadResult = {
  manifest: PortableLibraryManifest | null;
  source: "primary" | "backup" | "empty";
  warning: string | null;
  corruptPrimaryPath: string | null;
};

export type PortableBackupPreview = {
  libraryId: string;
  updatedAt: string;
  modelCount: number;
  tagCount: number;
  historyCount: number;
};

export type PortableMetadataRestoreResult = {
  manifest: PortableLibraryManifest;
  snapshotPath: string;
};

export type PortableMetadataRepository = {
  canonicalizeRoot: (rootPath: string) => Promise<string>;
  checkWritable: (rootPath: string) => Promise<boolean>;
  load: (rootPath: string) => Promise<PortableMetadataLoadResult>;
  save: (
    rootPath: string,
    manifest: PortableLibraryManifest,
    options?: { corruptPrimaryPath?: string | null }
  ) => Promise<void>;
  readExternalBackup: (
    rootPath: string,
    filePath: string
  ) => Promise<{ manifest: PortableLibraryManifest; preview: PortableBackupPreview }>;
  exportBackup: (
    rootPath: string,
    manifest: PortableLibraryManifest,
    destinationPath: string
  ) => Promise<void>;
  restoreBackup: (
    rootPath: string,
    currentManifest: PortableLibraryManifest,
    replacementManifest: PortableLibraryManifest
  ) => Promise<PortableMetadataRestoreResult>;
  getDataDirectory: (rootPath: string) => Promise<string>;
};

type PortableMetadataRepositoryOptions = {
  hideDirectory?: (directoryPath: string) => Promise<void>;
  maximumBytes?: number;
  replaceFile?: (sourcePath: string, destinationPath: string) => Promise<void>;
  now?: () => Date;
  recoveryLimit?: number;
};

type ReadManifestResult =
  | { state: "missing" }
  | { state: "valid"; manifest: PortableLibraryManifest }
  | { state: "invalid"; error: Error };

export function createPortableMetadataRepository({
  hideDirectory = hideDirectoryOnWindows,
  maximumBytes = MAX_PORTABLE_METADATA_BYTES,
  replaceFile = rename,
  now = () => new Date(),
  recoveryLimit = 5
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
      return { state: "valid", manifest: parsed as PortableLibraryManifest };
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

  async function getDataDirectory(rootPath: string) {
    const canonicalRoot = await canonicalizeRoot(rootPath);
    const { metadataDirectory } = getPaths(canonicalRoot);
    await mkdir(metadataDirectory, { recursive: true });
    await hideDirectory(metadataDirectory).catch((error) => {
      console.warn("[portable-metadata] não foi possível ocultar a pasta interna", error);
    });
    return metadataDirectory;
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
    manifest: PortableLibraryManifest,
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

  async function readExternalBackup(rootPath: string, filePath: string) {
    const canonicalRoot = await canonicalizeRoot(rootPath);
    assertExternalJsonPath(filePath);
    const sourceInfo = await lstat(filePath);
    if (sourceInfo.isSymbolicLink() || !sourceInfo.isFile()) {
      throw new Error("O backup precisa ser um arquivo comum, não um link.");
    }
    if (sourceInfo.size > maximumBytes) {
      throw new Error("O arquivo de backup é grande demais para abrir.");
    }

    const parsed: unknown = JSON.parse(await readFile(await realpath(filePath), "utf8"));
    const decoded = decodePortableMetadata(canonicalRoot, parsed);
    const manifest = parsed as PortableLibraryManifest;
    return {
      manifest,
      preview: {
        libraryId: decoded.libraryId,
        updatedAt: decoded.updatedAt,
        modelCount: Object.keys(decoded.metadata.models).length,
        tagCount: decoded.metadata.tagCatalog.length,
        historyCount: decoded.metadata.slicerHistory.length
      }
    };
  }

  async function exportBackup(
    rootPath: string,
    manifest: PortableLibraryManifest,
    destinationPath: string
  ) {
    const canonicalRoot = await canonicalizeRoot(rootPath);
    decodePortableMetadata(canonicalRoot, manifest);
    assertExternalJsonPath(destinationPath);
    const canonicalParent = await realpath(path.dirname(destinationPath));
    const destination = path.join(canonicalParent, path.basename(destinationPath));

    try {
      const destinationInfo = await lstat(destination);
      if (destinationInfo.isSymbolicLink() || !destinationInfo.isFile()) {
        throw new Error("O destino do backup precisa ser um arquivo comum.");
      }
    } catch (error) {
      if (!isMissingError(error)) throw error;
    }

    await writeManifestAtomically(destination, manifest);
  }

  async function restoreBackup(
    rootPath: string,
    currentManifest: PortableLibraryManifest,
    replacementManifest: PortableLibraryManifest
  ) {
    const canonicalRoot = await canonicalizeRoot(rootPath);
    decodePortableMetadata(canonicalRoot, currentManifest);
    decodePortableMetadata(canonicalRoot, replacementManifest);
    const metadataDirectory = await getDataDirectory(canonicalRoot);
    const snapshotPath = path.join(
      metadataDirectory,
      `3D_LIBRARY_DATA_RECOVERY_${now().toISOString().replaceAll(":", "-")}.json`
    );
    await writeManifestAtomically(snapshotPath, currentManifest);
    await save(canonicalRoot, replacementManifest);
    await pruneRecoverySnapshots(metadataDirectory);
    return { manifest: replacementManifest, snapshotPath };
  }

  async function writeManifestAtomically(
    destinationPath: string,
    manifest: PortableLibraryManifest
  ) {
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
    if (Buffer.byteLength(serialized, "utf8") > maximumBytes) {
      throw new Error("O arquivo de dados é grande demais para salvar.");
    }

    const temporaryPath = path.join(
      path.dirname(destinationPath),
      `.${path.basename(destinationPath)}.${randomUUID()}.tmp`
    );
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(temporaryPath, "wx");
      await handle.writeFile(serialized, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await replaceFile(temporaryPath, destinationPath);
    } finally {
      await handle?.close().catch(() => undefined);
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  async function pruneRecoverySnapshots(metadataDirectory: string) {
    const recoveryPattern = /^3D_LIBRARY_DATA_RECOVERY_\d{4}-\d{2}-\d{2}T.*Z\.json$/;
    const recoveryNames = (await readdir(metadataDirectory))
      .filter((name) => recoveryPattern.test(name))
      .sort()
      .reverse();
    await Promise.all(recoveryNames.slice(recoveryLimit).map((name) =>
      rm(path.join(metadataDirectory, name), { force: true })
    ));
  }

  return {
    canonicalizeRoot,
    checkWritable,
    load,
    save,
    readExternalBackup,
    exportBackup,
    restoreBackup,
    getDataDirectory
  };
}

function assertExternalJsonPath(filePath: string) {
  if (
    typeof filePath !== "string" ||
    !path.isAbsolute(filePath) ||
    filePath.includes("\0") ||
    path.extname(filePath).toLowerCase() !== ".json"
  ) {
    throw new Error("O caminho do backup precisa ser um arquivo JSON absoluto.");
  }
}

export async function hideDirectoryOnWindows(directoryPath: string): Promise<void> {
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
