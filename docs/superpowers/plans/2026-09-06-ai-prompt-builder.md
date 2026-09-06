# AI Prompt Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-contained HTML tool that assembles a reusable project profile plus a short task description into a paste-ready, XML-sectioned Claude prompt, and flags the context gaps that would otherwise cause clarifying questions.

**Architecture:** Pure logic modules under `src/` carry all behaviour worth testing and import nothing impure. A dependency-free `build.js` strips their `import`/`export` lines, concatenates them in dependency order, and injects them into `src/shell.html` as one classic script, producing a single portable `dist/prompt-builder.html`. The dev server calls the same build function on every request, so development and distribution never diverge.

**Tech Stack:** Node 18+, vanilla ES modules in source, zero npm dependencies, `node:test` and `node:assert`, no bundler, no transpiler, no lint step.

**Spec:** `docs/superpowers/specs/2026-09-06-ai-prompt-builder-design.md`

## Global Constraints

- Zero npm dependencies. `package.json` must have no `dependencies` and no `devDependencies` key at all.
- Node `>=18`. `package.json` sets `"engines": { "node": ">=18" }` and `"type": "module"`.
- Repository is `https://github.com/JonImmsWordpressDev/ai-prompt-builder`. License MIT, author `Jon Imms (https://jonimms.com)`.
- Pure modules (`profiles.js`, `assembler.js`, `gapcheck.js`) must not reference `window`, `document`, `localStorage`, `fetch`, `Date.now()`, `new Date()`, or `Math.random()`. Determinism is what makes them testable.
- Dependency direction is one-way: `ui.js` may import anything; nothing else may import `ui.js`, `storage.js`, or `polish.js`.
- Every top-level declaration in `src/*.js` is prefixed `apb` or `APB_` so names stay unique after concatenation into one scope.
- The built file must work from a `file://` URL with no network access.
- Section tag order is fixed: `role`, `context`, `task`, `constraints`, `done_when`, `output_format`.
- Severity weights are exactly high 20, medium 10, low 5. Score starts at 100 and floors at 0.
- `APB_SCHEMA_VERSION` is `1`.
- Never commit `dist/`. It is gitignored.
- The test script is `node --test test/*.js`, using shell glob expansion. Do NOT use `node --test test/`: passing a bare directory works on Node 18 but fails on Node 23+, and this project's own machine runs Node 25. The glob form works on every version in range.

## File Structure

| File | Responsibility |
|------|----------------|
| `package.json` | scripts, engines, metadata. No dependencies. |
| `src/profiles.js` | pure. Profile shape, validation, export, import, migration. |
| `src/assembler.js` | pure. Profile + task to prompt string. |
| `src/gapcheck.js` | pure. Rule list, gap detection, completeness score. |
| `src/storage.js` | impure. localStorage with in-memory fallback, id generation. |
| `src/polish.js` | impure. Anthropic API call, isolated so absence breaks nothing. |
| `src/ui.js` | impure. DOM wiring only. No business logic. |
| `src/shell.html` | document skeleton with three injection markers. |
| `src/styles.css` | all styling. |
| `build.js` | exports `apbBuildHtml()`, CLI writes `dist/prompt-builder.html`. |
| `dev-server.js` | serves `apbBuildHtml()` on every request, port 4518. |
| `test/*.test.js` | `node:test` over the three pure modules and the build. |

---

### Task 1: Project scaffold and profile schema

Sets up the package so `npm test` runs, and delivers the profile shape plus validation. Setup is folded in here because this is the first task that needs it.

**Files:**
- Create: `package.json`
- Create: `LICENSE`
- Create: `src/profiles.js`
- Test: `test/profiles.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `APB_SCHEMA_VERSION: number` (value `1`)
  - `apbMakeProfile(fields: object) -> Profile` — pure factory. Requires `fields.id` and `fields.name`; fills `role: ''`, `blocks: []`, `defaultOutputFormat: ''`, `updatedAt: ''` when absent. Never generates an id or a timestamp itself.
  - `apbValidateProfile(value: unknown) -> { ok: boolean, errors: string[] }`
  - `apbNonEmptyBlocks(profile: Profile|null) -> Block[]` — blocks whose `value` is non-empty after trimming.
  - Types, for reference only, not enforced at runtime: `Block = { label: string, value: string }`, `Profile = { schemaVersion, id, name, role, blocks, defaultOutputFormat, updatedAt }`.

- [ ] **Step 1: Write the failing test**

Create `test/profiles.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  APB_SCHEMA_VERSION,
  apbMakeProfile,
  apbValidateProfile,
  apbNonEmptyBlocks,
} from '../src/profiles.js';

test('schema version is 1', () => {
  assert.equal(APB_SCHEMA_VERSION, 1);
});

test('makeProfile fills defaults without inventing id or timestamp', () => {
  const p = apbMakeProfile({ id: 'p_test', name: 'Freelance WP' });
  assert.equal(p.schemaVersion, 1);
  assert.equal(p.id, 'p_test');
  assert.equal(p.name, 'Freelance WP');
  assert.equal(p.role, '');
  assert.deepEqual(p.blocks, []);
  assert.equal(p.defaultOutputFormat, '');
  assert.equal(p.updatedAt, '');
});

test('makeProfile preserves supplied fields', () => {
  const p = apbMakeProfile({
    id: 'p_1',
    name: 'ADO',
    role: 'senior engineer',
    blocks: [{ label: 'Stack', value: 'React 18' }],
    defaultOutputFormat: 'Plan first.',
    updatedAt: '2026-09-06T10:00:00.000Z',
  });
  assert.equal(p.role, 'senior engineer');
  assert.deepEqual(p.blocks, [{ label: 'Stack', value: 'React 18' }]);
  assert.equal(p.defaultOutputFormat, 'Plan first.');
  assert.equal(p.updatedAt, '2026-09-06T10:00:00.000Z');
});

test('validateProfile accepts a well formed profile', () => {
  const p = apbMakeProfile({ id: 'p_1', name: 'ADO' });
  assert.deepEqual(apbValidateProfile(p), { ok: true, errors: [] });
});

test('validateProfile rejects a missing name', () => {
  const p = apbMakeProfile({ id: 'p_1', name: '   ' });
  const r = apbValidateProfile(p);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('name')));
});

test('validateProfile rejects a non-object', () => {
  for (const bad of [null, undefined, 'x', 42, []]) {
    assert.equal(apbValidateProfile(bad).ok, false);
  }
});

test('validateProfile rejects blocks that are not an array', () => {
  const r = apbValidateProfile({ ...apbMakeProfile({ id: 'a', name: 'b' }), blocks: 'nope' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes('blocks')));
});

test('validateProfile rejects a block missing label or value', () => {
  const r = apbValidateProfile({
    ...apbMakeProfile({ id: 'a', name: 'b' }),
    blocks: [{ label: 'Stack' }],
  });
  assert.equal(r.ok, false);
});

