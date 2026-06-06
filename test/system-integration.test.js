import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeSystemPreferences } from '../src/core/system-preferences.js';

test('mergeSystemPreferences keeps persisted local toggles but reflects login item state from the OS', () => {
  const merged = mergeSystemPreferences(
    {
      isActive: true,
      pureMenuBarMode: true,
      autoLaunchEnabled: false,
      showMiniPanelOnTrayClick: true
    },
    {
      autoLaunchEnabled: true
    }
  );

  assert.equal(merged.pureMenuBarMode, true);
  assert.equal(merged.showMiniPanelOnTrayClick, true);
  assert.equal(merged.autoLaunchEnabled, true);
});
