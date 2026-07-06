import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type SpawnProcess = typeof spawn;

const HELPER_FILE_NAME = "NativeFileDragHelper.exe";
const HELPER_HASH_FILE_NAME = "NativeFileDragHelper.sha256";
const HELPER_SOURCE = String.raw`
using System;
using System.IO;
using System.Linq;
using System.Drawing;
using System.Windows.Forms;

public static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        string[] files = args.Where(File.Exists).ToArray();

        if (files.Length == 0)
        {
            return 2;
        }

        Application.EnableVisualStyles();

        using (Form form = new Form())
        {
            form.ShowInTaskbar = false;
            form.FormBorderStyle = FormBorderStyle.None;
            form.StartPosition = FormStartPosition.Manual;
            form.Size = new Size(1, 1);
            form.Location = Cursor.Position;
            form.Opacity = 0.01;
            form.TopMost = true;
            form.AllowDrop = false;

            form.Show();
            form.Activate();

            DataObject data = new DataObject(DataFormats.FileDrop, files);
            DragDropEffects effect = form.DoDragDrop(data, DragDropEffects.Copy);

            return effect == DragDropEffects.None ? 1 : 0;
        }
    }
}
`;

export async function prepareNativeFileDragHelper(userDataPath: string): Promise<string | null> {
  if (process.platform !== "win32") {
    return null;
  }

  const helperDirectory = path.join(userDataPath, "native-file-drag");
  const helperPath = path.join(helperDirectory, HELPER_FILE_NAME);
  const hashPath = path.join(helperDirectory, HELPER_HASH_FILE_NAME);
  const sourcePath = path.join(helperDirectory, "NativeFileDragHelper.cs");
  const sourceHash = createHash("sha256").update(HELPER_SOURCE).digest("hex");

  await mkdir(helperDirectory, { recursive: true });

  if ((await fileExists(helperPath)) && (await readHash(hashPath)) === sourceHash) {
    return helperPath;
  }

  await writeFile(sourcePath, HELPER_SOURCE, "utf8");
  await compileHelper(sourcePath, helperPath);
  await writeFile(hashPath, sourceHash, "utf8");

  return helperPath;
}

export function startNativeFileDropDrag(
  helperPath: string | null,
  filePaths: string[],
  spawnProcess: SpawnProcess = spawn
): boolean {
  if (!helperPath || filePaths.length === 0 || process.platform !== "win32") {
    return false;
  }

  const child = spawnProcess(helperPath, filePaths, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });

  child?.unref?.();
  return true;
}

async function compileHelper(sourcePath: string, helperPath: string): Promise<void> {
  const command = [
    "Add-Type",
    `-TypeDefinition (Get-Content -Raw -LiteralPath '${escapePowerShellSingleQuoted(sourcePath)}')`,
    "-ReferencedAssemblies System.Windows.Forms,System.Drawing",
    `-OutputAssembly '${escapePowerShellSingleQuoted(helperPath)}'`,
    "-OutputType WindowsApplication"
  ].join(" ");

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
      {
        stdio: "pipe",
        windowsHide: true
      }
    );
    const stderrChunks: Buffer[] = [];

    child.stderr?.on("data", (chunk) => stderrChunks.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Falha ao compilar helper de arraste nativo: ${Buffer.concat(stderrChunks).toString(
            "utf8"
          )}`
        )
      );
    });
  });
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readHash(filePath: string): Promise<string | null> {
  try {
    return (await readFile(filePath, "utf8")).trim();
  } catch {
    return null;
  }
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replaceAll("'", "''");
}
