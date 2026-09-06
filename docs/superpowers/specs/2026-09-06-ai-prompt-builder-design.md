# AI Prompt Builder — Design

Date: 2026-09-06
Status: Approved for planning

## Problem

Starting work with an AI assistant costs a round of interrogation. The
assistant asks what the stack is, how tests run, what "done" means, and
what it must not touch. Answering the same standing questions on every
new task is wasted effort, and skipping them produces sloppy output.

The standing context is stable per project. The task is what changes.
This tool stores the standing context once per project and assembles it
with a short task description into a paste-ready prompt.

## What it is

A single self-contained HTML file. No install, no account, no backend.
It opens from a local file, a USB stick, or a URL, so it works on a
personal machine and on a locked-down work machine alike.

Two audiences in practice, both the author: freelance WordPress work,
and Azure DevOps work at Buildertrend.

## Non-goals

Version one does not do these, deliberately:

- Running the prompt. The user pastes it into Claude themselves.
- Image prompts.
- Accounts, sync, or any server-side storage.
- A history or library of previously generated prompts.
- Model comparison or per-vendor prompt variants.

## Architecture

Source lives as small modules. A dependency-free Node script
concatenates them into one distributable HTML file. This keeps the
single-file portability that the runtime choice demands, without a
single unmaintainable file in source control.

    src/shell.html      document skeleton with placeholder markers
    src/styles.css      all styling
    src/assembler.js    pure: profile + task -> prompt string
    src/gapcheck.js     pure: rules that detect missing context
    src/profiles.js     pure: schema, validation, import/export, migration
    src/storage.js      localStorage wrapper with in-memory fallback
    src/polish.js       optional Anthropic API call, isolated
    src/ui.js           DOM wiring only, no business logic
    build.js            concatenation -> dist/prompt-builder.html
    dev-server.js       zero-dependency static server for development
    test/               node --test against the pure modules

Dependency direction is one-way. `ui.js` imports from the pure modules;
nothing pure imports `ui.js`, `storage.js`, or `polish.js`. This is what
makes the interesting logic testable without a DOM.

Zero npm dependencies. Node 18 or newer. No bundler, no transpiler, no
lint step.

