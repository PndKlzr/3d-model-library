import { describe, expect, it, vi } from "vitest";
import {
  createTrustedIpc,
  denyUnusedPermissions,
  isTrustedIpcSender
} from "../../electron/services/ipcSecurity";

type Listener = (event: { senderFrame: { url: string } | null }, ...args: unknown[]) => unknown;

function createFakeIpcMain() {
  const invokeHandlers = new Map<string, Listener>();
  const eventHandlers = new Map<string, Listener>();
  return {
    target: {
      handle(channel: string, listener: Listener) {
        invokeHandlers.set(channel, listener);
      },
      on(channel: string, listener: Listener) {
        eventHandlers.set(channel, listener);
      }
    },
    async invoke(channel: string, url: string | null, ...args: unknown[]) {
      return await invokeHandlers.get(channel)?.({ senderFrame: url ? { url } : null }, ...args);
    },
    send(channel: string, url: string | null, ...args: unknown[]) {
      return eventHandlers.get(channel)?.({ senderFrame: url ? { url } : null }, ...args);
    }
  };
}

describe("IPC security", () => {
  it("trusts only the configured renderer document or development origin", () => {
    expect(isTrustedIpcSender(
      { url: "file:///C:/app/dist-renderer/index.html#settings" },
      "file:///C:/app/dist-renderer/index.html"
    )).toBe(true);
    expect(isTrustedIpcSender(
      { url: "http://127.0.0.1:5173/models?view=grid" },
      "http://127.0.0.1:5173/"
    )).toBe(true);
    expect(isTrustedIpcSender(
      { url: "file:///C:/app/dist-renderer/other.html" },
      "file:///C:/app/dist-renderer/index.html"
    )).toBe(false);
    expect(isTrustedIpcSender(null, "file:///C:/app/dist-renderer/index.html")).toBe(false);
  });

  it("rejects invokes and ignores events from untrusted renderers", async () => {
    const fake = createFakeIpcMain();
    const invokeListener = vi.fn(async (_event, value: unknown) => value);
    const eventListener = vi.fn();
    const trusted = createTrustedIpc(fake.target, () => "file:///C:/app/index.html");
    trusted.handle("settings:get", invokeListener);
    trusted.on("model:drag", eventListener);

    await expect(fake.invoke("settings:get", "https://example.com", "secret"))
      .rejects.toThrow(/untrusted renderer/i);
    fake.send("model:drag", "https://example.com", "secret");

    expect(invokeListener).not.toHaveBeenCalled();
    expect(eventListener).not.toHaveBeenCalled();
  });

  it("passes trusted invokes and events through unchanged", async () => {
    const fake = createFakeIpcMain();
    const invokeListener = vi.fn(async (_event, value: unknown) => value);
    const eventListener = vi.fn();
    const trusted = createTrustedIpc(fake.target, () => "http://127.0.0.1:5173/");
    trusted.handle("settings:get", invokeListener);
    trusted.on("model:drag", eventListener);

    await expect(fake.invoke("settings:get", "http://127.0.0.1:5173/app", "ok"))
      .resolves.toBe("ok");
    fake.send("model:drag", "http://127.0.0.1:5173/app", "ok");

    expect(invokeListener).toHaveBeenCalledOnce();
    expect(eventListener).toHaveBeenCalledOnce();
  });

  it("denies permission checks and requests", () => {
    let requestHandler: ((permission: string, callback: (allowed: boolean) => void) => void) | null = null;
    let checkHandler: ((permission: string) => boolean) | null = null;
    const target = {
      setPermissionRequestHandler(handler: (_contents: unknown, permission: string,
        callback: (allowed: boolean) => void) => void) {
        requestHandler = (_permission, callback) => handler({}, _permission, callback);
      },
      setPermissionCheckHandler(handler: (_contents: unknown, permission: string) => boolean) {
        checkHandler = (_permission) => handler({}, _permission);
      }
    };
    const callback = vi.fn();

    denyUnusedPermissions(target);
    requestHandler?.("notifications", callback);

    expect(callback).toHaveBeenCalledWith(false);
    expect(checkHandler?.("geolocation")).toBe(false);
  });
});
