import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APB_SCHEMA_VERSION,
  apbMakeProfile,
  apbValidateProfile,
  apbNonEmptyBlocks,
} from '../src/profiles.js';
import {
  apbExportProfiles,
  apbImportProfiles,
  apbMigratePayload,
} from '../src/profiles.js';

test('schema version is 1', () => {
  assert.equal(APB_SCHEMA_VERSION, 1);
});

test('makeProfile fills defaults without inventing id or timestamp', () => {
  const p = apbMakeProfile({ id: 'p_test', name: 'Freelance WP' });
  assert.equal(p.schemaVersion, 1);
  assert.equal(p.id, 'p_test');
  assert.equal(p.name, 'Freelance WP');
  assert.equal(p.role, '');
  assert.deepEqual(p.blocks, []);
  assert.equal(p.defaultOutputFormat, '');
  assert.equal(p.updatedAt, '');
});

test('makeProfile preserves supplied fields', () => {
  const p = apbMakeProfile({
    id: 'p_1',
    name: 'ADO',
    role: 'senior engineer',
    blocks: [{ label: 'Stack', value: 'React 18' }],
    defaultOutputFormat: 'Plan first.',
    updatedAt: '2026-09-06T10:00:00.000Z',
  });
  assert.equal(p.role, 'senior engineer');
  assert.deepEqual(p.blocks, [{ label: 'Stack', value: 'React 18' }]);
  assert.equal(p.defaultOutputFormat, 'Plan first.');
  assert.equal(p.updatedAt, '2026-09-06T10:00:00.000Z');
});

test('validateProfile accepts a well formed profile', () => {
  const p = apbMakeProfile({ id: 'p_1', name: 'ADO' });
  assert.deepEqual(apbValidateProfile(p), { ok: true, errors: [] });
});

test('validateProfile rejects a missing name', () => {
  const p = apbMakeProfile({ id: 'p_1', name: '   ' });
  const r = apbValidateProfile(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('name')));
});

test('validateProfile rejects a non-object', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    assert.equal(apbValidateProfile(bad).ok, false);
  }
});

test('validateProfile rejects blocks that are not an array', () => {
  const r = apbValidateProfile({ ...apbMakeProfile({ id: 'a', name: 'b' }), blocks: 'nope' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('blocks')));
});

test('validateProfile rejects a block missing label or value', () => {
  const r = apbValidateProfile({
    ...apbMakeProfile({ id: 'a', name: 'b' }),
    blocks: [{ label: 'Stack' }],
  });
  assert.equal(r.ok, false);
});

test('validateProfile collects every error, not just the first', () => {
  const r = apbValidateProfile({ schemaVersion: 1, id: '', name: '', blocks: 'x' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 3);
});

test('nonEmptyBlocks ignores blank and whitespace-only values', () => {
  const p = apbMakeProfile({
    id: 'p_1',
    name: 'ADO',
    blocks: [
      { label: 'Stack', value: 'React 18' },
      { label: 'Empty', value: '' },
      { label: 'Spaces', value: '   ' },
    ],
  });
  assert.equal(apbNonEmptyBlocks(p).length, 1);
});

test('nonEmptyBlocks tolerates a null profile', () => {
  assert.deepEqual(apbNonEmptyBlocks(null), []);
});

test('makeProfile handles null blocks without throwing', () => {
  const p = apbMakeProfile({
    id: 'p_1',
    name: 'Test',
    blocks: [null],
  });
  assert.equal(p.blocks.length, 1);
  assert.deepEqual(p.blocks[0], { label: '', value: '' });
});

test('validateProfile rejects invalid blocks without throwing', () => {
  const p = { ...apbMakeProfile({ id: 'p_1', name: 'Test' }), blocks: [null] };
  const r = apbValidateProfile(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('blocks[0]')));
});

const mk = (id, name) => apbMakeProfile({ id, name });

