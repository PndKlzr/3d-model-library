export function yieldBeforeThumbnailRender(
  scheduleFrame: typeof requestAnimationFrame = requestAnimationFrame
): Promise<void> {
  return new Promise((resolve) => scheduleFrame(() => resolve()));
}
