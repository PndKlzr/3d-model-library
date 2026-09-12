import { flushSync } from "react-dom";

export async function runAfterCommittedUpdate<T>(
  commitUpdate: () => void,
  externalAction: () => Promise<T>
): Promise<T> {
  flushSync(commitUpdate);
  return externalAction();
}
