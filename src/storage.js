import { apbMakeProfile } from './profiles.js';

export const APB_KEYS = {
  profiles: 'apb.profiles.v1',
  settings: 'apb.settings.v1',
  draft: 'apb.draft.v1',
};

const apbMemoryStore = new Map();
let apbHasLocalStorage = false;

try {
  const probe = '__apb_probe__';
  window.localStorage.setItem(probe, '1');
  window.localStorage.removeItem(probe);
  apbHasLocalStorage = true;
} catch (err) {
  apbHasLocalStorage = false;
}

export function apbStorageAvailable() {
  return apbHasLocalStorage;
}

export function apbGenerateId() {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `p_${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function apbNowIso() {
  return new Date().toISOString();
}

export function apbLoad(key, fallback) {
  try {
    const raw = apbHasLocalStorage
      ? window.localStorage.getItem(key)
      : (apbMemoryStore.has(key) ? apbMemoryStore.get(key) : null);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[apb] discarding unreadable value at ${key}:`, err.message);
    return fallback;
  }
}

export function apbSave(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (apbHasLocalStorage) window.localStorage.setItem(key, raw);
    else apbMemoryStore.set(key, raw);
    return true;
  } catch (err) {
    console.warn(`[apb] could not save ${key}:`, err.message);
    return false;
  }
}

// Starter profiles ship with empty block values. The labels are the scaffold;
// the user supplies the content. This is load-bearing: non-empty placeholder text
// would be counted as real content by apbNonEmptyBlocks, cause gap rules to
// misfire (e.g., "Testing: ..." matches verification rule, "Done when" matches
// done rule), and get transmitted to Claude as project facts if unedited.
// role and defaultOutputFormat are real values, not placeholders, and stay filled.
export function apbStarterProfiles() {
  return [
    apbMakeProfile({
      id: apbGenerateId(),
      name: 'Example: web app codebase',
      role: 'senior engineer working in an existing codebase',
      blocks: [
        { label: 'Stack', value: '' },
        { label: 'Repo', value: '' },
        { label: 'Testing', value: '' },
        { label: 'Conventions', value: '' },
        { label: 'Do not touch', value: '' },
        { label: 'Done when', value: '' },
      ],
      defaultOutputFormat: 'Plan first, wait for my approval, then implement.',
      updatedAt: apbNowIso(),
    }),
    apbMakeProfile({
      id: apbGenerateId(),
      name: 'Example: writing project',
      role: 'editor who matches an established voice',
      blocks: [
        { label: 'Audience', value: '' },
        { label: 'Voice', value: '' },
        { label: 'Never do', value: '' },
        { label: 'Done when', value: '' },
      ],
      defaultOutputFormat: 'Draft in full, then list what you were unsure about.',
      updatedAt: apbNowIso(),
    }),
  ];
}
