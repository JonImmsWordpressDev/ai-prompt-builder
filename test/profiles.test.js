import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APB_SCHEMA_VERSION,
  apbMakeProfile,
  apbValidateProfile,
  apbNonEmptyBlocks,
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
