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
  const sections = ['context', 'need', 'audience', 'tone', 'constraints', 'done'];
  for (const id of Object.keys(APB_NUDGE_DEFS)) {
    assert.ok(sections.includes(APB_NUDGE_DEFS[id].section), `${id} has a bad section`);
    assert.equal(typeof APB_NUDGE_DEFS[id].label, 'string');
    assert.equal(typeof APB_NUDGE_DEFS[id].prefix, 'string');
    assert.ok(APB_NUDGE_DEFS[id].hint.startsWith('e.g. '), `${id} needs an example hint`);
  }
});

test('offers at most three chips', () => {
  assert.equal(APB_NUDGE_LIMIT, 3);
  for (const kind of APB_KINDS) {
    assert.ok(apbOfferedNudges(kind, NO_SIGNALS, {}).length <= 3);
  }
});

test('offers each kind its most useful three first when nothing is known', () => {
  assert.deepEqual(apbOfferedNudges('writing', NO_SIGNALS, {}), ['audience', 'tone', 'context']);
  assert.deepEqual(apbOfferedNudges('code', NO_SIGNALS, {}), ['stack', 'done', 'test']);
  assert.deepEqual(apbOfferedNudges('general', NO_SIGNALS, {}), ['context', 'done', 'audience']);
});

test('code never offers tone or audience', () => {
  assert.equal(APB_NUDGE_ORDER.code.includes('tone'), false);
  assert.equal(APB_NUDGE_ORDER.code.includes('audience'), false);
});

test('a nudge is suppressed when its signal was extracted', () => {
  const signals = { ...NO_SIGNALS, audience: 'homeowners', tone: 'friendly' };
  assert.deepEqual(apbOfferedNudges('writing', signals, {}), ['context', 'done', 'length']);
});

test('each kind leads with its own questions', () => {
  const signals = { ...NO_SIGNALS, audience: 'a', tone: 'warm' };
  assert.deepEqual(apbOfferedNudges('code', signals, {}), ['stack', 'done', 'test']);
  assert.deepEqual(apbOfferedNudges('plan', signals, {}), ['context', 'deadline', 'done']);
  assert.deepEqual(apbOfferedNudges('analysis', signals, {}), ['data', 'decision', 'context']);
  assert.deepEqual(apbOfferedNudges('design', signals, {}), ['where', 'brand', 'context']);
});

test('an answered nudge stops being offered, and an emptied one returns', () => {
  assert.deepEqual(
    apbOfferedNudges('writing', NO_SIGNALS, { audience: 'homeowners' }),
    ['tone', 'context', 'done'],
  );
  assert.deepEqual(
    apbOfferedNudges('writing', NO_SIGNALS, { audience: '   ' }),
    ['audience', 'tone', 'context'],
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
    context: 'I run a bakery',
    stack: 'WordPress 6.6',
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
  assert.deepEqual(out.context, ['I run a bakery', 'My setup: WordPress 6.6']);
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
  assert.deepEqual(out, {
    context: [], need: [], audience: [], tone: [], constraints: [], done: [],
  });
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
