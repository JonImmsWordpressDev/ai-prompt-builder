import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APB_KINDS, APB_KIND_LABELS, APB_KIND_TIEBREAK,
  apbScoreKinds, apbDetectKind,
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
