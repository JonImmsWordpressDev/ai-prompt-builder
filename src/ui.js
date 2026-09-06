import { apbAssemblePrompt, apbToList } from './assembler.js';
import { apbAnalyzeGaps } from './gapcheck.js';
import {
  apbMakeProfile, apbExportProfiles, apbImportProfiles, apbResolveBootProfiles,
} from './profiles.js';
import {
  APB_KEYS, apbLoad, apbSave, apbGenerateId, apbNowIso,
  apbStorageAvailable, apbStarterProfiles,
} from './storage.js';
import { apbPolishAvailability, apbPolishPrompt, APB_POLISH_MODEL } from './polish.js';

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
    case 'block-down': {
      const profile = apbSelectedProfile();
      if (profile && idx < profile.blocks.length - 1) {
        apbUpdateProfile((p) => p.blocks.splice(idx + 1, 0, p.blocks.splice(idx, 1)[0]));
      }
      break;
    }
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
      apbPolishGeneration += 1;
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
  const storedProfiles = apbLoad(APB_KEYS.profiles, null);
  const resolved = apbResolveBootProfiles(storedProfiles, settings, apbStarterProfiles);
  apbState.profiles = resolved.profiles.map((p) => apbMakeProfile(p));

  if (!Array.isArray(storedProfiles)) {
    // First run, or a prior run that never finished persisting. Write the
    // resolved array before flipping the seeded flag, so a failed write
    // (quota, locked-down storage) leaves seeded unset rather than lying
    // about data that never landed. The next load can then seed again,
    // which is the safe direction to fail in.
    const wrote = apbSave(APB_KEYS.profiles, apbState.profiles);
    if (wrote) apbSave(APB_KEYS.settings, { ...settings, seeded: resolved.seeded });
  }

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

let apbPolishGeneration = 0;
let apbPolishInFlight = false;

function apbRefreshPolishButton() {
  const button = apbEl('apb-polish-btn');
  if (!button) return;
  const availability = apbPolishAvailability();
  button.disabled = apbPolishInFlight || !availability.ok || !apbState.lastAssembled;
  button.title = apbPolishInFlight
    ? `Polishing with ${APB_POLISH_MODEL}...`
    : (availability.ok ? `Rewrite with ${APB_POLISH_MODEL}` : availability.reason);
}

async function apbRunPolish() {
  if (apbPolishInFlight) return;
  const availability = apbPolishAvailability();
  if (!availability.ok) {
    apbSetStatus(availability.reason, true);
    return;
  }
  apbPolishGeneration += 1;
  const generation = apbPolishGeneration;
  apbPolishInFlight = true;
  apbRefreshPolishButton();
  apbSetStatus(`Polishing with ${APB_POLISH_MODEL}...`, false);
  try {
    const settings = apbLoad(APB_KEYS.settings, {});
    const polished = await apbPolishPrompt(apbState.lastAssembled, settings.apiKey);
    if (generation !== apbPolishGeneration) {
      apbSetStatus('The prompt changed while polishing, so that result was dropped.', true);
      return;
    }
    apbState.polished = polished;
    apbRenderOutputPane();
    apbSetStatus('Polished. Undo restores the assembled version.', false);
  } catch (err) {
    if (generation !== apbPolishGeneration) {
      apbSetStatus('The prompt changed while polishing, so that result was dropped.', true);
      return;
    }
    apbSetStatus(`Polish failed, your prompt is unchanged. ${err.message}`, true);
  } finally {
    apbPolishInFlight = false;
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

document.addEventListener('DOMContentLoaded', apbBoot);
