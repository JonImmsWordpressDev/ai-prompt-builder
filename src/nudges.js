// Definition order is the contribution order: apbNudgeContributions
// walks these keys, not the answers object, so the rendered prompt is
// stable no matter what order the user filled the chips in.
export const APB_NUDGE_DEFS = {
  audience: { label: "who it's for", section: 'audience', prefix: '' },
  who: { label: "who's involved", section: 'audience', prefix: '' },
  tone: { label: 'a tone', section: 'tone', prefix: '' },
  done: { label: 'what done looks like', section: 'done', prefix: '' },
  test: { label: 'how to test it', section: 'done', prefix: 'Verified by: ' },
  data: { label: 'what data you have', section: 'need', prefix: 'What I have: ' },
  decision: { label: "what decision it's for", section: 'need', prefix: 'This is to help decide: ' },
  length: { label: 'how long', section: 'constraints', prefix: 'Length: ' },
  avoid: { label: 'what to avoid', section: 'constraints', prefix: 'Avoid: ' },
  freeze: { label: 'what not to change', section: 'constraints', prefix: 'Do not change: ' },
  deadline: { label: 'a deadline', section: 'constraints', prefix: 'Deadline: ' },
  where: { label: "where it'll be used", section: 'constraints', prefix: 'Will be used: ' },
  brand: { label: 'brand or colours', section: 'constraints', prefix: 'Brand and colour: ' },
};

// Universal three first, then the kind's own extras.
export const APB_NUDGE_ORDER = {
  writing: ['audience', 'tone', 'done', 'length', 'avoid'],
  code: ['audience', 'tone', 'done', 'test', 'freeze'],
  plan: ['audience', 'tone', 'done', 'deadline', 'who'],
  analysis: ['audience', 'tone', 'done', 'data', 'decision'],
  design: ['audience', 'tone', 'done', 'where', 'brand'],
  general: ['audience', 'tone', 'done', 'avoid'],
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
  const out = { need: [], audience: [], tone: [], constraints: [], done: [] };
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
