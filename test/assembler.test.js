import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APB_SECTION_ORDER, APB_SECTION_HEADINGS, APB_ROLE_LINES,
  APB_RESPOND_LINES, APB_ASK_FIRST, apbAssemblePrompt,
} from '../src/assembler.js';
import { APB_KINDS } from '../src/detect.js';

const NO_SIGNALS = { audience: '', tone: '', length: '', deadline: '' };

test('section order is the agreed order', () => {
  assert.deepEqual(APB_SECTION_ORDER, ['context', 'need', 'details', 'done']);
  for (const key of APB_SECTION_ORDER) {
    assert.equal(typeof APB_SECTION_HEADINGS[key], 'string');
  }
  assert.equal(APB_SECTION_HEADINGS.respond, 'How to respond');
});

test('every kind has a role line and a response instruction', () => {
  for (const kind of APB_KINDS) {
    assert.equal(typeof APB_ROLE_LINES[kind], 'string');
    assert.ok(APB_ROLE_LINES[kind].length > 0);
    assert.equal(typeof APB_RESPOND_LINES[kind], 'string');
  }
});

test('every response instruction ends with the ask-first clause', () => {
  assert.equal(
    APB_ASK_FIRST,
    'If something important is missing, ask me before you start. '
    + 'For anything minor, make a sensible assumption and tell me what you assumed.',
  );
  for (const kind of APB_KINDS) {
    assert.ok(
      APB_RESPOND_LINES[kind].endsWith(APB_ASK_FIRST),
      `${kind} response instruction must end with the ask-first clause`,
    );
  }
});

test('an empty brief produces nothing', () => {
  assert.equal(apbAssemblePrompt('', 'writing', NO_SIGNALS, {}), '');
  assert.equal(apbAssemblePrompt('   \n ', 'writing', NO_SIGNALS, {}), '');
  assert.equal(apbAssemblePrompt(null, 'writing', NO_SIGNALS, {}), '');
});

test('golden output for a full writing brief', () => {
  const brief = 'A blog post about choosing a plumber';
  const signals = { audience: 'homeowners', tone: 'friendly', length: '800 words', deadline: 'Friday' };
  const out = apbAssemblePrompt(brief, 'writing', signals, {});
  assert.equal(out, [
    APB_ROLE_LINES.writing,
    '',
    '## What I need',
    'A blog post about choosing a plumber',
    '',
    '## Details',
    '- Audience: homeowners',
    '- Tone: friendly',
    '- Length: 800 words',
    '- Deadline: Friday',
    '',
    '## How to respond',
    APB_RESPOND_LINES.writing,
  ].join('\n'));
});

test('empty sections omit their heading as well as their body', () => {
  const out = apbAssemblePrompt('Fix the login bug', 'code', NO_SIGNALS, {});
  assert.equal(out.includes('## Background'), false);
  assert.equal(out.includes('## Details'), false);
  assert.equal(out.includes('What done looks like'), false);
  assert.ok(out.includes('## What I need'));
  assert.ok(out.includes('## How to respond'));
});

test('the role line carries no heading', () => {
  const out = apbAssemblePrompt('Fix the login bug', 'code', NO_SIGNALS, {});
  assert.ok(out.startsWith(APB_ROLE_LINES.code));
  assert.equal(out.startsWith('#'), false);
});

test('details render as a bulleted list', () => {
  const out = apbAssemblePrompt('Write a post', 'writing', NO_SIGNALS, {
    constraints: ['Length: 500 words', 'Avoid: jargon'],
  });
  assert.ok(out.includes('## Details\n- Length: 500 words\n- Avoid: jargon'));
});

test('contributions merge with signals in the same section', () => {
  const signals = { ...NO_SIGNALS, audience: 'homeowners', tone: 'friendly' };
  const out = apbAssemblePrompt('Write a post', 'writing', signals, {
    audience: ['and letting agents'],
    tone: ['upbeat'],
    need: ['What I have: three case studies'],
    done: ['Verified by: my editor signs it off'],
  });
  assert.ok(out.includes('- Audience: homeowners; and letting agents'));
  assert.ok(out.includes('- Tone: friendly, upbeat'));
  assert.ok(out.includes('## What I need\nWrite a post\n\nWhat I have: three case studies'));
  assert.ok(out.includes('## What done looks like\nVerified by: my editor signs it off'));
});

test('the brief is reproduced verbatim, markdown and all', () => {
  const brief = '## My heading\n\n  - a list item\nand *emphasis* and <tags>';
  const out = apbAssemblePrompt(`  ${brief}  `, 'general', NO_SIGNALS, {});
  assert.ok(out.includes(brief), 'the brief must survive untouched apart from outer trimming');
});

test('output is markdown, never xml sections', () => {
  const out = apbAssemblePrompt('Write a post', 'writing', NO_SIGNALS, {});
  assert.equal(/<\/?(role|context|task|constraints|done_when|output_format)>/.test(out), false);
});

test('an unknown kind falls back to general', () => {
  const out = apbAssemblePrompt('Do a thing', 'nonsense', NO_SIGNALS, {});
  assert.ok(out.startsWith(APB_ROLE_LINES.general));
});

test('assembly is deterministic', () => {
  const args = ['Write a post', 'writing', { ...NO_SIGNALS, tone: 'warm' }, { constraints: ['Avoid: jargon'] }];
  assert.equal(apbAssemblePrompt(...args), apbAssemblePrompt(...args));
});

test('a nudge answer duplicating an extracted signal renders once', () => {
  const signals = { audience: 'homeowners', tone: 'friendly', length: '500 words', deadline: '' };
  const out = apbAssemblePrompt('Write a post', 'writing', signals, {
    tone: ['Friendly'],
    audience: ['homeowners'],
    constraints: ['Length: 500 words'],
  });
  assert.ok(out.includes('- Tone: friendly\n'), 'tone must not repeat');
  assert.ok(out.includes('- Audience: homeowners\n'), 'audience must not repeat');
  assert.equal(out.match(/Length: 500 words/g).length, 1, 'length must not repeat');
});

test('background renders first, before what I need', () => {
  const out = apbAssemblePrompt('Write a post', 'writing', NO_SIGNALS, {
    context: ['I run a small plumbing firm in Leeds'],
  });
  assert.ok(out.includes('## Background\nI run a small plumbing firm in Leeds\n\n## What I need'));
});

test('no role line names an audience the brief might contradict', () => {
  for (const kind of APB_KINDS) {
    assert.equal(/audience/i.test(APB_ROLE_LINES[kind]), false, `${kind} role line names an audience`);
  }
});

test('nothing the tool writes into a prompt uses em or en dashes', () => {
  const fixed = [...Object.values(APB_ROLE_LINES), ...Object.values(APB_RESPOND_LINES),
    ...Object.values(APB_SECTION_HEADINGS)];
  for (const line of fixed) {
    assert.equal(/[\u2013\u2014]/.test(line), false, `dash in: ${line}`);
  }
});
