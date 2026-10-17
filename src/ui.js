import {
  APB_KINDS, APB_KIND_LABELS, apbDetectKind, apbExtractSignals,
} from './detect.js';
import { apbAssemblePrompt } from './assembler.js';
import { APB_NUDGE_DEFS, apbOfferedNudges, apbNudgeContributions } from './nudges.js';
import { APB_EXAMPLES } from './examples.js';
import {
  apbHistorySanitize, apbHistoryAdd, apbHistoryHas, apbHistoryTitle,
} from './history.js';

const APB_DRAFT_KEY = 'apb.draft.v2';
const APB_HISTORY_KEY = 'apb.history.v1';
const APB_RENDER_DELAY = 150;
const APB_SAVE_DELAY = 400;

const apbState = {
  brief: '',
  kindPin: '',
  nudges: {},
  // Which nudge chip is currently expanded into a text input. One at a
  // time, so the row never turns into a form.
  openNudge: '',
  history: [],
};

let apbRenderTimer = null;
let apbSaveTimer = null;

function apbEl(id) {
  return document.getElementById(id);
}

function apbEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Every storage access is wrapped: a private window, blocked site data
// or corrupt JSON must yield an empty draft, never a broken page.
function apbLoadDraft() {
  try {
    const raw = window.localStorage.getItem(APB_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return {
      brief: typeof parsed.brief === 'string' ? parsed.brief : '',
      kindPin: APB_KINDS.includes(parsed.kindPin) ? parsed.kindPin : '',
      nudges: (parsed.nudges && typeof parsed.nudges === 'object' && !Array.isArray(parsed.nudges))
        ? parsed.nudges : {},
    };
  } catch (err) {
    return null;
  }
}

function apbSaveDraft() {
  window.clearTimeout(apbSaveTimer);
  apbSaveTimer = window.setTimeout(() => {
    try {
      window.localStorage.setItem(APB_DRAFT_KEY, JSON.stringify({
        brief: apbState.brief,
        kindPin: apbState.kindPin,
        nudges: apbState.nudges,
      }));
    } catch (err) {
      // Nothing to do and nothing worth interrupting the user over.
    }
  }, APB_SAVE_DELAY);
}

function apbLoadHistory() {
  try {
    const raw = window.localStorage.getItem(APB_HISTORY_KEY);
    return raw ? apbHistorySanitize(JSON.parse(raw), APB_KINDS) : [];
  } catch (err) {
    return [];
  }
}

function apbSaveHistory() {
  try {
    window.localStorage.setItem(APB_HISTORY_KEY, JSON.stringify(apbState.history));
  } catch (err) {
    // History is a convenience; losing a save is not worth a message.
  }
}

function apbRemember() {
  if (!apbState.brief.trim()) return;
  apbState.history = apbHistoryAdd(apbState.history, {
    brief: apbState.brief,
    kindPin: apbState.kindPin,
    nudges: apbState.nudges,
    savedAt: new Date().toISOString(),
  });
  apbSaveHistory();
  apbRenderHistory();
}

function apbRenderHistory() {
  const host = apbEl('apb-history');
  const list = apbEl('apb-history-list');
  host.hidden = !apbState.history.length;
  list.innerHTML = apbState.history.map((item, index) => {
    const kind = item.kindPin || apbDetectKind(item.brief);
    const when = item.savedAt
      ? new Date(item.savedAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      : '';
    const meta = [APB_KIND_LABELS[kind], when].filter(Boolean).join(' \u00b7 ');
    return `<li><button type="button" class="apb-history-item" data-history="${index}">
      <span class="apb-history-title">${apbEscape(apbHistoryTitle(item.brief))}</span>
      <span class="apb-history-meta">${apbEscape(meta)}</span>
    </button></li>`;
  }).join('');
}

// Loading a brief replaces whatever is in the box. If that work was never
// copied it is not in history yet, so it is saved first rather than lost.
function apbLoadBrief(brief, kindPin, nudges) {
  if (apbState.brief.trim() && apbState.brief !== brief && !apbHistoryHas(apbState.history, apbState.brief)) {
    apbRemember();
  }
  apbState.brief = brief;
  apbState.kindPin = kindPin;
  apbState.nudges = { ...nudges };
  apbState.openNudge = '';
  apbEl('apb-brief').value = brief;
  apbSaveDraft();
  apbRender();
}

function apbBuildExamples() {
  apbEl('apb-examples').innerHTML = `<span class="apb-muted">Try one:</span>
    ${APB_EXAMPLES.map((example, index) => (
    `<button type="button" class="apb-chip" data-example="${index}">${apbEscape(example.label)}</button>`
  )).join('')}`;
}

function apbCurrentKind() {
  return apbState.kindPin || apbDetectKind(apbState.brief);
}

function apbBuildKindSelect() {
  const select = apbEl('apb-kind');
  const options = ['<option value="">Auto (detected)</option>'];
  for (const kind of APB_KINDS) {
    options.push(`<option value="${apbEscape(kind)}">${apbEscape(APB_KIND_LABELS[kind])}</option>`);
  }
  select.innerHTML = options.join('');
}

function apbRenderNudges(kind, signals) {
  const host = apbEl('apb-nudges');
  const offered = apbOfferedNudges(kind, signals, apbState.nudges);
  const answered = Object.keys(APB_NUDGE_DEFS).filter(
    (id) => String(apbState.nudges[id] == null ? '' : apbState.nudges[id]).trim(),
  );

  if (!offered.length && !answered.length) {
    host.innerHTML = '';
    return;
  }

  // An answered nudge drops out of `offered` (apbOfferedNudges skips it),
  // so the open-input branch has to be reachable from BOTH lists —
  // otherwise a filled chip can never be reopened to edit or clear it.
  const openInput = (id) => `<span class="apb-nudge-open">
           <label for="apb-nudge-input">${apbEscape(APB_NUDGE_DEFS[id].label)}</label>
           <input type="text" id="apb-nudge-input" data-nudge="${apbEscape(id)}"
             placeholder="${apbEscape(APB_NUDGE_DEFS[id].hint || '')}"
             value="${apbEscape(apbState.nudges[id] || '')}">
         </span>`;

  const chips = offered.map((id) => (
    apbState.openNudge === id
      ? openInput(id)
      : `<button type="button" class="apb-chip" data-open="${apbEscape(id)}">+ ${apbEscape(APB_NUDGE_DEFS[id].label)}</button>`
  ));

  const filled = answered.map((id) => (
    apbState.openNudge === id
      ? openInput(id)
      : `<button type="button" class="apb-chip apb-chip-done" data-open="${apbEscape(id)}">
       ${apbEscape(APB_NUDGE_DEFS[id].label)}: ${apbEscape(apbState.nudges[id])}
     </button>`
  ));

  host.innerHTML = `<p class="apb-muted">Make it sharper?</p>
    <div class="apb-chiprow">${chips.join('')}${filled.join('')}</div>`;

  const input = apbEl('apb-nudge-input');
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function apbRender() {
  // A direct render supersedes any debounced one still pending. Letting that
  // stale timer fire would rebuild an open nudge input and discard whatever
  // has been typed into it since.
  window.clearTimeout(apbRenderTimer);
  const brief = apbState.brief.trim();
  const kind = apbCurrentKind();
  const signals = apbExtractSignals(apbState.brief);
  const prompt = apbAssemblePrompt(
    apbState.brief, kind, signals, apbNudgeContributions(apbState.nudges),
  );

  apbEl('apb-kindrow').hidden = !brief;
  apbEl('apb-examples').hidden = Boolean(brief);
  // The first option is the auto slot. Label it with what detection
  // actually guessed, so the closed select shows the guess rather than the
  // word "Auto" — seeing the guess is the whole point of making one.
  const autoOption = apbEl('apb-kind').options[0];
  if (autoOption) {
    autoOption.textContent = brief
      ? `${APB_KIND_LABELS[apbDetectKind(apbState.brief)]} (auto)`
      : 'Auto (detected)';
  }
  apbEl('apb-kind').value = apbState.kindPin;
  apbEl('apb-prompt').textContent = prompt;
  apbEl('apb-copy').disabled = !prompt;
  apbEl('apb-empty').textContent = prompt
    ? ''
    : 'Type what you need above and your prompt appears here.';
  apbEl('apb-empty').hidden = Boolean(prompt);

  if (brief) apbRenderNudges(kind, signals);
  else apbEl('apb-nudges').innerHTML = '';
}

function apbScheduleRender() {
  window.clearTimeout(apbRenderTimer);
  apbRenderTimer = window.setTimeout(apbRender, APB_RENDER_DELAY);
}

async function apbCopy() {
  const button = apbEl('apb-copy');
  const text = apbEl('apb-prompt').textContent;
  // Copying is the moment a prompt is worth keeping, whichever of the
  // clipboard paths below ends up working.
  apbRemember();
  const restore = () => window.setTimeout(() => { button.textContent = 'Copy'; }, 2000);
  try {
    await navigator.clipboard.writeText(text);
    button.textContent = 'Copied';
    restore();
    return;
  } catch (err) {
    // Falls through to the file:// and older-browser path below.
  }
  try {
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'absolute';
    scratch.style.left = '-9999px';
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(scratch);
    if (!ok) throw new Error('execCommand returned false');
    button.textContent = 'Copied';
    restore();
  } catch (err) {
    button.textContent = 'Press Ctrl+C';
    const range = document.createRange();
    range.selectNodeContents(apbEl('apb-prompt'));
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    restore();
  }
}

// Recording and closing are separate because a click on a different chip
// arrives AFTER the focusout that click triggers. The answer has to be
// saved synchronously or it is lost, while the re-render that would
// destroy the button the click is headed for has to wait until that click
// has been handled.
function apbRecordNudge(id, value) {
  const text = String(value == null ? '' : value).trim();
  if (text) apbState.nudges[id] = text;
  else delete apbState.nudges[id];
  apbSaveDraft();
}

function apbCommitNudge(id, value) {
  apbRecordNudge(id, value);
  // Another chip already claimed the open slot, so it owns the render.
  if (apbState.openNudge !== id) return;
  apbState.openNudge = '';
  apbRender();
}

function apbWire() {
  apbEl('apb-brief').addEventListener('input', (event) => {
    apbState.brief = event.target.value;
    // Clearing the box releases a pinned kind, so the next brief is
    // detected fresh rather than inheriting the last one's override.
    if (!apbState.brief.trim()) apbState.kindPin = '';
    apbSaveDraft();
    apbScheduleRender();
  });

  apbEl('apb-kind').addEventListener('change', (event) => {
    apbState.kindPin = APB_KINDS.includes(event.target.value) ? event.target.value : '';
    apbSaveDraft();
    apbRender();
  });

  apbEl('apb-copy').addEventListener('click', apbCopy);

  apbEl('apb-examples').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-example]');
    if (!trigger) return;
    const example = APB_EXAMPLES[Number(trigger.dataset.example)];
    if (!example) return;
    apbLoadBrief(example.brief, '', {});
    apbEl('apb-brief').focus();
  });

  apbEl('apb-history-list').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-history]');
    if (!trigger) return;
    const item = apbState.history[Number(trigger.dataset.history)];
    if (!item) return;
    apbLoadBrief(item.brief, item.kindPin, item.nudges);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    apbEl('apb-brief').focus({ preventScroll: true });
  });

  apbEl('apb-history-clear').addEventListener('click', () => {
    apbState.history = [];
    apbSaveHistory();
    apbRenderHistory();
  });

  apbEl('apb-nudges').addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-open]');
    if (!trigger) return;
    apbState.openNudge = trigger.dataset.open;
    apbRender();
  });

  apbEl('apb-nudges').addEventListener('keydown', (event) => {
    if (!event.target.dataset || !event.target.dataset.nudge) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      apbCommitNudge(event.target.dataset.nudge, event.target.value);
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      apbState.openNudge = '';
      apbRender();
    }
  });

  apbEl('apb-nudges').addEventListener('focusout', (event) => {
    if (!event.target.dataset || !event.target.dataset.nudge) return;
    const id = event.target.dataset.nudge;
    const value = event.target.value;
    // Save now, close on the next macrotask. A click on another chip is
    // dispatched after this focusout, and closing synchronously would
    // rebuild the chip row and destroy the button that click was aimed at,
    // costing the user a second click.
    apbRecordNudge(id, value);
    window.setTimeout(() => {
      if (apbState.openNudge !== id) return;
      apbState.openNudge = '';
      apbRender();
    }, 0);
  });
}

function apbBoot() {
  apbBuildKindSelect();
  apbBuildExamples();
  apbState.history = apbLoadHistory();
  apbRenderHistory();
  const draft = apbLoadDraft();
  if (draft) {
    apbState.brief = draft.brief;
    apbState.kindPin = draft.kindPin;
    apbState.nudges = draft.nudges;
    apbEl('apb-brief').value = draft.brief;
  }
  apbWire();
  apbRender();
}

document.addEventListener('DOMContentLoaded', apbBoot);