test('validateProfile collects every error, not just the first', () => {
  const r = apbValidateProfile({ schemaVersion: 1, id: '', name: '', blocks: 'x' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.length >= 3);
});

test('nonEmptyBlocks ignores blank and whitespace-only values', () => {
  const p = apbMakeProfile({
    id: 'p_1',
    name: 'ADO',
    blocks: [
      { label: 'Stack', value: 'React 18' },
      { label: 'Empty', value: '' },
      { label: 'Spaces', value: '   ' },
    ],
  });
  assert.equal(apbNonEmptyBlocks(p).length, 1);
});

test('nonEmptyBlocks tolerates a null profile', () => {
  assert.deepEqual(apbNonEmptyBlocks(null), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL. Without `package.json` npm errors; once it exists, the run fails with `Cannot find module '../src/profiles.js'`.

- [ ] **Step 3: Write package.json and LICENSE**

`package.json`:

```json
{
  "name": "ai-prompt-builder",
  "version": "0.1.0",
  "description": "Assemble reusable project context and a short task description into a paste-ready, XML-sectioned prompt.",
  "type": "module",
  "private": false,
  "license": "MIT",
  "author": "Jon Imms (https://jonimms.com)",
  "homepage": "https://github.com/JonImmsWordpressDev/ai-prompt-builder#readme",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/JonImmsWordpressDev/ai-prompt-builder.git"
  },
  "bugs": {
    "url": "https://github.com/JonImmsWordpressDev/ai-prompt-builder/issues"
  },
  "keywords": ["prompt", "prompt-engineering", "claude", "productivity", "static-site"],
  "scripts": {
    "dev": "node dev-server.js",
    "build": "node build.js",
    "test": "node --test test/*.js"
  },
  "engines": {
    "node": ">=18"
  }
}
```

`LICENSE`: the standard MIT license text, copyright line `Copyright (c) 2026 Jon Imms`.

- [ ] **Step 4: Write minimal implementation**

Create `src/profiles.js`:

```js
export const APB_SCHEMA_VERSION = 1;

export function apbMakeProfile(fields) {
  const f = fields || {};
  return {
    schemaVersion: APB_SCHEMA_VERSION,
    id: typeof f.id === 'string' ? f.id : '',
    name: typeof f.name === 'string' ? f.name : '',
    role: typeof f.role === 'string' ? f.role : '',
    blocks: Array.isArray(f.blocks) ? f.blocks.map((b) => ({
      label: typeof b.label === 'string' ? b.label : '',
      value: typeof b.value === 'string' ? b.value : '',
    })) : [],
    defaultOutputFormat: typeof f.defaultOutputFormat === 'string' ? f.defaultOutputFormat : '',
    updatedAt: typeof f.updatedAt === 'string' ? f.updatedAt : '',
  };
}

export function apbValidateProfile(value) {
  const errors = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['profile must be an object'] };
  }
  if (typeof value.id !== 'string' || !value.id.trim()) errors.push('id is required');
  if (typeof value.name !== 'string' || !value.name.trim()) errors.push('name is required');
  if (value.role !== undefined && typeof value.role !== 'string') errors.push('role must be a string');
  if (value.defaultOutputFormat !== undefined && typeof value.defaultOutputFormat !== 'string') {
    errors.push('defaultOutputFormat must be a string');
  }
  if (!Array.isArray(value.blocks)) {
    errors.push('blocks must be an array');
  } else {
    value.blocks.forEach((b, i) => {
      if (b === null || typeof b !== 'object' || Array.isArray(b)) {
        errors.push(`blocks[${i}] must be an object`);
        return;
      }
      if (typeof b.label !== 'string') errors.push(`blocks[${i}].label must be a string`);
      if (typeof b.value !== 'string') errors.push(`blocks[${i}].value must be a string`);
    });
  }
  return { ok: errors.length === 0, errors };
}

export function apbNonEmptyBlocks(profile) {
  if (!profile || !Array.isArray(profile.blocks)) return [];
  return profile.blocks.filter((b) => b && typeof b.value === 'string' && b.value.trim() !== '');
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add package.json LICENSE src/profiles.js test/profiles.test.js
git commit -m "feat: profile schema, validation and package scaffold"
```

---

### Task 2: Prompt assembler

The heart of the tool. Pure string assembly, fully deterministic.

**Files:**
- Create: `src/assembler.js`
- Test: `test/assembler.test.js`

**Interfaces:**
- Consumes: nothing. Deliberately standalone so it can be tested and reasoned about alone.
- Produces:
  - `APB_SECTION_ORDER: string[]` — `['role','context','task','constraints','done_when','output_format']`
  - `apbToList(value: string[]|string|unknown) -> string[]` — arrays map and trim, strings split on newline, anything else yields `[]`. Blanks discarded.
  - `apbAssemblePrompt(profile: Profile|null, task: Task) -> string` — no trailing newline, sections separated by one blank line, empty sections omitted entirely.

- [ ] **Step 1: Write the failing test**

Create `test/assembler.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/assembler.test.js`
Expected: FAIL with `Cannot find module '../src/assembler.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/assembler.js`:

```js
export const APB_SECTION_ORDER = [
  'role', 'context', 'task', 'constraints', 'done_when', 'output_format',
];

export function apbToList(value) {
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function apbNeutraliseOwnClosingTag(body, tag) {
  return body.split(`</${tag}>`).join(`<\u200B/${tag}>`);
}

function apbRenderBlock(block) {
  if (!block) return '';
  const label = String(block.label == null ? '' : block.label).trim();
  const value = String(block.value == null ? '' : block.value).trim();
  if (!value) return '';
  if (!label) return value;
  if (!value.includes('\n')) return `${label}: ${value}`;
  const indented = value.split('\n').map((line) => `  ${line}`).join('\n');
  return `${label}:\n${indented}`;
}

export function apbAssemblePrompt(profile, task) {
  const p = profile || null;
  const t = task || {};
  const sections = [];

  const role = String(t.roleOverride || '').trim() || String((p && p.role) || '').trim();
  if (role) sections.push(['role', role]);

  const contextLines = [];
  const projectName = String((p && p.name) || '').trim();
  if (projectName) contextLines.push(`Project: ${projectName}`);
  if (p && Array.isArray(p.blocks)) {
    for (const block of p.blocks) {
      const rendered = apbRenderBlock(block);
      if (rendered) contextLines.push(rendered);
    }
  }
  if (contextLines.length) sections.push(['context', contextLines.join('\n')]);

  const goal = String(t.goal || '').trim();
  const detail = String(t.detail || '').trim();
  const body = goal && detail ? `${goal}\n\n${detail}` : goal || detail;
  if (body) sections.push(['task', body]);

  const constraints = apbToList(t.constraints);
  if (constraints.length) {
    sections.push(['constraints', constraints.map((c) => `- ${c}`).join('\n')]);
  }

  const doneWhen = apbToList(t.doneWhen);
  if (doneWhen.length) {
    sections.push(['done_when', doneWhen.map((d) => `- ${d}`).join('\n')]);
  }

  const outputFormat = String(t.outputFormat || '').trim()
    || String((p && p.defaultOutputFormat) || '').trim();
  if (outputFormat) sections.push(['output_format', outputFormat]);

  return sections
    .map(([tag, sectionBody]) => `<${tag}>\n${apbNeutraliseOwnClosingTag(sectionBody, tag)}\n</${tag}>`)
    .join('\n\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/assembler.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 5: Commit**

```bash
git add src/assembler.js test/assembler.test.js
git commit -m "feat: XML-sectioned prompt assembler"
```

---

### Task 3: Gap check

Detects the omissions that cause clarifying questions, and scores completeness.

**Files:**
- Create: `src/gapcheck.js`
- Test: `test/gapcheck.test.js`

**Interfaces:**
- Consumes: `apbNonEmptyBlocks` from `src/profiles.js`, `apbToList` from `src/assembler.js`.
- Produces:
  - `APB_HEDGE_PHRASES: string[]`
  - `APB_SEVERITY_WEIGHT: { high: 20, medium: 10, low: 5 }`
  - `APB_GAP_RULES: Rule[]` where `Rule = { id, severity, requiresProfile: boolean, test(profile, task) -> boolean, message: string }`
  - `apbAnalyzeGaps(profile, task) -> { score: number, gaps: Array<{ id, severity, message }> }` — gaps ordered high, then medium, then low, preserving rule order within a severity.

**Spec clarification resolved here:** the spec says rules fire independently and names only `no-goal`/`thin-goal` as mutually exclusive. Two further rules, `thin-profile` and `no-verification`, describe *profile content*, so when no profile is selected they would merely restate `no-profile` and double-count the penalty. They carry `requiresProfile: true` and are suppressed when `profile` is null. `no-done-when` stays unguarded because the task can satisfy it without a profile.

- [ ] **Step 1: Write the failing test**

Create `test/gapcheck.test.js`:

```js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/gapcheck.test.js`
Expected: FAIL with `Cannot find module '../src/gapcheck.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/gapcheck.js`:

```js
import { apbNonEmptyBlocks } from './profiles.js';
import { apbToList } from './assembler.js';

export const APB_HEDGE_PHRASES = [
  'etc.', 'and so on', 'something like', 'make it better', 'as needed',
];

export const APB_SEVERITY_WEIGHT = { high: 20, medium: 10, low: 5 };

const APB_SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

function apbGoalWords(task) {
  return String((task && task.goal) || '').trim().split(/\s+/).filter(Boolean);
}

function apbBlockMatches(profile, pattern) {
  return apbNonEmptyBlocks(profile).some(
    (b) => pattern.test(String(b.label || '')) || pattern.test(String(b.value || '')),
  );
}

export const APB_GAP_RULES = [
  {
    id: 'no-profile',
    severity: 'high',
    requiresProfile: false,
    test: (p) => !p,
    message: 'No project profile selected. Claude will ask about your stack and conventions.',
  },
  {
    id: 'thin-profile',
    severity: 'high',
    requiresProfile: true,
    test: (p) => apbNonEmptyBlocks(p).length < 3,
    message: 'Profile has fewer than three filled blocks. Claude will ask for the rest.',
  },
  {
    id: 'no-goal',
    severity: 'high',
    requiresProfile: false,
    test: (p, t) => apbGoalWords(t).length === 0,
    message: 'No goal. Without one sentence saying what you want, Claude has nothing to act on.',
  },
  {
    id: 'no-done-when',
    severity: 'high',
    requiresProfile: false,
    test: (p, t) => apbToList(t && t.doneWhen).length === 0 && !apbBlockMatches(p, /done/i),
    message: 'No definition of done. Claude will ask what finished means.',
  },
  {
    id: 'no-verification',
    severity: 'high',
    requiresProfile: true,
    test: (p) => !apbBlockMatches(p, /test|verif|lint/i),
    message: 'Profile names no test, lint or verification command. Claude will ask how to check its work.',
  },
  {
    id: 'thin-goal',
    severity: 'medium',
    requiresProfile: false,
    test: (p, t) => {
      const n = apbGoalWords(t).length;
      return n > 0 && n < 8;
    },
    message: 'Goal is under eight words. Short goals draw clarifying questions.',
  },
  {
    id: 'no-detail',
    severity: 'medium',
    requiresProfile: false,
    test: (p, t) => !String((t && t.detail) || '').trim(),
    message: 'No detail. A goal without background leaves the approach up for guessing.',
  },
  {
    id: 'no-output-format',
    severity: 'medium',
    requiresProfile: false,
    test: (p, t) => !String((t && t.outputFormat) || '').trim()
      && !String((p && p.defaultOutputFormat) || '').trim(),
    message: 'No output format. Say whether you want a plan, a diff, or finished code.',
  },
  {
    id: 'no-constraints',
    severity: 'low',
    requiresProfile: false,
    test: (p, t) => apbToList(t && t.constraints).length === 0,
    message: 'No constraints. Naming the limits up front prevents rework.',
  },
  {
    id: 'vague-language',
    severity: 'low',
    requiresProfile: false,
    test: (p, t) => {
      const text = `${(t && t.goal) || ''} ${(t && t.detail) || ''}`.toLowerCase();
      return APB_HEDGE_PHRASES.some((phrase) => text.includes(phrase));
    },
    message: 'Hedging language found. Phrases like "etc." hide requirements Claude cannot guess.',
  },
];

export function apbAnalyzeGaps(profile, task) {
  const p = profile || null;
  const t = task || {};
  const gaps = [];
  for (const rule of APB_GAP_RULES) {
    if (rule.requiresProfile && !p) continue;
    if (rule.test(p, t)) {
      gaps.push({ id: rule.id, severity: rule.severity, message: rule.message });
    }
  }
  gaps.sort((a, b) => APB_SEVERITY_RANK[a.severity] - APB_SEVERITY_RANK[b.severity]);
  const penalty = gaps.reduce((sum, g) => sum + APB_SEVERITY_WEIGHT[g.severity], 0);
  return { score: Math.max(0, 100 - penalty), gaps };
}
```

Note: `Array.prototype.sort` is stable in Node 18, so rule order is preserved within a severity band.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/gapcheck.test.js`
Expected: PASS, 19 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS, all three files green.

- [ ] **Step 6: Commit**

```bash
git add src/gapcheck.js test/gapcheck.test.js
git commit -m "feat: gap check rules and completeness score"
```

---

### Task 4: Profile export, import and migration

Extends `src/profiles.js`. This is how profiles travel from the personal machine to the work machine, so import must be all-or-nothing.

**Files:**
- Modify: `src/profiles.js` (append; do not alter Task 1 exports)
- Modify: `test/profiles.test.js` (append)

**Interfaces:**
- Consumes: `APB_SCHEMA_VERSION`, `apbValidateProfile`, `apbMakeProfile` from Task 1.
- Produces:
  - `apbExportProfiles(profiles: Profile[]) -> string` — pretty-printed JSON, two-space indent, shape `{ schemaVersion, profiles }`. No timestamp, so export is deterministic and round-trip testable.
  - `apbMigratePayload(payload: object) -> { ok: true, payload } | { ok: false, error: string }`
  - `apbImportProfiles(text: string, existing: Profile[], mode: 'merge'|'replace') -> { ok: true, profiles: Profile[] } | { ok: false, error: string }` — validates the whole payload before returning anything. On `merge`, incoming wins on matching `id`, and existing order is preserved with genuinely new profiles appended.

- [ ] **Step 1: Write the failing test**

Append to `test/profiles.test.js`:

```js
import {
  apbExportProfiles,
  apbImportProfiles,
  apbMigratePayload,
} from '../src/profiles.js';

const mk = (id, name) => apbMakeProfile({ id, name });

test('export produces the agreed envelope, pretty printed', () => {
  const text = apbExportProfiles([mk('p_1', 'ADO')]);
  const parsed = JSON.parse(text);
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.profiles.length, 1);
  assert.ok(text.includes('\n  '), 'should be indented');
});

test('export is deterministic and carries no timestamp', () => {
  const a = apbExportProfiles([mk('p_1', 'ADO')]);
  const b = apbExportProfiles([mk('p_1', 'ADO')]);
  assert.equal(a, b);
  assert.equal(a.includes('exportedAt'), false);
});

test('export then import round-trips to an identical array', () => {
  const original = [
    apbMakeProfile({ id: 'p_1', name: 'ADO', role: 'engineer', blocks: [{ label: 'Stack', value: 'React' }] }),
    mk('p_2', 'Freelance WP'),
  ];
  const result = apbImportProfiles(apbExportProfiles(original), [], 'replace');
  assert.equal(result.ok, true);
  assert.deepEqual(result.profiles, original);
});

test('import rejects unparseable text without touching existing', () => {
  const existing = [mk('p_1', 'ADO')];
  const r = apbImportProfiles('{not json', existing, 'replace');
  assert.equal(r.ok, false);
  assert.ok(r.error.length > 0);
  assert.deepEqual(existing, [mk('p_1', 'ADO')]);
});

test('import rejects a newer schema version and names both versions', () => {
  const text = JSON.stringify({ schemaVersion: 99, profiles: [] });
  const r = apbImportProfiles(text, [], 'replace');
  assert.equal(r.ok, false);
  assert.ok(r.error.includes('99'));
  assert.ok(r.error.includes('1'));
});

test('import rejects a payload with no profiles array', () => {
  assert.equal(apbImportProfiles(JSON.stringify({ schemaVersion: 1 }), [], 'replace').ok, false);
});

test('import is all or nothing when one profile is invalid', () => {
  const text = JSON.stringify({
    schemaVersion: 1,
    profiles: [mk('p_1', 'Good'), { id: '', name: '', blocks: 'bad' }],
  });
  const r = apbImportProfiles(text, [], 'replace');
  assert.equal(r.ok, false);
  assert.ok(r.error.toLowerCase().includes('profile'));
});

test('merge lets the incoming copy win on a matching id and preserves order', () => {
  const existing = [mk('p_1', 'Old One'), mk('p_2', 'Keep Me')];
  const text = apbExportProfiles([mk('p_1', 'New One'), mk('p_3', 'Brand New')]);
  const r = apbImportProfiles(text, existing, 'merge');
  assert.equal(r.ok, true);
  assert.deepEqual(r.profiles.map((p) => p.id), ['p_1', 'p_2', 'p_3']);
  assert.equal(r.profiles[0].name, 'New One');
  assert.equal(r.profiles[1].name, 'Keep Me');
});

test('replace discards everything that existed', () => {
  const r = apbImportProfiles(apbExportProfiles([mk('p_9', 'Only')]), [mk('p_1', 'Gone')], 'replace');
  assert.equal(r.ok, true);
  assert.deepEqual(r.profiles.map((p) => p.id), ['p_9']);
});

test('an unknown mode is rejected rather than guessed at', () => {
  const r = apbImportProfiles(apbExportProfiles([mk('p_1', 'X')]), [], 'sideways');
  assert.equal(r.ok, false);
});

test('migratePayload passes the current version through unchanged', () => {
  const payload = { schemaVersion: 1, profiles: [] };
  const r = apbMigratePayload(payload);
  assert.equal(r.ok, true);
  assert.equal(r.payload.schemaVersion, 1);
});

test('migratePayload rejects a future version', () => {
  assert.equal(apbMigratePayload({ schemaVersion: 2, profiles: [] }).ok, false);
});

test('migratePayload rejects a missing or non-numeric version', () => {
  assert.equal(apbMigratePayload({ profiles: [] }).ok, false);
  assert.equal(apbMigratePayload({ schemaVersion: 'one', profiles: [] }).ok, false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/profiles.test.js`
Expected: FAIL. `apbExportProfiles is not a function`, or an import error naming the missing exports.

- [ ] **Step 3: Write minimal implementation**

Append to `src/profiles.js`:

```js
const APB_MIGRATIONS = [];

export function apbExportProfiles(profiles) {
  const list = Array.isArray(profiles) ? profiles : [];
  return JSON.stringify({ schemaVersion: APB_SCHEMA_VERSION, profiles: list }, null, 2);
}

export function apbMigratePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'File is not a profile export.' };
  }
  const version = payload.schemaVersion;
  if (typeof version !== 'number' || !Number.isFinite(version)) {
    return { ok: false, error: 'File has no usable schemaVersion.' };
  }
  if (version > APB_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `File uses schema version ${version}, but this build understands version ${APB_SCHEMA_VERSION}. Update the tool and try again.`,
    };
  }
  let current = payload;
  for (let v = version; v < APB_SCHEMA_VERSION; v += 1) {
    const migrate = APB_MIGRATIONS[v];
    if (typeof migrate !== 'function') {
      return { ok: false, error: `No migration from schema version ${v}.` };
    }
    current = migrate(current);
  }
  return { ok: true, payload: { ...current, schemaVersion: APB_SCHEMA_VERSION } };
}

export function apbImportProfiles(text, existing, mode) {
  if (mode !== 'merge' && mode !== 'replace') {
    return { ok: false, error: `Unknown import mode "${mode}".` };
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return { ok: false, error: `File is not valid JSON: ${err.message}` };
  }
  const migrated = apbMigratePayload(parsed);
  if (!migrated.ok) return migrated;

  const incoming = migrated.payload.profiles;
  if (!Array.isArray(incoming)) {
    return { ok: false, error: 'File contains no profiles array.' };
  }

  const normalised = [];
  for (let i = 0; i < incoming.length; i += 1) {
    const candidate = apbMakeProfile(incoming[i]);
    const check = apbValidateProfile(candidate);
    if (!check.ok) {
      return { ok: false, error: `Profile ${i + 1} is invalid: ${check.errors.join(', ')}. Nothing was imported.` };
    }
    normalised.push(candidate);
  }

  if (mode === 'replace') return { ok: true, profiles: normalised };

  const byId = new Map(normalised.map((p) => [p.id, p]));
  const merged = (Array.isArray(existing) ? existing : []).map(
    (p) => (byId.has(p.id) ? byId.get(p.id) : p),
  );
  const existingIds = new Set(merged.map((p) => p.id));
  for (const p of normalised) {
    if (!existingIds.has(p.id)) merged.push(p);
  }
  return { ok: true, profiles: merged };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, all files green.

- [ ] **Step 5: Commit**

```bash
git add src/profiles.js test/profiles.test.js
git commit -m "feat: profile export, import and schema migration"
```

---

### Task 5: Storage with in-memory fallback

Impure, deliberately thin, not unit tested. The rule it must honour: every read and write is wrapped, and a hostile storage environment degrades rather than breaks.

**Files:**
- Create: `src/storage.js`

**Interfaces:**
- Consumes: `apbMakeProfile` from `src/profiles.js`.
- Produces:
  - `APB_KEYS = { profiles: 'apb.profiles.v1', settings: 'apb.settings.v1', draft: 'apb.draft.v1' }`
  - `apbStorageAvailable() -> boolean` — computed once at load.
  - `apbGenerateId() -> string` — `p_` plus eight hex characters. Impure by design, which is why it lives here and not in `profiles.js`.
  - `apbNowIso() -> string` — impure clock, kept out of the pure modules for the same reason.
  - `apbLoad(key: string, fallback: any) -> any`
  - `apbSave(key: string, value: any) -> boolean`
  - `apbStarterProfiles() -> Profile[]` — two seeded examples, ids generated at call time.

- [ ] **Step 1: Write the implementation**

There is no test step for this task. `storage.js` is browser-only glue with no logic worth asserting, and the spec accepts that trade. Its correctness is verified by the manual checks in Task 9.

Create `src/storage.js`:

```js
import { apbMakeProfile } from './profiles.js';

export const APB_KEYS = {
  profiles: 'apb.profiles.v1',
  settings: 'apb.settings.v1',
  draft: 'apb.draft.v1',
};

const apbMemoryStore = new Map();
let apbHasLocalStorage = false;

try {
  const probe = '__apb_probe__';
  window.localStorage.setItem(probe, '1');
  window.localStorage.removeItem(probe);
  apbHasLocalStorage = true;
} catch (err) {
  apbHasLocalStorage = false;
}

export function apbStorageAvailable() {
  return apbHasLocalStorage;
}

export function apbGenerateId() {
  const bytes = new Uint8Array(4);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return `p_${Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function apbNowIso() {
  return new Date().toISOString();
}

export function apbLoad(key, fallback) {
  try {
    const raw = apbHasLocalStorage
      ? window.localStorage.getItem(key)
      : (apbMemoryStore.has(key) ? apbMemoryStore.get(key) : null);
    if (raw === null || raw === undefined) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[apb] discarding unreadable value at ${key}:`, err.message);
    return fallback;
  }
}

export function apbSave(key, value) {
  try {
    const raw = JSON.stringify(value);
    if (apbHasLocalStorage) window.localStorage.setItem(key, raw);
    else apbMemoryStore.set(key, raw);
    return true;
  } catch (err) {
    console.warn(`[apb] could not save ${key}:`, err.message);
    return false;
  }
}

export function apbStarterProfiles() {
  return [
    apbMakeProfile({
      id: apbGenerateId(),
      name: 'Example: web app codebase',
      role: 'senior engineer working in an existing codebase',
      blocks: [
        { label: 'Stack', value: 'Describe the language, framework and versions.' },
        { label: 'Repo', value: 'Where the code lives and how it is laid out.' },
        { label: 'Testing', value: 'The command to run tests, and to run one test.' },
        { label: 'Conventions', value: 'Branching, review and commit rules.' },
        { label: 'Do not touch', value: 'Paths that are off limits.' },
        { label: 'Done when', value: 'What has to be true before this is finished.' },
      ],
      defaultOutputFormat: 'Plan first, wait for my approval, then implement.',
      updatedAt: apbNowIso(),
    }),
    apbMakeProfile({
      id: apbGenerateId(),
      name: 'Example: writing project',
      role: 'editor who matches an established voice',
      blocks: [
        { label: 'Audience', value: 'Who reads this and what they already know.' },
        { label: 'Voice', value: 'The rules the writing has to follow.' },
        { label: 'Never do', value: 'Words, formats and habits to avoid.' },
        { label: 'Done when', value: 'What a finished piece looks like.' },
      ],
      defaultOutputFormat: 'Draft in full, then list what you were unsure about.',
      updatedAt: apbNowIso(),
    }),
  ];
}
```

- [ ] **Step 2: Verify the module parses and stays import-clean**

Run: `node --input-type=module -e "import('./src/storage.js').then(m => console.log('parses ok, storageAvailable =', m.apbStorageAvailable())).catch(e => { console.error('FAILED', e); process.exit(1); })"`
Expected: prints `parses ok, storageAvailable = false`. Under Node there is no `window`, and the wrapped probe is what turns that into a clean `false` instead of a crash. That is the fallback path working.

- [ ] **Step 3: Confirm the pure modules stayed pure**

Run: `grep -nE 'window|document|localStorage|fetch\(|Math\.random|Date\.now|new Date' src/profiles.js src/assembler.js src/gapcheck.js`
Expected: no output. Any hit is a violation of the global constraints and must be moved into `storage.js`.

- [ ] **Step 4: Commit**

```bash
git add src/storage.js
git commit -m "feat: storage wrapper with in-memory fallback and starter profiles"
```

---

### Task 6: Build pipeline and dev server

Turns the modules into one portable file, and makes development serve exactly what ships.

**Files:**
- Create: `src/shell.html`
- Create: `src/styles.css`
- Create: `build.js`
- Create: `dev-server.js`
- Test: `test/build.test.js`

**Interfaces:**
- Consumes: every `src/*.js` module by file path only, never by import.
- Produces:
  - `apbStripModuleSyntax(source: string) -> string` — removes `import ... from '...'` statements and leading `export ` keywords.
  - `apbCollectTopLevelNames(source: string) -> string[]`
  - `apbBuildHtml() -> string` — the complete document.
  - CLI: `node build.js` writes `dist/prompt-builder.html`.

**Refinement on the spec:** the spec called `dev-server.js` a static file server. It instead calls `apbBuildHtml()` on every request. Same zero dependencies, and it removes any chance of development and distribution diverging.

- [ ] **Step 1: Write the failing test**

Create `test/build.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apbStripModuleSyntax, apbCollectTopLevelNames, apbBuildHtml } from '../build.js';

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
  assert.ok(html.includes('apbAnalyzeGaps'));
  assert.ok(html.includes('<style>'));
});

test('build is deterministic', () => {
  assert.equal(apbBuildHtml(), apbBuildHtml());
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/build.test.js`
Expected: FAIL with `Cannot find module '../build.js'`.

- [ ] **Step 3: Write src/shell.html**

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI Prompt Builder</title>
<!--INJECT:STYLES-->
</head>
<body>
<header class="apb-header">
  <h1>AI Prompt Builder</h1>
  <div class="apb-header-actions">
    <button type="button" id="apb-settings-btn">Settings</button>
    <span class="apb-version"><!--INJECT:VERSION--></span>
  </div>
</header>

<p id="apb-storage-banner" class="apb-banner" hidden></p>

<main class="apb-layout">
  <section class="apb-pane" id="apb-profile-pane" aria-label="Project profile"></section>
  <section class="apb-pane" id="apb-task-pane" aria-label="Task"></section>
  <section class="apb-pane" id="apb-output-pane" aria-label="Generated prompt"></section>
</main>

<dialog id="apb-settings-dialog"></dialog>

<!--INJECT:SCRIPT-->
</body>
</html>
```

- [ ] **Step 4: Write a minimal src/styles.css**

Enough for the build to inline something real. Task 7 replaces it with the full sheet.

```css
:root {
  --apb-bg: #ffffff;
  --apb-fg: #1b1b1b;
  --apb-muted: #5f6368;
  --apb-line: #d9dce1;
  --apb-accent: #2f5fd0;
  --apb-high: #b3261e;
  --apb-medium: #9a6700;
  --apb-low: #5f6368;
  color-scheme: light dark;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: var(--apb-bg);
  color: var(--apb-fg);
}
.apb-layout { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 1px; }
.apb-pane { padding: 16px; min-width: 0; }
[hidden] { display: none !important; }
```

- [ ] **Step 5: Write build.js**

```js
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APB_ROOT = dirname(fileURLToPath(import.meta.url));

export const APB_MODULE_ORDER = [
  'profiles.js', 'assembler.js', 'gapcheck.js', 'storage.js', 'polish.js', 'ui.js',
];

export function apbStripModuleSyntax(source) {
  return source
    .replace(/^import\s[\s\S]*?from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+(?=(?:const|let|var|function|class|async)\b)/gm, '');
}

export function apbCollectTopLevelNames(source) {
  const names = [];
  const pattern = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm;
  let match = pattern.exec(source);
  while (match !== null) {
    names.push(match[1]);
    match = pattern.exec(source);
  }
  return names;
}

function apbReadSrc(name) {
  return readFileSync(join(APB_ROOT, 'src', name), 'utf8');
}

export function apbBuildHtml() {
  const pkg = JSON.parse(readFileSync(join(APB_ROOT, 'package.json'), 'utf8'));
  const styles = apbReadSrc('styles.css');

  const seen = new Map();
  const chunks = [];
  for (const name of APB_MODULE_ORDER) {
    const raw = apbReadSrc(name);
    for (const declared of apbCollectTopLevelNames(raw)) {
      if (seen.has(declared)) {
        throw new Error(
          `Duplicate top-level name "${declared}" in ${name}; already declared in ${seen.get(declared)}. `
          + 'Concatenated modules share one scope, so every top-level name must be unique.',
        );
      }
      seen.set(declared, name);
    }
    chunks.push(`/* ---- ${name} ---- */\n${apbStripModuleSyntax(raw).trim()}`);
  }

  const script = chunks.join('\n\n');
  return apbReadSrc('shell.html')
    .replace('<!--INJECT:STYLES-->', `<style>\n${styles.trim()}\n</style>`)
    .replace('<!--INJECT:VERSION-->', `v${pkg.version}`)
    .replace('<!--INJECT:SCRIPT-->', `<script>\n${script}\n</script>`);
}

const APB_IS_CLI = process.argv[1] && process.argv[1].endsWith('build.js');
if (APB_IS_CLI) {
  const html = apbBuildHtml();
  const outDir = join(APB_ROOT, 'dist');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'prompt-builder.html');
  writeFileSync(outFile, html, 'utf8');
  console.log(`Built ${outFile} (${html.length.toLocaleString()} bytes)`);
}
```

- [ ] **Step 6: Create the two modules the build expects but that do not exist yet**

The build reads all six modules. Create stubs so it can run; Tasks 7 and 8 fill them in.

`src/polish.js`:

```js
export const APB_POLISH_MODEL = 'claude-sonnet-5';
```

`src/ui.js`:

```js
const APB_UI_READY = true;
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test test/build.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 8: Write dev-server.js**

```js
import { createServer } from 'node:http';
import { apbBuildHtml } from './build.js';

const APB_PORT = Number(process.env.APB_PORT || 4518);

createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/index.html') {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }
  try {
    const html = apbBuildHtml();
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`Build failed:\n\n${err.stack}`);
  }
}).listen(APB_PORT, '127.0.0.1', () => {
  console.log(`AI Prompt Builder dev server: http://127.0.0.1:${APB_PORT}`);
});
```

- [ ] **Step 9: Verify the build and the server end to end**

Run: `npm run build && test -s dist/prompt-builder.html && echo BUILD_OK`
Expected: prints the byte count and `BUILD_OK`.

Run: `node dev-server.js & sleep 1; curl -sf http://127.0.0.1:4518 | head -3; kill %1`
Expected: the first lines of the document, starting `<!doctype html>`.

- [ ] **Step 10: Commit**

```bash
git add src/shell.html src/styles.css src/polish.js src/ui.js build.js dev-server.js test/build.test.js
git commit -m "feat: single-file build pipeline and dev server"
```

---

### Task 7: User interface

The largest task, and the only one with no unit tests. `ui.js` holds wiring only. If a piece of logic here feels worth testing, that is a signal it belongs in a pure module instead.

**Files:**
- Modify: `src/ui.js` (replace the Task 6 stub entirely)
- Modify: `src/styles.css` (replace the Task 6 minimal sheet entirely)

**Interfaces:**
- Consumes: `apbAssemblePrompt` and `apbToList` from the assembler, `apbAnalyzeGaps` from the gap check, `apbMakeProfile`, `apbExportProfiles` and `apbImportProfiles` from profiles, and `APB_KEYS`, `apbLoad`, `apbSave`, `apbGenerateId`, `apbNowIso`, `apbStorageAvailable`, `apbStarterProfiles` from storage.
- Produces: nothing importable. This module is the entry point and runs on load.

- [ ] **Step 1: Replace src/ui.js**

```js
import { apbAssemblePrompt, apbToList } from './assembler.js';
import { apbAnalyzeGaps } from './gapcheck.js';
import { apbMakeProfile, apbExportProfiles, apbImportProfiles } from './profiles.js';
import {
  APB_KEYS, apbLoad, apbSave, apbGenerateId, apbNowIso,
  apbStorageAvailable, apbStarterProfiles,
} from './storage.js';

const APB_EMPTY_TASK = {
  goal: '', detail: '', constraints: '', doneWhen: '', outputFormat: '', roleOverride: '',
};

const apbState = {
  profiles: [],
  selectedId: '',
  task: { ...APB_EMPTY_TASK },
  lastAssembled: '',
  polished: '',
};

function apbEl(id) { return document.getElementById(id); }

function apbEscape(text) {
  return String(text).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function apbSelectedProfile() {
  return apbState.profiles.find((p) => p.id === apbState.selectedId) || null;
}

function apbTaskForAssembly() {
  const t = apbState.task;
  return {
    goal: t.goal,
    detail: t.detail,
    constraints: apbToList(t.constraints),
    doneWhen: apbToList(t.doneWhen),
    outputFormat: t.outputFormat,
    roleOverride: t.roleOverride,
  };
}

function apbPersist() {
  apbSave(APB_KEYS.profiles, apbState.profiles);
  apbSave(APB_KEYS.draft, { task: apbState.task, selectedId: apbState.selectedId });
}

/* ---------- profile pane ---------- */

function apbRenderProfilePane() {
  const profile = apbSelectedProfile();
  const options = apbState.profiles
    .map((p) => `<option value="${apbEscape(p.id)}"${p.id === apbState.selectedId ? ' selected' : ''}>${apbEscape(p.name)}</option>`)
    .join('');

  const blocks = profile
    ? profile.blocks.map((b, i) => `
        <div class="apb-block" data-index="${i}">
          <input class="apb-block-label" data-index="${i}" value="${apbEscape(b.label)}" placeholder="Label, for example Stack" aria-label="Block label">
          <textarea class="apb-block-value" data-index="${i}" rows="2" placeholder="Value" aria-label="Block value">${apbEscape(b.value)}</textarea>
          <div class="apb-block-tools">
            <button type="button" data-act="block-up" data-index="${i}" aria-label="Move block up">&uarr;</button>
            <button type="button" data-act="block-down" data-index="${i}" aria-label="Move block down">&darr;</button>
            <button type="button" data-act="block-delete" data-index="${i}" aria-label="Delete block">Delete</button>
          </div>
        </div>`).join('')
    : '';

  apbEl('apb-profile-pane').innerHTML = `
    <h2>Project profile</h2>
    <div class="apb-row">
      <select id="apb-profile-select" aria-label="Select profile">
        <option value="">No profile</option>${options}
      </select>
      <button type="button" data-act="profile-new">New</button>
    </div>
    ${profile ? `
      <label class="apb-field">Name
        <input id="apb-profile-name" value="${apbEscape(profile.name)}">
      </label>
      <label class="apb-field">Role
        <input id="apb-profile-role" value="${apbEscape(profile.role)}" placeholder="senior React engineer">
      </label>
      <label class="apb-field">Default output format
        <textarea id="apb-profile-output" rows="2">${apbEscape(profile.defaultOutputFormat)}</textarea>
      </label>
      <h3>Context blocks</h3>
      <div id="apb-blocks">${blocks}</div>
      <button type="button" data-act="block-add">Add block</button>
      <div class="apb-row apb-row-end">
        <button type="button" data-act="profile-duplicate">Duplicate</button>
        <button type="button" data-act="profile-delete" class="apb-danger">Delete</button>
      </div>` : '<p class="apb-muted">Create a profile to store the context you would otherwise retype every time.</p>'}
    <div class="apb-row apb-row-end">
      <button type="button" data-act="profiles-export">Export all</button>
      <button type="button" data-act="profiles-import">Import</button>
      <input type="file" id="apb-import-file" accept="application/json,.json" hidden>
    </div>`;
}

/* ---------- task pane ---------- */

function apbRenderTaskPane() {
  const t = apbState.task;
  apbEl('apb-task-pane').innerHTML = `
    <h2>Task</h2>
    <label class="apb-field">Goal
      <input id="apb-task-goal" value="${apbEscape(t.goal)}" placeholder="One sentence saying what you want">
    </label>
    <label class="apb-field">Detail
      <textarea id="apb-task-detail" rows="5" placeholder="Background, the shape of the work, anything already ruled out">${apbEscape(t.detail)}</textarea>
    </label>
    <label class="apb-field">Constraints, one per line
      <textarea id="apb-task-constraints" rows="3">${apbEscape(t.constraints)}</textarea>
    </label>
    <label class="apb-field">Done when, one per line
      <textarea id="apb-task-doneWhen" rows="3">${apbEscape(t.doneWhen)}</textarea>
    </label>
    <label class="apb-field">Output format
      <textarea id="apb-task-outputFormat" rows="2" placeholder="Leave blank to use the profile default">${apbEscape(t.outputFormat)}</textarea>
    </label>
    <label class="apb-field">Role override
      <input id="apb-task-roleOverride" value="${apbEscape(t.roleOverride)}" placeholder="Leave blank to use the profile role">
    </label>
    <button type="button" data-act="task-clear">Clear task</button>`;
}

/* ---------- output pane ---------- */

function apbRenderOutputPane() {
  const profile = apbSelectedProfile();
  const prompt = apbAssemblePrompt(profile, apbTaskForAssembly());
  apbState.lastAssembled = prompt;
  const shown = apbState.polished || prompt;
  const { score, gaps } = apbAnalyzeGaps(profile, apbTaskForAssembly());

  const gapList = gaps.length
    ? `<ul class="apb-gaps">${gaps.map((g) => `<li class="apb-gap apb-${g.severity}"><span class="apb-sev">${g.severity}</span> ${apbEscape(g.message)}</li>`).join('')}</ul>`
    : '<p class="apb-ok">Nothing obvious missing. Claude should not need to ask.</p>';

  apbEl('apb-output-pane').innerHTML = `
    <h2>Prompt</h2>
    <div class="apb-score" role="status">
      <div class="apb-meter"><div class="apb-meter-fill" style="width:${score}%"></div></div>
      <span>Completeness ${score}%</span>
    </div>
    ${gapList}
    ${apbState.polished ? '<p class="apb-note">Showing the polished version.</p>' : ''}
    <textarea id="apb-output" rows="20" readonly aria-label="Generated prompt">${apbEscape(shown)}</textarea>
    <div class="apb-row apb-row-end">
      <button type="button" data-act="copy" ${shown ? '' : 'disabled'}>Copy</button>
      <button type="button" data-act="polish" id="apb-polish-btn">Polish</button>
      ${apbState.polished ? '<button type="button" data-act="undo-polish">Undo polish</button>' : ''}
    </div>
    <p id="apb-output-status" class="apb-status" role="status"></p>`;

  apbRefreshPolishButton();
}

function apbRenderAll() {
  apbRenderProfilePane();
  apbRenderTaskPane();
  apbRenderOutputPane();
}

/* ---------- events ---------- */

function apbUpdateProfile(mutate) {
  const profile = apbSelectedProfile();
  if (!profile) return;
  mutate(profile);
  profile.updatedAt = apbNowIso();
  apbPersist();
  apbRenderAll();
}

function apbHandleAction(act, target) {
  const idx = Number(target.dataset.index);
  switch (act) {
    case 'profile-new': {
      const created = apbMakeProfile({ id: apbGenerateId(), name: 'New profile', updatedAt: apbNowIso() });
      apbState.profiles.push(created);
      apbState.selectedId = created.id;
      apbPersist();
      apbRenderAll();
      break;
    }
    case 'profile-duplicate': {
      const source = apbSelectedProfile();
      if (!source) return;
      const copy = apbMakeProfile({ ...source, id: apbGenerateId(), name: `${source.name} copy`, updatedAt: apbNowIso() });
      apbState.profiles.push(copy);
      apbState.selectedId = copy.id;
      apbPersist();
      apbRenderAll();
      break;
    }
    case 'profile-delete': {
      const profile = apbSelectedProfile();
      if (!profile) return;
      apbState.profiles = apbState.profiles.filter((p) => p.id !== profile.id);
      apbState.selectedId = '';
      apbPersist();
      apbRenderAll();
      break;
    }
    case 'block-add':
      apbUpdateProfile((p) => p.blocks.push({ label: '', value: '' }));
      break;
    case 'block-delete':
      apbUpdateProfile((p) => p.blocks.splice(idx, 1));
      break;
    case 'block-up':
      if (idx > 0) apbUpdateProfile((p) => p.blocks.splice(idx - 1, 0, p.blocks.splice(idx, 1)[0]));
      break;
    case 'block-down':
      apbUpdateProfile((p) => { if (idx < p.blocks.length - 1) p.blocks.splice(idx + 1, 0, p.blocks.splice(idx, 1)[0]); });
      break;
    case 'task-clear':
      apbState.task = { ...APB_EMPTY_TASK };
      apbState.polished = '';
      apbPersist();
      apbRenderAll();
      break;
    case 'copy':
      apbCopyOutput();
      break;
    case 'undo-polish':
      apbState.polished = '';
      apbRenderOutputPane();
      break;
    case 'polish':
      apbRunPolish();
      break;
    case 'profiles-export':
      apbDownloadExport();
      break;
    case 'profiles-import':
      apbEl('apb-import-file').click();
      break;
    default:
      break;
  }
}

function apbSetStatus(message, isError) {
  const node = apbEl('apb-output-status');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('apb-error', Boolean(isError));
}

async function apbCopyOutput() {
  const text = apbEl('apb-output').value;
  try {
    await navigator.clipboard.writeText(text);
    apbSetStatus('Copied. Paste it into Claude.', false);
  } catch (err) {
    const box = apbEl('apb-output');
    box.removeAttribute('readonly');
    box.focus();
    box.select();
    apbSetStatus('Clipboard blocked. The prompt is selected, press Cmd or Ctrl plus C.', true);
  }
}

function apbDownloadExport() {
  const text = apbExportProfiles(apbState.profiles);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'ai-prompt-builder-profiles.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function apbWireImport() {
  apbEl('apb-import-file').addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const mode = window.confirm('OK to merge with your existing profiles. Cancel to replace them all.')
        ? 'merge' : 'replace';
      const result = apbImportProfiles(String(reader.result), apbState.profiles, mode);
      if (!result.ok) {
        window.alert(`Import failed. ${result.error}`);
        return;
      }
      apbState.profiles = result.profiles;
      if (!apbState.profiles.some((p) => p.id === apbState.selectedId)) apbState.selectedId = '';
      apbPersist();
      apbRenderAll();
    };
    reader.readAsText(file);
    event.target.value = '';
  });
}

const APB_TASK_FIELDS = ['goal', 'detail', 'constraints', 'doneWhen', 'outputFormat', 'roleOverride'];

function apbWireDelegation() {
  document.body.addEventListener('click', (event) => {
    const target = event.target.closest('[data-act]');
    if (target) apbHandleAction(target.dataset.act, target);
  });

  document.body.addEventListener('input', (event) => {
    const el = event.target;

    for (const field of APB_TASK_FIELDS) {
      if (el.id === `apb-task-${field}`) {
        apbState.task[field] = el.value;
        apbState.polished = '';
        apbSave(APB_KEYS.draft, { task: apbState.task, selectedId: apbState.selectedId });
        apbRenderOutputPane();
        return;
      }
    }

    const profile = apbSelectedProfile();
    if (!profile) return;

    if (el.id === 'apb-profile-name') { profile.name = el.value; apbSyncProfileSelectLabel(profile); }
    else if (el.id === 'apb-profile-role') profile.role = el.value;
    else if (el.id === 'apb-profile-output') profile.defaultOutputFormat = el.value;
    else if (el.classList.contains('apb-block-label')) profile.blocks[Number(el.dataset.index)].label = el.value;
    else if (el.classList.contains('apb-block-value')) profile.blocks[Number(el.dataset.index)].value = el.value;
    else return;

    profile.updatedAt = apbNowIso();
    apbPersist();
    apbRenderOutputPane();
  });

  document.body.addEventListener('change', (event) => {
    if (event.target.id !== 'apb-profile-select') return;
    apbState.selectedId = event.target.value;
    apbState.polished = '';
    apbPersist();
    apbRenderAll();
  });
}

function apbSyncProfileSelectLabel(profile) {
  const select = apbEl('apb-profile-select');
  if (!select) return;
  const option = Array.from(select.options).find((o) => o.value === profile.id);
  if (option) option.textContent = profile.name;
}

/* ---------- boot ---------- */

function apbBoot() {
  if (!apbStorageAvailable()) {
    const banner = apbEl('apb-storage-banner');
    banner.textContent = 'Browser storage is unavailable, so nothing will be saved when you close this tab. Export your profiles before leaving.';
    banner.hidden = false;
  }

  const settings = apbLoad(APB_KEYS.settings, {});
  let profiles = apbLoad(APB_KEYS.profiles, null);
  if (!Array.isArray(profiles)) {
    profiles = settings.seeded ? [] : apbStarterProfiles();
    apbSave(APB_KEYS.settings, { ...settings, seeded: true });
  }
  apbState.profiles = profiles.map((p) => apbMakeProfile(p));

  const draft = apbLoad(APB_KEYS.draft, {});
  apbState.task = { ...APB_EMPTY_TASK, ...(draft.task || {}) };
  apbState.selectedId = apbState.profiles.some((p) => p.id === draft.selectedId)
    ? draft.selectedId
    : (apbState.profiles[0] ? apbState.profiles[0].id : '');

  apbRenderAll();
  apbWireDelegation();
  apbWireImport();
  apbWireSettings();
}

document.addEventListener('DOMContentLoaded', apbBoot);
```

Note: `apbRefreshPolishButton`, `apbRunPolish` and `apbWireSettings` are defined in Task 8. Between Task 7 and Task 8 the page will throw a reference error on load. That is expected, and Task 8 is not optional.

- [ ] **Step 2: Replace src/styles.css with the full sheet**

Build on the Task 6 custom properties. Requirements the sheet must meet, verified by eye in Step 3:

- Three columns on wide screens, one column stacked below 900px.
- Both themes handled through `prefers-color-scheme`, with every colour defined as a custom property on `:root` first and only overridden inside the dark block.
- The output textarea is monospace, fills its pane, and scrolls rather than growing the page.
- Gap severities are distinguishable without colour alone: the severity word is printed next to each message.
- The completeness meter is a plain filled bar with the numeric percentage beside it.
- Focus styles are visible on every interactive element.
- No external fonts and no external images.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`
Then open `http://127.0.0.1:4518` and confirm, with Task 8 not yet done, that the three panes render and the console shows only the expected `apbWireSettings is not defined` error.

- [ ] **Step 4: Commit**

```bash
git add src/ui.js src/styles.css
git commit -m "feat: profile, task and prompt panes with live gap check"
```

---

### Task 8: Optional AI polish and settings

Isolated so the tool is complete without it. The honesty requirements here are part of the deliverable, not decoration.

**Files:**
- Modify: `src/polish.js` (replace the Task 6 stub entirely)
- Modify: `src/ui.js` (append the three functions Task 7 referenced)

**Interfaces:**
- Consumes: `APB_KEYS`, `apbLoad`, `apbSave` from storage.
- Produces:
  - `APB_POLISH_MODEL = 'claude-sonnet-5'`
  - `apbPolishAvailability() -> { ok: boolean, reason: string }` — checks the `file://` origin first, then the key.
  - `apbPolishPrompt(prompt: string, apiKey: string) -> Promise<string>` — resolves with the rewrite, rejects with a readable Error.

- [ ] **Step 1: Replace src/polish.js**

```js
import { APB_KEYS, apbLoad } from './storage.js';

export const APB_POLISH_MODEL = 'claude-sonnet-5';
export const APB_POLISH_ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const APB_POLISH_VERSION = '2023-06-01';

const APB_POLISH_SYSTEM = [
  'You tighten prompts. Rewrite the prompt you are given so it is clearer and more direct.',
  'Keep every XML section and every section tag exactly as it is.',
  'Keep every fact, path, command, constraint and requirement. Add nothing that is not already there.',
  'Do not answer the prompt. Return only the rewritten prompt, with no preamble and no code fence.',
].join(' ');

export function apbPolishAvailability() {
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
    return {
      ok: false,
      reason: 'Polish needs the hosted version. Opened from a local file, the browser blocks the API call.',
    };
  }
  const settings = apbLoad(APB_KEYS.settings, {});
  if (!settings.apiKey) {
    return { ok: false, reason: 'Add an Anthropic API key in Settings to enable Polish.' };
  }
  return { ok: true, reason: '' };
}

export async function apbPolishPrompt(prompt, apiKey) {
  let response;
  try {
    response = await fetch(APB_POLISH_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': APB_POLISH_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: APB_POLISH_MODEL,
        max_tokens: 2048,
        system: APB_POLISH_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    throw new Error(`Could not reach the API: ${err.message}`);
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body && body.error && body.error.message) detail = body.error.message;
    } catch (err) { /* keep the status line */ }
    throw new Error(detail);
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
    .trim();
  if (!text) throw new Error('The API returned an empty response.');
  return text;
}
```

- [ ] **Step 2: Append the settings and polish wiring to src/ui.js**

Add these imports at the top of `src/ui.js`, alongside the existing ones:

```js
import { apbPolishAvailability, apbPolishPrompt, APB_POLISH_MODEL } from './polish.js';
```

Append to the end of `src/ui.js`, before the `DOMContentLoaded` line:

```js
function apbRefreshPolishButton() {
  const button = apbEl('apb-polish-btn');
  if (!button) return;
  const availability = apbPolishAvailability();
  button.disabled = !availability.ok || !apbState.lastAssembled;
  button.title = availability.ok
    ? `Rewrite with ${APB_POLISH_MODEL}`
    : availability.reason;
}

async function apbRunPolish() {
  const availability = apbPolishAvailability();
  if (!availability.ok) {
    apbSetStatus(availability.reason, true);
    return;
  }
  const button = apbEl('apb-polish-btn');
  button.disabled = true;
  apbSetStatus(`Polishing with ${APB_POLISH_MODEL}...`, false);
  try {
    const settings = apbLoad(APB_KEYS.settings, {});
    const polished = await apbPolishPrompt(apbState.lastAssembled, settings.apiKey);
    apbState.polished = polished;
    apbRenderOutputPane();
    apbSetStatus('Polished. Undo restores the assembled version.', false);
  } catch (err) {
    apbSetStatus(`Polish failed, your prompt is unchanged. ${err.message}`, true);
  } finally {
    apbRefreshPolishButton();
  }
}

function apbWireSettings() {
  const dialog = apbEl('apb-settings-dialog');
  const settings = apbLoad(APB_KEYS.settings, {});

  dialog.innerHTML = `
    <form method="dialog" class="apb-settings">
      <h2>Settings</h2>
      <label class="apb-field">Anthropic API key
        <input type="password" id="apb-api-key" value="${apbEscape(settings.apiKey || '')}" placeholder="sk-ant-...">
      </label>
      <p class="apb-warn">
        This key is stored in this browser's local storage on this device, unencrypted.
        Anyone with access to this browser profile can read it. Leave it blank to use the
        tool without Polish, which changes nothing else.
      </p>
      <p class="apb-muted">Polish uses ${apbEscape(APB_POLISH_MODEL)}. It is the only network call this tool ever makes.</p>
      <div class="apb-row apb-row-end">
        <button type="button" data-act="settings-clear">Clear key</button>
        <button value="save">Save</button>
      </div>
    </form>`;

  apbEl('apb-settings-btn').addEventListener('click', () => dialog.showModal());

  dialog.addEventListener('click', (event) => {
    if (event.target.dataset.act !== 'settings-clear') return;
    apbEl('apb-api-key').value = '';
  });

  dialog.addEventListener('close', () => {
    const key = apbEl('apb-api-key').value.trim();
    apbSave(APB_KEYS.settings, { ...apbLoad(APB_KEYS.settings, {}), apiKey: key });
    apbRefreshPolishButton();
  });
}
```

- [ ] **Step 3: Confirm the build still rejects nothing and the page loads clean**

Run: `npm run build`
Expected: success. A duplicate-name error here means a helper was declared twice; rename rather than deleting the check.

Run: `npm run dev`, open the page, and confirm the console is clear and Polish is disabled with a tooltip explaining why.

- [ ] **Step 4: Verify the file:// path behaves**

Run: `npm run build && open dist/prompt-builder.html`
Expected: the page works fully, and Polish is disabled with the local-file explanation rather than failing on click.

- [ ] **Step 5: Commit**

```bash
git add src/polish.js src/ui.js
git commit -m "feat: optional AI polish with explicit key storage warning"
```

---

### Task 9: README, continuous integration and acceptance

**Files:**
- Create: `README.md`
- Create: `.github/workflows/ci.yml`
- Modify: `.gitignore` (confirm `dist/` is listed)

**Interfaces:**
- Consumes: everything.
- Produces: a repository ready to push to `JonImmsWordpressDev`.

- [ ] **Step 1: Write .github/workflows/ci.yml**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: ['18', '20', '22']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
      - run: npm test
      - run: npm run build
      - name: Confirm the built file is self-contained
        run: |
          test -s dist/prompt-builder.html
          ! grep -qE '<script[^>]+src=|<link[^>]+href=' dist/prompt-builder.html
```

There is no `npm ci` step because the project has no dependencies and no lockfile.

- [ ] **Step 2: Write README.md**

It must cover: what the tool is and the problem it solves, a one-line quick start pointing at `dist/prompt-builder.html`, the three commands, how profiles work and why they are the point, what the gap check does, the plain statement that the API key is stored unencrypted in browser storage and that Polish is optional and needs the hosted version, the MIT license, and a link to the spec in `docs/superpowers/specs/`.

Follow the voice guide at `../voice.md`: direct, plain-spoken, decisive, no hype vocabulary, no emojis in body copy, sentences under roughly fifteen words, headings that state findings rather than tease.

- [ ] **Step 3: Run the full acceptance pass**

Work through the spec's acceptance criteria and confirm each one by hand.

```bash
npm test                                    # criterion 7
npm run build && open dist/prompt-builder.html   # criteria 1, 6
```

In the opened file, with no network:

- [ ] Create a profile, fill four blocks, confirm it survives a reload.
- [ ] Export, open a private window, import, confirm the profiles match.
- [ ] Select the profile, type a goal, confirm the preview is correctly ordered with no empty sections.
- [ ] Empty the constraints field and confirm the score drops by five and a gap appears.
- [ ] Press Copy, paste into a text editor, confirm the text matches the preview exactly.
- [ ] Confirm Polish is disabled and explains why.

- [ ] **Step 4: Commit**

```bash
git add README.md .github/workflows/ci.yml .gitignore
git commit -m "docs: README and CI workflow"
```

- [ ] **Step 5: Stop before publishing**

Do not create the GitHub repository or add a remote. Report that the work is complete and local, and let Jon decide when it goes public.

---

## Self-Review

Run against the spec after the plan is written, before execution starts.

**Spec coverage:** every spec section maps to a task. Architecture and build contract to Task 6. Profile and task data model to Tasks 1 and 4. Schema versioning to Task 4. Assembler including delimiter safety to Task 2. Gap check to Task 3. Storage to Task 5. AI polish to Task 8. Interface to Task 7. Error handling spread across Tasks 4, 5, 7 and 8. Testing to Tasks 1 through 4 and 6. Acceptance criteria to Task 9.

**Known deviations from the spec, both deliberate:**

1. `dev-server.js` rebuilds on each request rather than serving static files. Recorded in Task 6.
2. `thin-profile` and `no-verification` are suppressed when no profile is selected. Recorded in Task 3.

**Naming consistency:** `apbNonEmptyBlocks` is defined in Task 1 and consumed in Task 3. `apbToList` and `apbAssemblePrompt` are defined in Task 2 and consumed in Tasks 3 and 7. `apbMakeProfile` and `apbValidateProfile` are defined in Task 1 and consumed in Tasks 4, 5 and 7. `apbBuildHtml` is defined in Task 6 and consumed by `dev-server.js` in the same task. `apbRefreshPolishButton`, `apbRunPolish` and `apbWireSettings` are called in Task 7 and defined in Task 8, which Task 7 states explicitly.
