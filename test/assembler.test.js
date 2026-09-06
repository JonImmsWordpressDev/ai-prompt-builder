import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APB_SECTION_ORDER, apbToList, apbAssemblePrompt } from '../src/assembler.js';

const profile = {
  schemaVersion: 1,
  id: 'p_1',
  name: 'Buildertrend / ADO',
  role: 'senior React and TypeScript engineer',
  blocks: [
    { label: 'Stack', value: 'React 18, TypeScript, .NET 8 API' },
    { label: 'Testing', value: 'npm test' },
  ],
  defaultOutputFormat: 'Plan first, wait for my approval, then implement.',
  updatedAt: '',
};

const task = {
  goal: 'Add a saved-filter dropdown to the job list page',
  detail: 'Users should be able to store and re-apply filter sets.',
  constraints: ['No new dependencies', 'Must work at 320px width'],
  doneWhen: ['Unit tests cover save, apply, delete'],
  outputFormat: '',
  roleOverride: '',
};

test('section order constant is the agreed order', () => {
  assert.deepEqual(APB_SECTION_ORDER, [
    'role', 'context', 'task', 'constraints', 'done_when', 'output_format',
  ]);
});

test('toList handles arrays, strings and junk', () => {
  assert.deepEqual(apbToList(['a', ' b ', '', '  ']), ['a', 'b']);
  assert.deepEqual(apbToList('a\n b \n\n'), ['a', 'b']);
  assert.deepEqual(apbToList(null), []);
  assert.deepEqual(apbToList(42), []);
});

test('golden full output', () => {
  const expected = [
    '<role>',
    'senior React and TypeScript engineer',
    '</role>',
    '',
    '<context>',
    'Project: Buildertrend / ADO',
    'Stack: React 18, TypeScript, .NET 8 API',
    'Testing: npm test',
    '</context>',
    '',
    '<task>',
    'Add a saved-filter dropdown to the job list page',
    '',
    'Users should be able to store and re-apply filter sets.',
    '</task>',
    '',
    '<constraints>',
    '- No new dependencies',
    '- Must work at 320px width',
    '</constraints>',
    '',
    '<done_when>',
    '- Unit tests cover save, apply, delete',
    '</done_when>',
    '',
    '<output_format>',
    'Plan first, wait for my approval, then implement.',
    '</output_format>',
  ].join('\n');
  assert.equal(apbAssemblePrompt(profile, task), expected);
});

test('output has no trailing newline', () => {
  const out = apbAssemblePrompt(profile, task);
  assert.equal(out.endsWith('\n'), false);
});

test('a goal alone yields exactly one task section', () => {
  const out = apbAssemblePrompt(null, { goal: 'Fix the pagination bug' });
  assert.equal(out, '<task>\nFix the pagination bug\n</task>');
});

test('every empty section is omitted', () => {
  const out = apbAssemblePrompt(null, { goal: 'x' });
  for (const tag of ['role', 'context', 'constraints', 'done_when', 'output_format']) {
    assert.equal(out.includes(`<${tag}>`), false, `${tag} should be absent`);
  }
});

test('roleOverride beats the profile role', () => {
  const out = apbAssemblePrompt(profile, { ...task, roleOverride: 'technical writer' });
  assert.ok(out.includes('<role>\ntechnical writer\n</role>'));
  assert.equal(out.includes('senior React'), false);
});

test('task outputFormat beats the profile default', () => {
  const out = apbAssemblePrompt(profile, { ...task, outputFormat: 'Bullet list only.' });
  assert.ok(out.includes('<output_format>\nBullet list only.\n</output_format>'));
  assert.equal(out.includes('Plan first'), false);
});

test('a multi-line block value drops below its label and indents by two', () => {
  const p = { ...profile, blocks: [{ label: 'Repo', value: 'web/ is the app\napi/ is the service' }] };
  const out = apbAssemblePrompt(p, { goal: 'x' });
  assert.ok(out.includes('Repo:\n  web/ is the app\n  api/ is the service'));
});

test('a block with a value but no label renders the value alone', () => {
  const p = { ...profile, blocks: [{ label: '', value: 'bare note' }] };
  const out = apbAssemblePrompt(p, { goal: 'x' });
  assert.ok(out.includes('\nbare note\n'));
});

test('a stray matching closing tag is neutralised, other angle brackets are not', () => {
  const out = apbAssemblePrompt(null, {
    goal: 'refactor',
    detail: 'the string "</task>" appears, and so does <div class="x"> and </constraints>',
  });
  assert.equal(out.includes('"</task>"'), false, 'own closing tag must be neutralised');
  assert.ok(out.includes('<\u200B/task>'), 'neutralised form should be present');
  assert.ok(out.includes('<div class="x">'), 'unrelated markup passes through');
  assert.ok(out.includes('</constraints>'), 'a foreign closing tag passes through');
  assert.equal(out.split('</task>').length, 2, 'exactly one real closing task tag');
});

test('assembly is deterministic', () => {
  assert.equal(apbAssemblePrompt(profile, task), apbAssemblePrompt(profile, task));
});

test('a null profile and an empty task yield an empty string', () => {
  assert.equal(apbAssemblePrompt(null, {}), '');
});
