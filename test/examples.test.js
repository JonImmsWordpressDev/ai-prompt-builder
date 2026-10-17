import { test } from 'node:test';
import assert from 'node:assert/strict';
import { APB_EXAMPLES } from '../src/examples.js';
import { APB_KINDS, apbDetectKind } from '../src/detect.js';

test('every example is detected as the kind it claims to show off', () => {
  for (const example of APB_EXAMPLES) {
    assert.ok(APB_KINDS.includes(example.kind), `${example.label} has an unknown kind`);
    assert.equal(apbDetectKind(example.brief), example.kind, example.label);
  }
});

test('examples cover every kind except the general fallback', () => {
  const covered = new Set(APB_EXAMPLES.map((example) => example.kind));
  for (const kind of APB_KINDS.filter((k) => k !== 'general')) {
    assert.ok(covered.has(kind), `no example for ${kind}`);
  }
});

test('example labels are short enough for a chip', () => {
  for (const example of APB_EXAMPLES) assert.ok(example.label.length <= 20, example.label);
});
