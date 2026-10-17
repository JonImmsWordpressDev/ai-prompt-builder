export const APB_SECTION_ORDER = ['context', 'need', 'details', 'done'];

export const APB_SECTION_HEADINGS = {
  context: 'Background',
  need: 'What I need',
  details: 'Details',
  done: 'What done looks like',
  respond: 'How to respond',
};

// Two halves on purpose. Asking about everything stalls a simple job;
// guessing silently buries the guesses. Big gaps get a question, small
// ones get a stated assumption the user can correct.
export const APB_ASK_FIRST = 'If something important is missing, ask me before you start. '
  + 'For anything minor, make a sensible assumption and tell me what you assumed.';

// Role lines say what the AI is good at, never who the work is for. The
// audience lives in Details, so a role line that named one ("for a general
// audience") would contradict the brief whenever the user named their own.
export const APB_ROLE_LINES = {
  writing: 'You are an experienced writer who produces clear, engaging copy that sounds like a person wrote it.',
  code: 'You are an experienced software engineer. You write correct, readable code and explain your reasoning briefly.',
  plan: 'You are an experienced planner who turns goals into clear, ordered, realistic steps.',
  analysis: 'You are a careful analyst. You weigh evidence, show your reasoning, and say when something is uncertain.',
  design: 'You are an experienced designer with a strong sense of layout, hierarchy and typography.',
  general: 'You are a capable, careful assistant.',
};

// The ask-first clause is appended rather than typed into each string
// so it cannot drift, and so the test that asserts it can be trusted.
export const APB_RESPOND_LINES = {
  writing: `Write the finished piece, ready to use. Use short paragraphs and clear subheadings, and skip filler openings and closings. ${APB_ASK_FIRST}`,
  code: `Give me the working code, with a short explanation of what it does and how to check it. Point out anything you changed beyond what I asked for. ${APB_ASK_FIRST}`,
  plan: `Give me a numbered plan with realistic steps. Say what has to happen first, and flag anything that could hold the rest up. ${APB_ASK_FIRST}`,
  analysis: `Give me your findings first, then the reasoning behind them, then anything you're unsure about. Keep facts and opinions clearly apart. ${APB_ASK_FIRST}`,
  design: `Describe the design clearly enough that someone could build it: layout, hierarchy, colour and type. Explain the main choices in a line each. ${APB_ASK_FIRST}`,
  general: `Give me a clear, complete answer. ${APB_ASK_FIRST}`,
};

function apbClean(list) {
  return (Array.isArray(list) ? list : [])
    .map((entry) => String(entry == null ? '' : entry).trim())
    .filter(Boolean);
}

// A nudge answer and an extracted signal can say the same thing — the user
// typed "friendly" into the brief and also answered the tone chip with it.
// Both are legitimate inputs, so neither is dropped upstream; they are
// de-duplicated here, at the one place that knows they landed in the same
// section.
function apbDedupe(list) {
  const seen = new Set();
  return list.filter((entry) => {
    const key = entry.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function apbAssemblePrompt(brief, kind, signals, contributions) {
  const body = String(brief == null ? '' : brief).trim();
  if (!body) return '';

  const k = APB_ROLE_LINES[kind] ? kind : 'general';
  const sig = signals || {};
  const c = contributions || {};

  const audience = apbDedupe([sig.audience, ...apbClean(c.audience)].filter(Boolean)).join('; ');
  const tone = apbDedupe(
    [sig.tone, ...apbClean(c.tone)]
      .filter(Boolean).join(', ').split(', ')
      .map((part) => part.trim()).filter(Boolean),
  ).join(', ');

  // Audience, tone and constraints share one list. Each used to get its own
  // heading, which turned a one-line brief into five one-line sections that
  // mostly repeated it.
  const detailLines = apbDedupe([
    audience ? `Audience: ${audience}` : '',
    tone ? `Tone: ${tone}` : '',
    sig.length ? `Length: ${sig.length}` : '',
    sig.deadline ? `Deadline: ${sig.deadline}` : '',
    ...apbClean(c.constraints),
  ].filter(Boolean));

  const bodies = {
    context: apbClean(c.context).join('\n\n'),
    need: [body, ...apbClean(c.need)].join('\n\n'),
    details: detailLines.map((line) => `- ${line}`).join('\n'),
    done: apbClean(c.done).join('\n'),
  };

  const parts = [APB_ROLE_LINES[k]];
  for (const key of APB_SECTION_ORDER) {
    if (bodies[key]) parts.push(`## ${APB_SECTION_HEADINGS[key]}\n${bodies[key]}`);
  }
  parts.push(`## ${APB_SECTION_HEADINGS.respond}\n${APB_RESPOND_LINES[k]}`);
  return parts.join('\n\n');
}
