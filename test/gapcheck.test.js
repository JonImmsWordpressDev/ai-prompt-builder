import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APB_HEDGE_PHRASES,
  APB_SEVERITY_WEIGHT,
  APB_GAP_RULES,
  apbAnalyzeGaps,
} from '../src/gapcheck.js';

const fullProfile = {
  schemaVersion: 1, id: 'p_1', name: 'ADO', role: 'engineer',
  blocks: [
    { label: 'Stack', value: 'React 18' },
    { label: 'Testing', value: 'npm test' },
    { label: 'Done when', value: 'tests pass' },
  ],
  defaultOutputFormat: 'Plan first.', updatedAt: '',
};

const fullTask = {
  goal: 'Add a saved filter dropdown to the job list page',
  detail: 'Users store and re-apply filter sets.',
  constraints: ['No new dependencies'],
  doneWhen: ['Unit tests cover save and apply'],
  outputFormat: 'Plan first.',
  roleOverride: '',
};

const idsOf = (r) => r.gaps.map((g) => g.id);

test('severity weights are exactly as specified', () => {
  assert.deepEqual(APB_SEVERITY_WEIGHT, { high: 20, medium: 10, low: 5 });
});

test('hedge phrase list is the agreed five', () => {
  assert.deepEqual(APB_HEDGE_PHRASES,
    ['etc.', 'and so on', 'something like', 'make it better', 'as needed']);
});

test('every rule has the required shape and a unique id', () => {
  const seen = new Set();
  for (const rule of APB_GAP_RULES) {
    assert.equal(typeof rule.id, 'string');
    assert.ok(['high', 'medium', 'low'].includes(rule.severity), `${rule.id} severity`);
    assert.equal(typeof rule.test, 'function');
    assert.ok(rule.message.length > 0, `${rule.id} needs a message`);
    assert.equal(seen.has(rule.id), false, `duplicate id ${rule.id}`);
    seen.add(rule.id);
  }
});

test('a complete profile and task score 100 with no gaps', () => {
  const r = apbAnalyzeGaps(fullProfile, fullTask);
  assert.deepEqual(r.gaps, []);
  assert.equal(r.score, 100);
});

test('no-profile fires and suppresses the profile-content rules', () => {
  const ids = idsOf(apbAnalyzeGaps(null, fullTask));
  assert.ok(ids.includes('no-profile'));
  assert.equal(ids.includes('thin-profile'), false);
  assert.equal(ids.includes('no-verification'), false);
});

test('thin-profile fires on fewer than three filled blocks', () => {
  const p = { ...fullProfile, blocks: [{ label: 'Stack', value: 'React 18' }, { label: 'x', value: '' }] };
  assert.ok(idsOf(apbAnalyzeGaps(p, fullTask)).includes('thin-profile'));
});

test('no-goal fires and thin-goal does not, on an empty goal', () => {
  const ids = idsOf(apbAnalyzeGaps(fullProfile, { ...fullTask, goal: '   ' }));
  assert.ok(ids.includes('no-goal'));
  assert.equal(ids.includes('thin-goal'), false);
});

test('thin-goal fires on a short goal and not on a long one', () => {
  assert.ok(idsOf(apbAnalyzeGaps(fullProfile, { ...fullTask, goal: 'fix the bug' })).includes('thin-goal'));
  assert.equal(idsOf(apbAnalyzeGaps(fullProfile, fullTask)).includes('thin-goal'), false);
});

test('no-detail fires on an empty detail', () => {
  assert.ok(idsOf(apbAnalyzeGaps(fullProfile, { ...fullTask, detail: '' })).includes('no-detail'));
});

