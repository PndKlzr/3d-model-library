export type ResponsivePanel = "folders" | "details" | null;

export function toggleResponsivePanel(
  current: ResponsivePanel,
  requested: Exclude<ResponsivePanel, null>
): ResponsivePanel {
  return current === requested ? null : requested;
}
