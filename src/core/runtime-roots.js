export function resolveRuntimeRoots({
  runtimeConfig = {},
  fallbackRoot = process.cwd()
} = {}) {
  const workspaceRoot = runtimeConfig.workspaceRoot ?? fallbackRoot;

  return {
    workspaceRoot,
    storageRoot: workspaceRoot
  };
}