test('no-done-when needs either a task list or a profile done block', () => {
  const noneAnywhere = { ...fullProfile, blocks: [{ label: 'Stack', value: 'React 18' }, { label: 'Testing', value: 'npm test' }, { label: 'Repo', value: 'monorepo' }] };
  assert.ok(idsOf(apbAnalyzeGaps(noneAnywhere, { ...fullTask, doneWhen: [] })).includes('no-done-when'));
  assert.equal(idsOf(apbAnalyzeGaps(fullProfile, { ...fullTask, doneWhen: [] })).includes('no-done-when'), false);
  assert.equal(idsOf(apbAnalyzeGaps(noneAnywhere, fullTask)).includes('no-done-when'), false);
});

test('no-verification matches on label or value, case-insensitively', () => {
  const byValue = { ...fullProfile, blocks: [{ label: 'Commands', value: 'run LINT before pushing' }, { label: 'Stack', value: 'React' }, { label: 'Repo', value: 'x' }] };
  assert.equal(idsOf(apbAnalyzeGaps(byValue, fullTask)).includes('no-verification'), false);
  const neither = { ...fullProfile, blocks: [{ label: 'Stack', value: 'React' }, { label: 'Repo', value: 'x' }, { label: 'Done when', value: 'shipped' }] };
  assert.ok(idsOf(apbAnalyzeGaps(neither, fullTask)).includes('no-verification'));
});

test('no-constraints fires on an empty constraint list', () => {
  assert.ok(idsOf(apbAnalyzeGaps(fullProfile, { ...fullTask, constraints: [] })).includes('no-constraints'));
});

test('no-output-format needs either task or profile to supply one', () => {
  const noDefault = { ...fullProfile, defaultOutputFormat: '' };
  assert.ok(idsOf(apbAnalyzeGaps(noDefault, { ...fullTask, outputFormat: '' })).includes('no-output-format'));
  assert.equal(idsOf(apbAnalyzeGaps(fullProfile, { ...fullTask, outputFormat: '' })).includes('no-output-format'), false);
});

test('vague-language scans goal and detail and is case-insensitive', () => {
  assert.ok(idsOf(apbAnalyzeGaps(fullProfile, { ...fullTask, detail: 'clean it up AND SO ON' })).includes('vague-language'));
  assert.ok(idsOf(apbAnalyzeGaps(fullProfile, { ...fullTask, goal: 'please Make It Better across the app' })).includes('vague-language'));
  assert.equal(idsOf(apbAnalyzeGaps(fullProfile, fullTask)).includes('vague-language'), false);
});

test('score subtracts by weight', () => {
  const r = apbAnalyzeGaps(fullProfile, { ...fullTask, constraints: [] });
  assert.equal(r.score, 95);
  const r2 = apbAnalyzeGaps(fullProfile, { ...fullTask, constraints: [], detail: '' });
  assert.equal(r2.score, 85);
});

test('an empty task with no profile scores 15, not zero', () => {
  // no-profile, no-goal, no-done-when (60) + no-detail, no-output-format (20)
  // + no-constraints (5) = 85. thin-profile and no-verification are suppressed.
  const r = apbAnalyzeGaps(null, {});
  assert.equal(r.score, 15);
});

test('score floors at zero and never goes negative', () => {
  const bare = {
    schemaVersion: 1, id: 'p_1', name: 'Bare', role: '',
    blocks: [{ label: 'Note', value: 'x' }], defaultOutputFormat: '', updatedAt: '',
  };
  // thin-profile, no-goal, no-done-when, no-verification (80)
  // + no-detail, no-output-format (20) + no-constraints (5) = 105, clamped to 0.
  const r = apbAnalyzeGaps(bare, {});
  assert.equal(r.score, 0);
  assert.ok(r.gaps.length > 0);
});

test('gaps are ordered high, then medium, then low', () => {
  const r = apbAnalyzeGaps(null, {});
  const rank = { high: 0, medium: 1, low: 2 };
  const seq = r.gaps.map((g) => rank[g.severity]);
  assert.deepEqual(seq, [...seq].sort((a, b) => a - b));
});

test('analysis is deterministic', () => {
  assert.deepEqual(apbAnalyzeGaps(fullProfile, fullTask), apbAnalyzeGaps(fullProfile, fullTask));
});
