import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APB_HISTORY_LIMIT, apbHistorySanitize, apbHistoryAdd, apbHistoryHas, apbHistoryTitle,
} from '../src/history.js';
import { APB_KINDS } from '../src/detect.js';

const entry = (brief, extra = {}) => ({
  brief, kindPin: '', nudges: {}, savedAt: '2026-10-17T09:30:00.000Z', ...extra,
});

test('adds newest first', () => {
  const list = apbHistoryAdd(apbHistoryAdd([], entry('first')), entry('second'));
  assert.deepEqual(list.map((item) => item.brief), ['second', 'first']);
});

test('re-saving a brief moves it to the top with its latest answers', () => {
  let list = apbHistoryAdd([], entry('Write a post', { nudges: { tone: 'warm' } }));
  list = apbHistoryAdd(list, entry('other'));
  list = apbHistoryAdd(list, entry('  write   a POST ', { nudges: { tone: 'blunt' } }));
  assert.equal(list.length, 2);
  assert.deepEqual(list[0].nudges, { tone: 'blunt' });
});

test('caps the list', () => {
  let list = [];
  for (let i = 0; i < APB_HISTORY_LIMIT + 5; i += 1) list = apbHistoryAdd(list, entry(`brief ${i}`));
  assert.equal(list.length, APB_HISTORY_LIMIT);
  assert.equal(list[0].brief, `brief ${APB_HISTORY_LIMIT + 4}`);
});

test('ignores a blank brief and never mutates its input', () => {
  const start = [entry('keep')];
  const out = apbHistoryAdd(start, entry('   '));
  assert.deepEqual(out, start);
  assert.notEqual(out, start);
  apbHistoryAdd(start, entry('new'));
  assert.equal(start.length, 1);
});

test('sanitize drops bad entries one by one, keeping the good ones', () => {
  const out = apbHistorySanitize([
    null, 'string', [], { brief: '' }, { brief: 42 },
    { brief: 'good', kindPin: 'code', nudges: { tone: 'warm', bad: 7, blank: ' ' }, savedAt: '2026-10-17T09:30:00.000Z' },
    { brief: 'GOOD' },
    { brief: 'odd', kindPin: 'nonsense', nudges: ['x'], savedAt: 'not a date' },
  ], APB_KINDS);
  assert.deepEqual(out, [
    { brief: 'good', kindPin: 'code', nudges: { tone: 'warm' }, savedAt: '2026-10-17T09:30:00.000Z' },
    { brief: 'odd', kindPin: '', nudges: {}, savedAt: '' },
  ]);
});

test('sanitize returns an empty list for anything that is not an array', () => {
  for (const raw of [null, undefined, {}, 'x', 3]) assert.deepEqual(apbHistorySanitize(raw, APB_KINDS), []);
});

test('has matches briefs loosely, and never matches a blank one', () => {
  const list = [entry('Write a post')];
  assert.equal(apbHistoryHas(list, ' write  a post'), true);
  assert.equal(apbHistoryHas(list, 'something else'), false);
  assert.equal(apbHistoryHas([entry(' ')], ' '), false);
});

test('title flattens whitespace and cuts long briefs at a word', () => {
  assert.equal(apbHistoryTitle('short\n\nbrief'), 'short brief');
  const long = 'one two three four five six seven eight nine ten eleven twelve';
  const title = apbHistoryTitle(long, 30);
  assert.ok(title.endsWith('…'));
  assert.ok(title.length <= 31);
  assert.ok(long.startsWith(title.slice(0, -1)));
});
