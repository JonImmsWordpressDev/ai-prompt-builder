# AI Prompt Builder

A single HTML file that turns a standing project profile and a short
task into a paste-ready, XML-sectioned prompt for Claude. No install,
no account, no server.

Every new task with an AI assistant starts with the same questions:
what the stack is, how tests run, what counts as done, what it can't
touch. Answering those every time wastes effort. Skip them and you get
sloppy output. This tool stores the standing context once per project,
then assembles it with the task that changes.

## Quick start

Open `dist/prompt-builder.html` in a browser. That's the whole tool.

It runs from a local file, a USB stick, or a URL, with no network
access required for anything except the optional Polish step below.

## Commands

    npm run dev      dev server at http://127.0.0.1:4518, rebuilds on request
    npm run build    writes dist/prompt-builder.html
    npm test         runs the test suite

Needs Node 18 or newer. No npm dependencies, so there's nothing to
install first.

## Profiles are the point

A profile holds what doesn't change between tasks: your stack, repo
layout, how tests run, what not to touch, what "done" means. Write it
once per project, reuse it on every task after that.

The task form is deliberately the small part: a goal, some detail,
constraints, and a definition of done. Everything else comes from the
profile you selected.

Blocks are free-form label and value pairs, not fixed fields, so a
codebase and a writing project model the same way. Two starter
profiles ship as editable examples, seeded once on first run. Export
and import move profiles between machines as a JSON file. Nothing
syncs on its own, and nothing leaves your browser unless you export it.

## The gap check names what Claude would otherwise ask about

Above the preview, a completeness score and a list of gaps flag the
things that cost you a round of back-and-forth: no definition of done,
no test or lint command, a goal that's a few words too thin, vague
language like "and so on". Fix what matters, ignore the rest, and copy
anyway if you want. The score is a nudge, not a gate.

## The API key is stored unencrypted, and Polish needs the hosted version

Polish sends your assembled prompt to the Anthropic API and returns a
tightened rewrite. It's optional. The tool is complete without it.

If you add a key in Settings, it sits in browser local storage in
plain text. Don't paste a key into a copy of this tool on a shared or
public machine.

Polish also won't work from a `file://` URL, because the browser blocks
the cross-origin request from a local file. The button explains this
instead of failing silently. To use Polish, serve the built file over
`npm run dev` or host it somewhere.

## License

MIT. See `LICENSE`.

## Design spec

Full architecture, data model, and acceptance criteria:
`docs/superpowers/specs/2026-09-06-ai-prompt-builder-design.md`.
