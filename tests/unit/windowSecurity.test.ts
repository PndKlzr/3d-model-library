import { describe, expect, it } from "vitest";
import { configureWindowSecurity } from "../../electron/services/windowSecurity";

type NavigationEvent = { preventDefault(): void };
type NavigationHandler = (event: NavigationEvent, url: string) => void;
type OpenHandler = (details: { url: string }) => { action: "deny" };

function createFakeWebContents() {
  let navigationHandler: NavigationHandler | null = null;
  let openHandler: OpenHandler | null = null;

  const contents = {
    on(_event: "will-navigate", handler: NavigationHandler) {
      navigationHandler = handler;
    },
    setWindowOpenHandler(handler: OpenHandler) {
      openHandler = handler;
    }
  };

  return {
    contents,
    navigate(url: string) {
      let prevented = false;
      navigationHandler?.({ preventDefault: () => { prevented = true; } }, url);
      return prevented;
    },
    open(url: string) {
      if (!openHandler) throw new Error("Window open handler was not configured");
      return openHandler({ url });
    }
  };
}

describe("window security", () => {
  it("allows navigation within the exact development renderer origin", () => {
    const fake = createFakeWebContents();
    configureWindowSecurity(fake.contents, "http://127.0.0.1:5173/");

    expect(fake.navigate("http://127.0.0.1:5173/models?view=grid#selected")).toBe(false);
  });

  it.each([
    "https://example.com/",
    "file:///C:/Windows/System32/",
    "http://localhost:5173/",
    "http://127.0.0.1.evil.example:5173/",
    "not a valid URL"
  ])("prevents navigation to %s", (candidate) => {
    const fake = createFakeWebContents();
    configureWindowSecurity(fake.contents, "http://127.0.0.1:5173/");

    expect(fake.navigate(candidate)).toBe(true);
  });

  it("allows only the exact production renderer file", () => {
    const fake = createFakeWebContents();
    configureWindowSecurity(fake.contents, "file:///C:/app/dist-renderer/index.html");

    expect(fake.navigate("file:///C:/app/dist-renderer/index.html#settings")).toBe(false);
    expect(fake.navigate("file:///C:/app/dist-renderer/other.html")).toBe(true);
  });

  it("denies every new window request", () => {
    const fake = createFakeWebContents();
    configureWindowSecurity(fake.contents, "http://127.0.0.1:5173/");

    expect(fake.open("https://example.com/")).toEqual({ action: "deny" });
  });
});
