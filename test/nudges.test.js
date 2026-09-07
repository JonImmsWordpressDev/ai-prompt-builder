import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APB_NUDGE_DEFS, APB_NUDGE_ORDER, APB_NUDGE_LIMIT,
  apbOfferedNudges, apbNudgeContributions,
} from '../src/nudges.js';
import { APB_KINDS } from '../src/detect.js';

const NO_SIGNALS = { audience: '', tone: '', length: '', deadline: '' };

test('every kind has an order, and every id in it is defined', () => {
  for (const kind of APB_KINDS) {
    assert.ok(Array.isArray(APB_NUDGE_ORDER[kind]), `${kind} needs an order`);
    for (const id of APB_NUDGE_ORDER[kind]) {
      assert.ok(APB_NUDGE_DEFS[id], `${id} used by ${kind} but not defined`);
    }
  }
});

test('every definition routes to a real assembler section', () => {
  const sections = ['need', 'audience', 'tone', 'constraints', 'done'];
  for (const id of Object.keys(APB_NUDGE_DEFS)) {
    assert.ok(sections.includes(APB_NUDGE_DEFS[id].section), `${id} has a bad section`);
    assert.equal(typeof APB_NUDGE_DEFS[id].label, 'string');
    assert.equal(typeof APB_NUDGE_DEFS[id].prefix, 'string');
  }
});

test('offers at most three chips', () => {
  assert.equal(APB_NUDGE_LIMIT, 3);
  for (const kind of APB_KINDS) {
    assert.ok(apbOfferedNudges(kind, NO_SIGNALS, {}).length <= 3);
  }
});

test('offers the universal three first when nothing is known', () => {
  assert.deepEqual(apbOfferedNudges('writing', NO_SIGNALS, {}), ['audience', 'tone', 'done']);
});

test('a nudge is suppressed when its signal was extracted', () => {
  const signals = { ...NO_SIGNALS, audience: 'homeowners', tone: 'friendly' };
  assert.deepEqual(apbOfferedNudges('writing', signals, {}), ['done', 'length', 'avoid']);
});

test('per-kind extras follow the universal ones', () => {
  const signals = { ...NO_SIGNALS, audience: 'a', tone: 'warm' };
  assert.deepEqual(apbOfferedNudges('code', signals, {}), ['done', 'test', 'freeze']);
  assert.deepEqual(apbOfferedNudges('plan', signals, {}), ['done', 'deadline', 'who']);
  assert.deepEqual(apbOfferedNudges('analysis', signals, {}), ['done', 'data', 'decision']);
  assert.deepEqual(apbOfferedNudges('design', signals, {}), ['done', 'where', 'brand']);
});

test('an answered nudge stops being offered, and an emptied one returns', () => {
  assert.deepEqual(
    apbOfferedNudges('writing', NO_SIGNALS, { audience: 'homeowners' }),
    ['tone', 'done', 'length'],
  );
  assert.deepEqual(
    apbOfferedNudges('writing', NO_SIGNALS, { audience: '   ' }),
    ['audience', 'tone', 'done'],
  );
});

test('an unknown kind falls back to the general order', () => {
  assert.deepEqual(
    apbOfferedNudges('nonsense', NO_SIGNALS, {}),
    apbOfferedNudges('general', NO_SIGNALS, {}),
  );
});

test('contributions route each answer to its section with its prefix', () => {
  const out = apbNudgeContributions({
    audience: 'homeowners',
    tone: 'upbeat',
    done: 'it reads well',
    length: '500 words',
    avoid: 'jargon',
    test: 'npm test passes',
    freeze: 'the database schema',
    deadline: 'Friday',
    who: 'the marketing team',
    data: 'three spreadsheets',
    decision: 'which supplier to use',
    where: 'a shop window',
    brand: 'navy and gold',
  });
  assert.deepEqual(out.audience, ['homeowners', 'the marketing team']);
  assert.deepEqual(out.tone, ['upbeat']);
  assert.deepEqual(out.done, ['it reads well', 'Verified by: npm test passes']);
  assert.deepEqual(out.need, [
    'What I have: three spreadsheets',
    'This is to help decide: which supplier to use',
  ]);
  assert.deepEqual(out.constraints, [
    'Length: 500 words',
    'Avoid: jargon',
    'Do not change: the database schema',
    'Deadline: Friday',
    'Will be used: a shop window',
    'Brand and colour: navy and gold',
  ]);
});

test('contributions ignore blank answers and unknown ids', () => {
  const out = apbNudgeContributions({ audience: '  ', tone: '', bogus: 'x' });
  assert.deepEqual(out, { need: [], audience: [], tone: [], constraints: [], done: [] });
});

test('answers survive a kind change', () => {
  // "test" belongs to the code order, but an answer given while the kind
  // was code must keep rendering after switching to writing.
  const answers = { test: 'npm test passes' };
  assert.equal(apbOfferedNudges('writing', NO_SIGNALS, answers).includes('test'), false);
  assert.deepEqual(apbNudgeContributions(answers).done, ['Verified by: npm test passes']);
});

test('contribution order is stable regardless of answer insertion order', () => {
  const a = apbNudgeContributions({ avoid: 'jargon', length: '500 words' });
  const b = apbNudgeContributions({ length: '500 words', avoid: 'jargon' });
  assert.deepEqual(a.constraints, b.constraints);
});
