export const APB_SCHEMA_VERSION = 1;

export function apbMakeProfile(fields) {
  const f = fields || {};
  return {
    schemaVersion: APB_SCHEMA_VERSION,
    id: typeof f.id === 'string' ? f.id : '',
    name: typeof f.name === 'string' ? f.name : '',
    role: typeof f.role === 'string' ? f.role : '',
    blocks: Array.isArray(f.blocks) ? f.blocks.map((b) => ({
      label: (b && typeof b.label === 'string') ? b.label : '',
      value: (b && typeof b.value === 'string') ? b.value : '',
    })) : [],
    defaultOutputFormat: typeof f.defaultOutputFormat === 'string' ? f.defaultOutputFormat : '',
    updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : '',
  };
}

export function apbValidateProfile(value) {
  const errors = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['profile must be an object'] };
  }
  if (typeof value.id !== 'string' || !value.id.trim()) errors.push('id is required');
  if (typeof value.name !== 'string' || !value.name.trim()) errors.push('name is required');
  if (value.role !== undefined && typeof value.role !== 'string') errors.push('role must be a string');
  if (value.defaultOutputFormat !== undefined && typeof value.defaultOutputFormat !== 'string') {
    errors.push('defaultOutputFormat must be a string');
  }
  if (!Array.isArray(value.blocks)) {
    errors.push('blocks must be an array');
  } else {
    value.blocks.forEach((b, i) => {
      if (b === null || typeof b !== 'object' || Array.isArray(b)) {
        errors.push(`blocks[${i}] must be an object`);
        return;
      }
      if (typeof b.label !== 'string') errors.push(`blocks[${i}].label must be a string`);
      if (typeof b.value !== 'string') errors.push(`blocks[${i}].value must be a string`);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function apbNonEmptyBlocks(profile) {
  if (!profile || !Array.isArray(profile.blocks)) return [];
  return profile.blocks.filter((b) => b && typeof b.value === 'string' && b.value.trim() !== '');
}

// Indexed by from-version: APB_MIGRATIONS[1] migrates a version 1 payload to
// version 2, APB_MIGRATIONS[2] migrates version 2 to version 3, and so on.
// Getting this backwards would silently corrupt every import that crosses
// that version boundary.
const APB_MIGRATIONS = [];

export function apbExportProfiles(profiles) {
  const list = Array.isArray(profiles) ? profiles : [];
  return JSON.stringify({ schemaVersion: APB_SCHEMA_VERSION, profiles: list }, null, 2);
}

export function apbMigratePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'File is not a profile export.' };
  }
  const version = payload.schemaVersion;
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return { ok: false, error: 'File has no usable schemaVersion.' };
  }
  if (version > APB_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `File uses schema version ${version}, but this build understands version ${APB_SCHEMA_VERSION}. Update the tool and try again.`,
    };
  }
  let current = payload;
  for (let v = version; v < APB_SCHEMA_VERSION; v += 1) {
    const migrate = APB_MIGRATIONS[v];
    if (typeof migrate !== 'function') {
      return { ok: false, error: `No migration from schema version ${v}.` };
    }
    current = migrate(current);
  }
  return { ok: true, payload: { ...current, schemaVersion: APB_SCHEMA_VERSION } };
}

// Boot-time decision: seed starters only on a genuine first run (no stored
// profiles array yet, and not previously seeded), never once the user has
// emptied their profile list on purpose. The starter factory arrives as a
// parameter so this stays pure and testable without touching storage.
export function apbResolveBootProfiles(storedProfiles, settings, makeStarters) {
  if (Array.isArray(storedProfiles)) return { profiles: storedProfiles, seeded: true };
  if (settings && settings.seeded) return { profiles: [], seeded: true };
  return { profiles: makeStarters(), seeded: true };
}

export function apbImportProfiles(text, existing, mode) {
  if (mode !== 'merge' && mode !== 'replace') {
    return { ok: false, error: `Unknown import mode "${mode}".` };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `File is not valid JSON: ${err.message}` };
  }
  const migrated = apbMigratePayload(parsed);
  if (!migrated.ok) return migrated;

  const incoming = migrated.payload.profiles;
  if (!Array.isArray(incoming)) {
    return { ok: false, error: 'File contains no profiles array.' };
  }

  // Ids must stay unique because they are how profiles are selected, updated
  // and deleted: a duplicate makes the second record unreachable and lets
  // edits land on the wrong one. A single payload can contain two profiles
  // sharing an id (hand-edited export, concatenated files, and so on).
  // Reject the whole import in that case, the same all-or-nothing behaviour
  // every other failure mode in this function already has, rather than
  // silently dropping one of the two profiles the user doesn't know they
  // are losing.
  const normalised = [];
  const seenIds = new Set();
  for (let i = 0; i < incoming.length; i += 1) {
    const candidate = apbMakeProfile(incoming[i]);
    const check = apbValidateProfile(candidate);
    if (!check.ok) {
      return { ok: false, error: `Profile ${i + 1} is invalid: ${check.errors.join(', ')}. Nothing was imported.` };
    }
    if (seenIds.has(candidate.id)) {
      return { ok: false, error: `Profile ${i + 1} repeats id "${candidate.id}". Nothing was imported.` };
    }
    seenIds.add(candidate.id);
    normalised.push(candidate);
  }

  if (mode === 'replace') return { ok: true, profiles: normalised };

  const byId = new Map(normalised.map((p) => [p.id, p]));
  const merged = (Array.isArray(existing) ? existing : []).map(
    (p) => (byId.has(p.id) ? byId.get(p.id) : p),
  );
  const existingIds = new Set(merged.map((p) => p.id));
  for (const p of normalised) {
    if (!existingIds.has(p.id)) merged.push(p);
  }
  return { ok: true, profiles: merged };
}
