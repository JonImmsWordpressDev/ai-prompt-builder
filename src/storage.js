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

export function apbStarterProfiles() {
  return [
    apbMakeProfile({
      id: apbGenerateId(),
      name: 'Example: web app codebase',
      role: 'senior engineer working in an existing codebase',
      blocks: [
        { label: 'Stack', value: 'Describe the language, framework and versions.' },
        { label: 'Repo', value: 'Where the code lives and how it is laid out.' },
        { label: 'Testing', value: 'The command to run tests, and to run one test.' },
        { label: 'Conventions', value: 'Branching, review and commit rules.' },
        { label: 'Do not touch', value: 'Paths that are off limits.' },
        { label: 'Done when', value: 'What has to be true before this is finished.' },
      ],
      defaultOutputFormat: 'Plan first, wait for my approval, then implement.',
      updatedAt: apbNowIso(),
    }),
    apbMakeProfile({
      id: apbGenerateId(),
      name: 'Example: writing project',
      role: 'editor who matches an established voice',
      blocks: [
        { label: 'Audience', value: 'Who reads this and what they already know.' },
        { label: 'Voice', value: 'The rules the writing has to follow.' },
        { label: 'Never do', value: 'Words, formats and habits to avoid.' },
        { label: 'Done when', value: 'What a finished piece looks like.' },
      ],
      defaultOutputFormat: 'Draft in full, then list what you were unsure about.',
      updatedAt: apbNowIso(),
    }),
  ];
}
