export function mergeSystemPreferences(persisted = {}, system = {}) {
  return {
    ...persisted,
    autoLaunchEnabled: system.autoLaunchEnabled ?? persisted.autoLaunchEnabled ?? false
  };
}
