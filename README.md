# AI Prompt Builder

A single web page that turns a saved project profile and a short task
into a paste-ready, XML-sectioned prompt for Claude. Nothing to
install, no account, no sign-in.

Every new task with an AI assistant starts with the same questions:
what the stack is, how tests run, what counts as done, what it can't
touch. Answering those every time wastes effort. Skip them and you get
sloppy output. This tool stores the standing context once per project,
then assembles it with the task that changes.

## Quick start

Open it:

**https://jonimmswordpressdev.github.io/ai-prompt-builder/**

That's the whole thing. Bookmark it and you're done.

Your profiles are saved in that browser, on that device. Nothing is
uploaded, there is no account, and closing the tab loses nothing.

## Prefer a file you keep?

Download `prompt-builder.html` from the [latest
release](https://github.com/JonImmsWordpressDev/ai-prompt-builder/releases/latest)
and double-click it. One file, no folder, no installer. It works with
no internet connection, from a USB stick, or from a shared drive.

The one difference: Polish, described below, does not work from a
downloaded file. Everything else does. Use the link above if you want
Polish.

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
and import move profiles between devices as a JSON file. Nothing syncs
on its own, and nothing leaves your browser unless you export it or
use Polish.

## The gap check names what Claude would otherwise ask about

Above the preview, a completeness score and a list of gaps flag the
things that cost you a round of back-and-forth: no definition of done,
no test or lint command, a goal that's a few words too thin, vague
language like "and so on". Fix what matters, ignore the rest, and copy
anyway if you want. The score is a nudge, not a gate.

## Polish is optional, and it stores your API key unencrypted

Polish sends your assembled prompt to the Anthropic API and returns a
tightened rewrite. The tool is complete without it. Leave it alone and
nothing changes.

If you add a key in Settings, it sits in your browser's local storage
in plain text. Anyone with access to that browser profile can read it.
Don't add a key on a shared or public machine.

Polish needs the hosted link, not a downloaded file. Browsers block
the request from a local file, and the button says so rather than
failing silently.

## Build it yourself

You don't need this to use the tool. It's here if you want to change
it or check what it does.

    npm run dev      dev server at http://127.0.0.1:4518
    npm run build    writes dist/prompt-builder.html
    npm test         runs the test suite

Needs Node 18 or newer. There are no dependencies, so there is nothing
to install first. The whole tool is one HTML file with inline CSS and
JavaScript, built from the small modules in `src/`.

## License

MIT. See `LICENSE`.
