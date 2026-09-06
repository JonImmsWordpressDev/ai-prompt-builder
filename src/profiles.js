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

  const normalised = [];
  for (let i = 0; i < incoming.length; i += 1) {
    const candidate = apbMakeProfile(incoming[i]);
    const check = apbValidateProfile(candidate);
    if (!check.ok) {
      return { ok: false, error: `Profile ${i + 1} is invalid: ${check.errors.join(', ')}. Nothing was imported.` };
    }
    normalised.push(candidate);
  }

  // Ids must stay unique because they are how profiles are selected, updated
  // and deleted: a duplicate makes the second record unreachable and lets
  // edits land on the wrong one. A single payload can contain two profiles
  // sharing an id (hand-edited export, concatenated files, and so on), so
  // collapse those here, before this list is used for anything else. The
  // last occurrence wins, which matches the rule below that an incoming
  // profile beats an existing one on a matching id.
  const byId = new Map();
  for (const p of normalised) byId.set(p.id, p);
  const uniqueIncoming = [...byId.values()];

  if (mode === 'replace') return { ok: true, profiles: uniqueIncoming };

  const merged = (Array.isArray(existing) ? existing : []).map(
    (p) => (byId.has(p.id) ? byId.get(p.id) : p),
  );
  const existingIds = new Set(merged.map((p) => p.id));
  for (const p of uniqueIncoming) {
    if (!existingIds.has(p.id)) {
      merged.push(p);
      existingIds.add(p.id);
    }
  }
  return { ok: true, profiles: merged };
}
