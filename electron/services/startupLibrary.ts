export type StartupLibraryActivator<T> = {
  activate(rootPath: string | null, monitoring: boolean): Promise<T | null>;
};

export async function activateStartupLibrary<T>(
  librarySession: StartupLibraryActivator<T>,
  rootPath: string | null,
  monitoring: boolean,
  onUnavailable: (error: unknown) => void = () => undefined
): Promise<T | null> {
  try {
    return await librarySession.activate(rootPath, monitoring);
  } catch (error) {
    onUnavailable(error);
    return null;
  }
}
