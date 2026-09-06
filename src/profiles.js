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