test('export produces the agreed envelope, pretty printed', () => {
  const text = apbExportProfiles([mk('p_1', 'ADO')]);
  const parsed = JSON.parse(text);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.profiles.length, 1);
  assert.ok(text.includes('\n  '), 'should be indented');
});

test('export is deterministic and carries no timestamp', () => {
  const a = apbExportProfiles([mk('p_1', 'ADO')]);
  const b = apbExportProfiles([mk('p_1', 'ADO')]);
  assert.equal(a, b);
  assert.equal(a.includes('exportedAt'), false);
});

test('export then import round-trips to an identical array', () => {
  const original = [
    apbMakeProfile({ id: 'p_1', name: 'ADO', role: 'engineer', blocks: [{ label: 'Stack', value: 'React' }] }),
    mk('p_2', 'Freelance WP'),
  ];
  const result = apbImportProfiles(apbExportProfiles(original), [], 'replace');
  assert.equal(result.ok, true);
  assert.deepEqual(result.profiles, original);
});

test('import rejects unparseable text without touching existing', () => {
  const existing = [mk('p_1', 'ADO')];
  const r = apbImportProfiles('{not json', existing, 'replace');
  assert.equal(r.ok, false);
  assert.ok(r.error.length > 0);
  assert.deepEqual(existing, [mk('p_1', 'ADO')]);
});

test('import rejects a newer schema version and names both versions', () => {
  const text = JSON.stringify({ schemaVersion: 99, profiles: [] });
  const r = apbImportProfiles(text, [], 'replace');
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('99'));
  assert.ok(r.error.includes('1'));
});

test('import rejects a payload with no profiles array', () => {
  assert.equal(apbImportProfiles(JSON.stringify({ schemaVersion: 1 }), [], 'replace').ok, false);
});

test('import is all or nothing when one profile is invalid', () => {
  const text = JSON.stringify({
    schemaVersion: 1,
    profiles: [mk('p_1', 'Good'), { id: '', name: '', blocks: 'bad' }],
  });
  const r = apbImportProfiles(text, [], 'replace');
  assert.equal(r.ok, false);
  assert.ok(r.error.toLowerCase().includes('profile'));
});

test('merge lets the incoming copy win on a matching id and preserves order', () => {
  const existing = [mk('p_1', 'Old One'), mk('p_2', 'Keep Me')];
  const text = apbExportProfiles([mk('p_1', 'New One'), mk('p_3', 'Brand New')]);
  const r = apbImportProfiles(text, existing, 'merge');
  assert.equal(r.ok, true);
  assert.deepEqual(r.profiles.map((p) => p.id), ['p_1', 'p_2', 'p_3']);
  assert.equal(r.profiles[0].name, 'New One');
  assert.equal(r.profiles[1].name, 'Keep Me');
});

test('replace discards everything that existed', () => {
  const r = apbImportProfiles(apbExportProfiles([mk('p_9', 'Only')]), [mk('p_1', 'Gone')], 'replace');
  assert.equal(r.ok, true);
  assert.deepEqual(r.profiles.map((p) => p.id), ['p_9']);
});

test('an unknown mode is rejected rather than guessed at', () => {
  const r = apbImportProfiles(apbExportProfiles([mk('p_1', 'X')]), [], 'sideways');
  assert.equal(r.ok, false);
});

test('migratePayload passes the current version through unchanged', () => {
  const payload = { schemaVersion: 1, profiles: [] };
  const r = apbMigratePayload(payload);
  assert.equal(r.ok, true);
  assert.equal(r.payload.schemaVersion, 1);
});

test('migratePayload rejects a future version', () => {
  assert.equal(apbMigratePayload({ schemaVersion: 2, profiles: [] }).ok, false);
});

test('migratePayload rejects a missing or non-numeric version', () => {
  assert.equal(apbMigratePayload({ profiles: [] }).ok, false);
  assert.equal(apbMigratePayload({ schemaVersion: 'one', profiles: [] }).ok, false);
});
