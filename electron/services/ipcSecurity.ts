type SenderFrame = { url: string } | null;
type IpcEvent = { senderFrame: SenderFrame; sender?: any };
type IpcListener = (event: IpcEvent, ...args: any[]) => unknown;

type IpcRegistrar = {
  handle(channel: string, listener: IpcListener): void;
  on(channel: string, listener: IpcListener): void;
};

type PermissionSession = {
  setPermissionRequestHandler(
    handler: (contents: unknown, permission: string, callback: (allowed: boolean) => void) => void
  ): void;
  setPermissionCheckHandler(
    handler: (contents: unknown, permission: string) => boolean
  ): void;
};

export function isTrustedIpcSender(
  senderFrame: SenderFrame,
  allowedRendererUrl: string
): boolean {
  if (!senderFrame) return false;

  try {
    const candidate = new URL(senderFrame.url);
    const allowed = new URL(allowedRendererUrl);
    if (
      candidate.protocol !== allowed.protocol ||
      candidate.hostname !== allowed.hostname ||
      candidate.port !== allowed.port ||
      candidate.username !== allowed.username ||
      candidate.password !== allowed.password
    ) {
      return false;
    }

    return allowed.protocol !== "file:" || candidate.pathname === allowed.pathname;
  } catch {
    return false;
  }
}

export function createTrustedIpc(target: IpcRegistrar, getAllowedRendererUrl: () => string) {
  return {
    handle(channel: string, listener: IpcListener) {
      target.handle(channel, (event, ...args) => {
        if (!isTrustedIpcSender(event.senderFrame, getAllowedRendererUrl())) {
          throw new Error("Untrusted renderer IPC request");
        }
        return listener(event, ...args);
      });
    },
    on(channel: string, listener: IpcListener) {
      target.on(channel, (event, ...args) => {
        if (!isTrustedIpcSender(event.senderFrame, getAllowedRendererUrl())) return;
        listener(event, ...args);
      });
    }
  };
}

export function denyUnusedPermissions(targetSession: PermissionSession): void {
  targetSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  targetSession.setPermissionCheckHandler(() => false);
}
