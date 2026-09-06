import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APB_KINDS, APB_KIND_LABELS, APB_KIND_TIEBREAK,
  apbScoreKinds, apbDetectKind,
  apbExtractAudience, apbExtractTone, apbExtractLength,
  apbExtractDeadline, apbExtractSignals,
} from '../src/detect.js';

test('exposes six kinds, each with a label', () => {
  assert.deepEqual(APB_KINDS, ['writing', 'code', 'plan', 'analysis', 'design', 'general']);
  for (const kind of APB_KINDS) {
    assert.equal(typeof APB_KIND_LABELS[kind], 'string');
    assert.ok(APB_KIND_LABELS[kind].length > 0);
  }
});

test('tie-break order lists every kind exactly once', () => {
  assert.deepEqual([...APB_KIND_TIEBREAK].sort(), [...APB_KINDS].sort());
  assert.deepEqual(APB_KIND_TIEBREAK, ['code', 'design', 'analysis', 'plan', 'writing', 'general']);
});

test('picks each kind from a representative brief', () => {
  assert.equal(apbDetectKind('Write a blog post about our new newsletter'), 'writing');
  assert.equal(apbDetectKind('Fix the bug in the login api endpoint'), 'code');
  assert.equal(apbDetectKind('I need a roadmap and timeline for the launch'), 'plan');
  assert.equal(apbDetectKind('Compare these two spreadsheets and give me the trends'), 'analysis');
  assert.equal(apbDetectKind('A logo and colour palette for my brand'), 'design');
});

test('scores distinct keywords, not repeats', () => {
  // "blog" ten times is one distinct keyword; the code brief matches three.
  const repeated = apbScoreKinds('blog blog blog blog blog blog blog blog blog blog');
  assert.equal(repeated.writing, 1);
  const varied = apbScoreKinds('the api endpoint has a bug');
  assert.equal(varied.code, 3);
  assert.equal(apbDetectKind('blog blog blog blog. the api endpoint has a bug'), 'code');
});

test('falls back to general for empty and keyword-free briefs', () => {
  assert.equal(apbDetectKind(''), 'general');
  assert.equal(apbDetectKind('   '), 'general');
  assert.equal(apbDetectKind(null), 'general');
  assert.equal(apbDetectKind('help me decide what to have for dinner tonight'), 'general');
});

test('applies the tie-break when two kinds score equally', () => {
  // "logo" scores design 1; "bug" scores code 1; code precedes design.
  const scores = apbScoreKinds('the logo has a bug');
  assert.equal(scores.design, 1);
  assert.equal(scores.code, 1);
  assert.equal(apbDetectKind('the logo has a bug'), 'code');
});

test('general never scores above zero', () => {
  assert.equal(apbScoreKinds('write code and plan a design analysis').general, 0);
});

test('matches on word boundaries, not substrings', () => {
  // "barcodes" contains "code"; "brandish" contains "brand". Neither
  // may score, or every brief mentioning a barcode becomes a code job.
  assert.equal(apbScoreKinds('barcodes brandish').code, 0);
  assert.equal(apbScoreKinds('barcodes brandish').design, 0);
});

test('extracts an audience from each cue phrase', () => {
  assert.equal(apbExtractAudience('a blog post for homeowners'), 'homeowners');
  assert.equal(apbExtractAudience('aimed at small business owners'), 'small business owners');
  assert.equal(apbExtractAudience('targeted at new parents'), 'new parents');
  assert.equal(apbExtractAudience('targeting first time buyers'), 'first time buyers');
  assert.equal(apbExtractAudience('the audience is retired teachers'), 'retired teachers');
  assert.equal(apbExtractAudience('Audience: busy parents'), 'busy parents');
});

test('audience capture stops at punctuation and caps at five words', () => {
  assert.equal(apbExtractAudience('friendly tone, for homeowners, about 800 words'), 'homeowners');
  assert.equal(
    apbExtractAudience('for one two three four five six seven'),
    'one two three four five',
  );
});

test('audience rejects filler captures and very short ones', () => {
  assert.equal(apbExtractAudience('do this for me'), '');
  assert.equal(apbExtractAudience('for free'), '');
  assert.equal(apbExtractAudience('for us'), '');
  assert.equal(apbExtractAudience('write something'), '');
});

test('audience cue must be a whole word', () => {
  // "before" contains "for" but must not trigger the cue.
  assert.equal(apbExtractAudience('finish it before Christmas dinner'), '');
});

test('collects every tone word in brief order', () => {
  assert.equal(apbExtractTone('keep it casual and warm'), 'casual, warm');
  assert.equal(apbExtractTone('a warm but casual piece'), 'warm, casual');
  assert.equal(apbExtractTone('friendly tone please'), 'friendly');
  assert.equal(apbExtractTone('no tone words here'), '');
});

test('length matches the three patterns in priority order', () => {
  assert.equal(apbExtractLength('about 800 words, 3 pages, keep it short'), '800 words');
  assert.equal(apbExtractLength('3 paragraphs, keep it short'), '3 paragraphs');
  assert.equal(apbExtractLength('keep it in-depth'), 'in-depth');
  assert.equal(apbExtractLength('no length here'), '');
});

test('deadline matches the accepted date shapes', () => {
  assert.equal(apbExtractDeadline('needed by Friday'), 'Friday');
  assert.equal(apbExtractDeadline('due tomorrow'), 'tomorrow');
  assert.equal(apbExtractDeadline('before next week'), 'next week');
  assert.equal(apbExtractDeadline('by 12th of March'), '12th of March');
  assert.equal(apbExtractDeadline('by 2026-09-06'), '2026-09-06');
  assert.equal(apbExtractDeadline('sometime soonish'), '');
});

test('extractSignals returns all four keys, empty when absent', () => {
  assert.deepEqual(apbExtractSignals(''), {
    audience: '', tone: '', length: '', deadline: '',
  });
  assert.deepEqual(
    apbExtractSignals('A friendly blog post of 800 words for homeowners, due Friday'),
    { audience: 'homeowners', tone: 'friendly', length: '800 words', deadline: 'Friday' },
  );
});

test('extraction never consumes any part of the brief', () => {
  // The non-destructive guarantee. Extraction reads; it must not
  // return a modified brief, and every extracted fragment must still
  // be findable in the original text.
  const brief = 'A friendly blog post of 800 words for homeowners, due Friday';
  const signals = apbExtractSignals(brief);
  for (const value of Object.values(signals)) {
    if (value) assert.ok(brief.toLowerCase().includes(value.toLowerCase().split(', ')[0]));
  }
  // apbExtractSignals takes a string and returns an object; there is no
  // path by which the caller's brief can be mutated.
  assert.equal(brief, 'A friendly blog post of 800 words for homeowners, due Friday');
});
