export type MouseNavigationIntent = "back" | "forward";

export function getMouseNavigationIntent(button: number): MouseNavigationIntent | null {
  if (button === 3) {
    return "back";
  }

  if (button === 4) {
    return "forward";
  }

  return null;
}
