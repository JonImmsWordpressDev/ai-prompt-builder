// Definition order is the contribution order: apbNudgeContributions
// walks these keys, not the answers object, so the rendered prompt is
// stable no matter what order the user filled the chips in.
//
// `hint` is the input's placeholder: an example answer, because "some
// background" on its own does not tell anyone what kind of answer helps.
export const APB_NUDGE_DEFS = {
  context: { label: 'some background', section: 'context', prefix: '', hint: 'e.g. I run a small plumbing firm in Leeds' },
  audience: { label: "who it's for", section: 'audience', prefix: '', hint: 'e.g. first-time homeowners' },
  who: { label: "who's involved", section: 'audience', prefix: '', hint: 'e.g. me and two part-timers' },
  tone: { label: 'a tone', section: 'tone', prefix: '', hint: 'e.g. friendly, plain English' },
  done: { label: 'what done looks like', section: 'done', prefix: '', hint: 'e.g. it ends with a link to book' },
  test: { label: 'how to test it', section: 'done', prefix: 'Verified by: ', hint: 'e.g. the form submits without errors' },
  data: { label: 'what data you have', section: 'need', prefix: 'What I have: ', hint: 'e.g. a year of monthly sales figures' },
  decision: { label: "what decision it's for", section: 'need', prefix: 'This is to help decide: ', hint: 'e.g. which supplier to renew with' },
  stack: { label: 'your setup', section: 'context', prefix: 'My setup: ', hint: 'e.g. WordPress 6.6, PHP 8.2' },
  length: { label: 'how long', section: 'constraints', prefix: 'Length: ', hint: 'e.g. about 800 words' },
  avoid: { label: 'what to avoid', section: 'constraints', prefix: 'Avoid: ', hint: 'e.g. jargon, hard selling' },
  freeze: { label: 'what not to change', section: 'constraints', prefix: 'Do not change: ', hint: 'e.g. the database schema' },
  deadline: { label: 'a deadline', section: 'constraints', prefix: 'Deadline: ', hint: 'e.g. end of the month' },
  where: { label: "where it'll be used", section: 'constraints', prefix: 'Will be used: ', hint: 'e.g. Instagram and a printed flyer' },
  brand: { label: 'brand or colours', section: 'constraints', prefix: 'Brand and colour: ', hint: 'e.g. black and white, bold sans-serif' },
};

// Most useful first for each kind. Only the first APB_NUDGE_LIMIT
// unanswered ones show at a time, so the order is what decides which
// questions most people ever see. Code has no tone or audience chip:
// neither changes what working code looks like.
export const APB_NUDGE_ORDER = {
  writing: ['audience', 'tone', 'context', 'done', 'length', 'avoid'],
  code: ['stack', 'done', 'test', 'freeze', 'context'],
  plan: ['context', 'deadline', 'done', 'who', 'audience'],
  analysis: ['data', 'decision', 'context', 'audience', 'done'],
  design: ['audience', 'where', 'brand', 'context', 'tone'],
  general: ['context', 'done', 'audience', 'avoid'],
};

export const APB_NUDGE_LIMIT = 3;

export function apbOfferedNudges(kind, signals, answers) {
  const order = APB_NUDGE_ORDER[kind] || APB_NUDGE_ORDER.general;
  const sig = signals || {};
  const ans = answers || {};
  // Only these four nudges have a matching extracted signal; the rest
  // can never be satisfied by the brief alone.
  const satisfied = {
    audience: Boolean(sig.audience),
    tone: Boolean(sig.tone),
    length: Boolean(sig.length),
    deadline: Boolean(sig.deadline),
  };
  const offered = [];
  for (const id of order) {
    if (offered.length >= APB_NUDGE_LIMIT) break;
    if (satisfied[id]) continue;
    if (String(ans[id] == null ? '' : ans[id]).trim()) continue;
    offered.push(id);
  }
  return offered;
}

export function apbNudgeContributions(answers) {
  const ans = answers || {};
  const out = { context: [], need: [], audience: [], tone: [], constraints: [], done: [] };
  // Walks the definitions, not the answers: an answer whose nudge is
  // not offered by the current kind still contributes, which is what
  // keeps a user's words alive across a kind change.
  for (const id of Object.keys(APB_NUDGE_DEFS)) {
    const value = String(ans[id] == null ? '' : ans[id]).trim();
    if (!value) continue;
    const def = APB_NUDGE_DEFS[id];
    out[def.section].push(`${def.prefix}${value}`);
  }
  return out;
}
