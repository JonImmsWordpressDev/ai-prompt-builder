import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apbStripModuleSyntax,
  apbCollectTopLevelNames,
  apbBuildHtml,
  apbAssertBundleCompiles,
} from '../build.js';

test('strips single and multi-line import statements', () => {
  const out = apbStripModuleSyntax(
    "import { a } from './x.js';\nimport {\n  b,\n} from './y.js';\nconst keep = 1;\n",
  );
  assert.equal(out.includes('import'), false);
  assert.ok(out.includes('const keep = 1;'));
});

test('strips the export keyword but keeps the declaration', () => {
  const out = apbStripModuleSyntax('export const A = 1;\nexport function f() {}\n');
  assert.equal(out.includes('export '), false);
  assert.ok(out.includes('const A = 1;'));
  assert.ok(out.includes('function f() {}'));
});

test('leaves the word export inside a string alone', () => {
  const out = apbStripModuleSyntax("const label = 'export profiles';\n");
  assert.ok(out.includes("'export profiles'"));
});

test('collects top level declarations only', () => {
  const names = apbCollectTopLevelNames(
    'export const A = 1;\nfunction b() {\n  const inner = 2;\n}\nlet c;\nclass D {}\n',
  );
  assert.deepEqual(names.sort(), ['A', 'D', 'b', 'c']);
});

test('build output is a complete standalone document', () => {
  const html = apbBuildHtml();
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('</html>'));
  assert.equal(html.includes('INJECT:'), false, 'every marker must be replaced');
  assert.equal(html.includes('type="module"'), false, 'must be a classic script for file://');
  assert.equal(/<script[^>]+src=/.test(html), false, 'no external scripts');
  assert.equal(/<link[^>]+href=/.test(html), false, 'no external stylesheets');
});

test('build inlines the styles and the assembler', () => {
  const html = apbBuildHtml();
  assert.ok(html.includes('apbAssemblePrompt'));
  assert.ok(html.includes('apbBoot'));
  assert.ok(html.includes('<style>'));
});

test('build is deterministic', () => {
  assert.equal(apbBuildHtml(), apbBuildHtml());
});

test('rejects a bundle where an export form the stripper cannot handle survives', () => {
  assert.throws(
    () => apbAssertBundleCompiles('export { apbFoo, apbBar };\n'),
    /not valid JavaScript/,
  );
});

test('rejects a bundle with a duplicate declaration the name collector cannot see', () => {
  assert.throws(
    () => apbAssertBundleCompiles('const a = 1;\nconst a = 2;\n'),
    /not valid JavaScript/,
  );
});

test('rejects a duplicate introduced by destructuring, which the regex collector cannot see at all', () => {
  const bundle = 'const apbThing = 1;\nconst { apbThing } = someObject;\n';
  assert.deepEqual(apbCollectTopLevelNames(bundle), ['apbThing']);
  assert.throws(
    () => apbAssertBundleCompiles(bundle),
    /not valid JavaScript/,
  );
});

test('accepts a normal concatenated bundle without throwing', () => {
  assert.doesNotThrow(() => apbAssertBundleCompiles('const a = 1;\nfunction f() { return a; }\n'));
});