### Commands

    npm run dev      node dev-server.js       http://127.0.0.1:4518
    npm run build    node build.js            -> dist/prompt-builder.html
    npm test         node --test test/*.js

Single test: `node --test --test-name-pattern="<name>" test/*.js`

### Build contract

`build.js` reads `src/shell.html` and replaces three markers:

- `<!--INJECT:STYLES-->` with the contents of `src/styles.css` wrapped
  in a style element.
- `<!--INJECT:SCRIPT-->` with the concatenated JS modules wrapped in a
  script element.
- `<!--INJECT:VERSION-->` with the version string from `package.json`.

Modules are concatenated in dependency order with their `export` and
`import` statements stripped, producing one classic script that runs in
a single scope. Order: profiles, assembler, gapcheck, storage, polish,
ui. A classic script rather than a module script is required so the
built file works from a `file://` URL.

Every module therefore uses uniquely prefixed top-level names to avoid
collisions once concatenated. The build fails loudly if a duplicate
top-level declaration is detected.

## Data model

### Profile

A profile is a named ordered list of free-form label and value blocks.
Free-form rather than fixed fields, so the tool stays general purpose:
a content project models as naturally as a codebase.

    {
      "schemaVersion": 1,
      "id": "p_8f2a1c",
      "name": "Buildertrend / ADO",
      "role": "senior React and TypeScript engineer",
      "blocks": [
        { "label": "Stack",      "value": "React 18, TypeScript, .NET 8 API" },
        { "label": "Repo",       "value": "monorepo, app in /web, api in /src/Api" },
        { "label": "Testing",    "value": "npm test; single: npm test -- -t \"name\"" },
        { "label": "Conventions","value": "branch from develop, squash merge, 1 review" },
        { "label": "Do not touch","value": "/legacy, /vendor" },
        { "label": "Done when",  "value": "tests pass, lint clean, PR description filled" }
      ],
      "defaultOutputFormat": "Plan first, wait for my approval, then implement.",
      "updatedAt": "2026-09-06T10:00:00.000Z"
    }

`role` and `defaultOutputFormat` are optional. `blocks` may be empty.
`name` is required and must be non-empty after trimming.

Two starter profiles ship as editable examples, one software-shaped and
one content-shaped. They are seeded on first run only, and only when no
profiles exist. Deleting them is permanent and they are not re-seeded.

### Task

The per-use form. Not persisted beyond an autosaved draft.

    {
      "goal": "",
      "detail": "",
      "constraints": [],
      "doneWhen": [],
      "outputFormat": "",
      "roleOverride": ""
    }

`constraints` and `doneWhen` are arrays of strings, edited as one item
per line in a textarea and split on newlines with blanks discarded.

### Schema versioning

Exported JSON carries `schemaVersion`. On import, a version newer than
the running build is rejected with an explanatory message rather than
guessed at. A version older than current runs through an ordered list of
migration functions. Version one has no migrations; the mechanism exists
so the first export is not a dead end.

## Assembler

`assemble(profile, task) -> string`. Pure. No DOM, no storage, no clock,
no randomness. Same inputs always produce the same string, which is what
makes it testable.

Section order in the output:

1. `<role>` — from `task.roleOverride`, falling back to `profile.role`.
2. `<context>` — profile name, then each non-empty block as
   `Label: value` when the value is a single line. A multi-line value
   renders as `Label:` alone, then its lines each indented by two
   spaces, so block boundaries stay readable.
3. `<task>` — `task.goal`, then a blank line, then `task.detail`.
4. `<constraints>` — one `- item` per entry.
5. `<done_when>` — one `- item` per entry.
6. `<output_format>` — `task.outputFormat`, falling back to
   `profile.defaultOutputFormat`.

Empty sections are omitted entirely, tags and all. A prompt with only a
goal is a valid prompt containing one `<task>` section.

Sections are separated by one blank line. The string has no trailing
newline.

### Delimiter safety

Values are inserted verbatim, not HTML-escaped, because the consumer is
a language model reading text and escaping would corrupt code samples.
The one hazard is a value containing a closing tag that matches the
section it sits in, which would truncate the section. The assembler
neutralises only that exact case, replacing an occurrence of the
section's own closing tag with the same text carrying a zero-width
space after the angle bracket. All other angle brackets, including code
containing arbitrary XML, pass through untouched.

## Gap check

The component that addresses the stated problem. `analyze(profile, task)`
returns a completeness score and an ordered list of gaps. Pure.

Each rule is `{ id, severity, test(profile, task), message }`. Rules
fire independently and their messages name the consequence, not just the
omission, so the reason to fix it is obvious.

Version one ships these rules:

| id                | severity | fires when                                   |
|-------------------|----------|----------------------------------------------|
| no-profile        | high     | no profile selected                          |
| thin-profile      | high     | fewer than three non-empty blocks            |
| no-goal           | high     | goal empty                                   |
| thin-goal         | medium   | goal non-empty but under eight words          |
| no-detail         | medium   | detail empty                                 |
| no-done-when      | high     | doneWhen empty and no profile block has a word starting `done` |
| no-verification   | high     | no profile block where a word starts with `test`, `verif` or `lint`, case-insensitive |
| no-constraints    | low      | constraints empty                            |
| no-output-format  | medium   | no output format from task or profile        |
| vague-language    | low      | goal or detail contains a hedge phrase from the list below |

The `vague-language` rule scans `task.goal` and `task.detail` joined
with a space, case-insensitively, for these exact phrases: `etc.`,
`and so on`, `something like`, `make it better`, `as needed`. The list
lives in one exported constant so it can be extended without touching
rule logic.

Rules are mutually exclusive only where the table says so. `no-goal`
and `thin-goal` never fire together.

Score starts at one hundred. Each fired rule subtracts by severity:
high twenty, medium ten, low five. The floor is zero. The score is
presentational only; nothing is blocked by it. The user can always copy.

Adding a rule means adding one object to an array and one test case.
This list is expected to grow as the author learns which omissions
actually cost them time.

## Storage

`localStorage`, three keys, all namespaced:

    apb.profiles.v1    the profile array
    apb.settings.v1    API key, polish model, seeded flag
    apb.draft.v1       autosaved task form

Every read and every write is wrapped in try/catch. Private browsing,
disabled site data, and quota errors all degrade to an in-memory store
for the session, with a dismissible banner explaining that nothing will
persist. The tool remains fully functional in that state.

A corrupt or unparseable value is discarded and treated as absent rather
than crashing the page.

Import and export move the profile array as a JSON file, which is the
supported path for getting profiles from the personal machine to the
work machine. Import is all-or-nothing: the payload is validated in full
before anything is written, so a bad file never leaves storage half
updated. Import offers merge or replace; merge matches on profile id and
the incoming copy wins on conflict.

## AI polish

Optional, and the tool is complete without it.

With an API key set in settings, a Polish button sends the assembled
prompt to the Anthropic Messages API and asks for a tightened rewrite
that preserves every section and every fact. The result replaces the
displayed prompt, with Undo restoring the assembled original. The
original is held in memory for the session so Undo cannot fail.

Default model: `claude-sonnet-5`.

Constraints and honesty requirements:

- The key is stored in browser localStorage. The settings panel says so
  in plain words, next to the input, not buried in a help page.
- The request needs the `anthropic-dangerous-direct-browser-access`
  header to satisfy cross-origin rules.
- From a `file://` URL the request origin is `null` and the call is
  expected to fail. The tool detects a `file://` context up front and
  says polish needs the hosted version, rather than presenting a button
  that fails mysteriously.
- Network or API failure leaves the assembled prompt untouched and
  surfaces the error text. User input is never lost to a failed call.
- No other network calls exist anywhere in the tool.

## Interface

Single screen, three regions, no routing.

Left, the profile picker with new, duplicate, rename, delete, import and
export. Editing a profile is inline block editing: add block, reorder,
delete block.

Centre, the task form: goal, detail, constraints, done-when, output
format, optional role override.

Right, the live prompt preview in a monospace panel, the completeness
score and gap list above it, and Copy plus Polish beneath it. The
preview updates on every keystroke, since assembly is pure string work
and cheap.

Copy writes to the clipboard and confirms inline. A textarea fallback
with select-all covers browsers that refuse clipboard access.

The task form autosaves to the draft key so a refresh or a closed tab
does not lose work. Deleting the selected profile clears the selection
and leaves the task form intact.

## Error handling

| Condition                     | Behaviour                                  |
|-------------------------------|--------------------------------------------|
| localStorage unavailable      | in-memory fallback, banner, stays usable   |
| corrupt stored value          | discard, treat as absent, log to console   |
| import file unparseable       | reject with message, storage untouched     |
| import schemaVersion too new  | reject naming both versions                |
| clipboard write refused       | reveal selectable textarea fallback        |
| polish without key            | button disabled with reason shown          |
| polish from file:// origin    | button disabled with reason shown          |
| polish API error              | keep prompt, show error text, allow retry  |

Nothing in the list is a dead end and none of them lose typed input.

## Testing

`node --test test/*.js` over the pure modules only. `node:test` and
`node:assert`, no framework, matching the author's existing projects.

Coverage required before the work is called done:

- Assembler: section ordering, omission of every empty section, the
  role and output-format fallbacks, multi-line block indentation, the
  closing-tag neutralisation, and a golden full-output test.
- Gap check: one test per rule firing, one per rule correctly not
  firing, and the score arithmetic including the floor.
- Profiles: validation accepts a good profile and rejects each invalid
  shape, export then import round-trips to an identical array, a
  too-new schemaVersion is rejected, and merge conflict resolution
  picks the incoming copy.

`storage.js`, `polish.js`, and `ui.js` are not unit tested. They are
kept thin deliberately so that this is an acceptable trade.

## Acceptance criteria

1. `npm run build` produces `dist/prompt-builder.html` that opens from
   a `file://` URL and is fully usable with no network access.
2. A profile can be created, filled, saved, exported, and imported into
   a fresh browser profile with identical contents.
3. Selecting a profile and typing a goal yields a correctly ordered
   XML-sectioned prompt in the preview, with no empty sections.
4. The gap list and score respond to the form as it is filled.
5. Copy places the exact previewed text on the clipboard.
6. With no API key, every feature except Polish works, and Polish
   explains why it is unavailable.
7. `npm test` passes.
