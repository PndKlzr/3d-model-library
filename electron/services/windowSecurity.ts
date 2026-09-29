type NavigationEvent = {
  preventDefault(): void;
};

type SecuredWebContents = {
  on(
    event: "will-navigate",
    listener: (event: NavigationEvent, url: string) => void
  ): unknown;
  setWindowOpenHandler(handler: () => { action: "deny" }): unknown;
};

function isAllowedRendererUrl(candidateUrl: string, allowedUrl: URL): boolean {
  let candidate: URL;

  try {
    candidate = new URL(candidateUrl);
  } catch {
    return false;
  }

  if (
    candidate.protocol !== allowedUrl.protocol ||
    candidate.hostname !== allowedUrl.hostname ||
    candidate.port !== allowedUrl.port ||
    candidate.username !== allowedUrl.username ||
    candidate.password !== allowedUrl.password
  ) {
    return false;
  }

  return allowedUrl.protocol !== "file:" || candidate.pathname === allowedUrl.pathname;
}

export function configureWindowSecurity(
  contents: SecuredWebContents,
  allowedRendererUrl: string
): void {
  const allowedUrl = new URL(allowedRendererUrl);

  contents.on("will-navigate", (event, candidateUrl) => {
    if (!isAllowedRendererUrl(candidateUrl, allowedUrl)) {
      event.preventDefault();
    }
  });

  contents.setWindowOpenHandler(() => ({ action: "deny" }));
}
