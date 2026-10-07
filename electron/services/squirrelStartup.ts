export function shouldStartNormalApplication(isSquirrelStartup: boolean): boolean {
  return !isSquirrelStartup;
}
