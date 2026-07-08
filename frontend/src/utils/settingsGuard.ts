// Shared, module-level (not React state) so the Tabs layout can check
// whether Settings has unsaved changes at the exact moment a tab is
// pressed, without needing to lift this into a full context. Settings
// screen keeps this updated every render; the Tabs layout reads it
// synchronously inside the tabPress interceptor.
type SettingsGuard = {
  isDirty: boolean;
  save: () => void;
  discard: () => void;
};

export const settingsGuard: SettingsGuard = {
  isDirty: false,
  save: () => {},
  discard: () => {},
};
