export const APB_SECTION_ORDER = ['need', 'audience', 'tone', 'constraints', 'done'];

export const APB_SECTION_HEADINGS = {
  need: 'What I need',
  audience: "Who it's for",
  tone: 'Tone',
  constraints: 'Constraints',
  done: 'What done looks like',
  respond: 'How to respond',
};

export const APB_ASK_FIRST = 'If something important is missing, ask me before you start.';

export const APB_ROLE_LINES = {
  writing: 'You are an experienced writer who produces clear, engaging copy for a general audience.',
  code: 'You are an experienced software engineer. You write correct, readable code and explain your reasoning briefly.',
  plan: 'You are an experienced planner who turns goals into clear, ordered, realistic steps.',
  analysis: 'You are a careful analyst. You weigh evidence, show your reasoning, and say when something is uncertain.',
  design: 'You are an experienced designer with a strong sense of layout, hierarchy and typography.',
  general: 'You are a capable, careful assistant.',
};

// The ask-first clause is appended rather than typed into each string
// so it cannot drift, and so the test that asserts it can be trusted.
export const APB_RESPOND_LINES = {
  writing: `Write the finished piece, ready to use. Use short paragraphs and clear subheadings. ${APB_ASK_FIRST}`,
  code: `Give me the working code, with a short explanation of what it does and how to check it. ${APB_ASK_FIRST}`,
  plan: `Give me a numbered plan with realistic steps. Say what has to happen first. ${APB_ASK_FIRST}`,
  analysis: `Give me your findings, the reasoning behind them, and anything you're unsure about. ${APB_ASK_FIRST}`,
  design: `Describe the design clearly enough that someone could build it \u2014 layout, hierarchy, colour and type. ${APB_ASK_FIRST}`,
  general: `Give me a clear, complete answer. ${APB_ASK_FIRST}`,
};

function apbClean(list) {
  return (Array.isArray(list) ? list : [])
    .map((entry) => String(entry == null ? '' : entry).trim())
    .filter(Boolean);
}

export function apbAssemblePrompt(brief, kind, signals, contributions) {
  const body = String(brief == null ? '' : brief).trim();
  if (!body) return '';

  const k = APB_ROLE_LINES[kind] ? kind : 'general';
  const sig = signals || {};
  const c = contributions || {};

  const constraintLines = [
    sig.length ? `Length: ${sig.length}` : '',
    sig.deadline ? `Deadline: ${sig.deadline}` : '',
    ...apbClean(c.constraints),
  ].filter(Boolean);

  const bodies = {
    need: [body, ...apbClean(c.need)].join('\n\n'),
    audience: [sig.audience, ...apbClean(c.audience)].filter(Boolean).join('\n'),
    tone: [sig.tone, ...apbClean(c.tone)].filter(Boolean).join(', '),
    constraints: constraintLines.map((line) => `- ${line}`).join('\n'),
    done: apbClean(c.done).join('\n'),
  };

  const parts = [APB_ROLE_LINES[k]];
  for (const key of APB_SECTION_ORDER) {
    if (bodies[key]) parts.push(`## ${APB_SECTION_HEADINGS[key]}\n${bodies[key]}`);
  }
  parts.push(`## ${APB_SECTION_HEADINGS.respond}\n${APB_RESPOND_LINES[k]}`);
  return parts.join('\n\n');
}
