export const APB_KINDS = ['writing', 'code', 'plan', 'analysis', 'design', 'general'];

export const APB_KIND_LABELS = {
  writing: 'Writing',
  code: 'Code',
  plan: 'Plan',
  analysis: 'Analysis',
  design: 'Design',
  general: 'General',
};

// Scored lists. `general` is deliberately absent: it is the fallback,
// never a winner on its own merits, and apbScoreKinds pins it to 0.
//
// Spelling variants are listed separately on purpose. Matching is
// word-boundary anchored, so "brand" does NOT match "branding" and
// "analyse" does NOT match "analysis" — each form has to be present.
export const APB_KIND_KEYWORDS = {
  writing: [
    'write', 'writing', 'blog', 'post', 'article', 'essay', 'copy',
    'newsletter', 'email', 'caption', 'script', 'story', 'headline',
    'tagline', 'bio', 'description', 'page', 'social', 'tweet',
    'press release', 'letter', 'draft', 'rewrite', 'proofread',
  ],
  code: [
    'code', 'coding', 'bug', 'fix', 'function', 'api', 'endpoint',
    'database', 'query', 'sql', 'app', 'website', 'deploy', 'test',
    'refactor', 'error', 'css', 'html', 'javascript', 'typescript',
    'python', 'php', 'react', 'wordpress', 'plugin', 'repo',
    'component', 'script', 'build', 'crash',
  ],
  plan: [
    'plan', 'roadmap', 'strategy', 'schedule', 'itinerary', 'steps',
    'launch', 'timeline', 'checklist', 'organise', 'organize',
    'prepare', 'agenda', 'process', 'workflow', 'milestones',
  ],
  analysis: [
    'analyse', 'analyze', 'analysis', 'compare', 'comparison',
    'evaluate', 'research', 'pros and cons', 'data', 'insights',
    'findings', 'assess', 'audit', 'spreadsheet', 'spreadsheets',
    'trends', 'metrics', 'benchmark',
  ],
  design: [
    'design', 'logo', 'layout', 'mockup', 'wireframe', 'branding',
    'brand', 'colour', 'color', 'font', 'typography', 'ui', 'ux',
    'poster', 'flyer', 'visual', 'illustration', 'icon', 'palette',
  ],
};

// Narrower vocabularies win ties. `writing` sits low because its list
// holds broad words ("page", "description", "copy") that would
// otherwise claim ties it has not earned.
export const APB_KIND_TIEBREAK = ['code', 'design', 'analysis', 'plan', 'writing', 'general'];

export function apbEscapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function apbScoreKinds(brief) {
  const text = String(brief == null ? '' : brief);
  const scores = { general: 0 };
  for (const kind of Object.keys(APB_KIND_KEYWORDS)) {
    let hits = 0;
    for (const word of APB_KIND_KEYWORDS[kind]) {
      if (new RegExp(`\\b${apbEscapeRegExp(word)}\\b`, 'i').test(text)) hits += 1;
    }
    scores[kind] = hits;
  }
  return scores;
}

export function apbDetectKind(brief) {
  const scores = apbScoreKinds(brief);
  let best = 'general';
  let bestScore = 0;
  // Walking the tie-break order with a strict `>` means the earliest
  // kind in that order wins any tie, because a later equal score never
  // displaces it.
  for (const kind of APB_KIND_TIEBREAK) {
    if (scores[kind] > bestScore) {
      best = kind;
      bestScore = scores[kind];
    }
  }
  return bestScore === 0 ? 'general' : best;
}

export const APB_TONE_WORDS = [
  'friendly', 'casual', 'formal', 'professional', 'playful', 'serious',
  'witty', 'warm', 'conversational', 'authoritative', 'punchy',
  'concise', 'technical', 'academic', 'humorous', 'upbeat',
  'empathetic', 'blunt', 'neutral', 'plain',
];

// Ordered most explicit first. The bare "for" is last so that a brief
// carrying a real cue is never beaten by an incidental "for".
export const APB_AUDIENCE_CUES = [
  'audience is', 'audience:', 'aimed at', 'targeted at', 'targeting', 'for',
];

export const APB_AUDIENCE_REJECT = [
  'me', 'you', 'us', 'it', 'this', 'that', 'them', 'free', 'now',
  'example', 'instance', 'sure', 'once',
];

export function apbExtractAudience(brief) {
  const text = String(brief == null ? '' : brief);
  for (const cue of APB_AUDIENCE_CUES) {
    // Leading \b only: "audience:" ends in a colon, where a trailing
    // \b would not match. \b before the cue is what stops "for"
    // firing inside "before".
    const match = new RegExp(`\\b${apbEscapeRegExp(cue)}\\s+([^,.;:]+)`, 'i').exec(text);
    if (!match) continue;
    const phrase = match[1].trim().split(/\s+/).slice(0, 5).join(' ').trim();
    if (phrase.length < 3) continue;
    if (APB_AUDIENCE_REJECT.includes(phrase.toLowerCase())) continue;
    return phrase;
  }
  return '';
}

export function apbExtractTone(brief) {
  const text = String(brief == null ? '' : brief);
  const found = [];
  for (const word of APB_TONE_WORDS) {
    const match = new RegExp(`\\b${word}\\b`, 'i').exec(text);
    if (match) found.push({ word, at: match.index });
  }
  found.sort((a, b) => a.at - b.at);
  return found.map((entry) => entry.word).join(', ');
}

export function apbExtractLength(brief) {
  const text = String(brief == null ? '' : brief);
  const counted = /\b(\d{2,5})\s*(words?|characters?|chars?)\b/i.exec(text);
  if (counted) return `${counted[1]} ${counted[2].toLowerCase()}`;
  const unitised = /\b(\d{1,3})\s*(pages?|paragraphs?|slides?|minutes?|mins?)\b/i.exec(text);
  if (unitised) return `${unitised[1]} ${unitised[2].toLowerCase()}`;
  const adjective = /\b(short|brief|long|in-depth|detailed)\b/i.exec(text);
  if (adjective) return adjective[1].toLowerCase();
  return '';
}

const APB_DEADLINE_RE = new RegExp(
  '\\b(?:by|before|due)\\s+('
  + '(?:mon|tues|wednes|thurs|fri|satur|sun)day'
  + '|tomorrow|today|next week|this week'
  + '|\\d{1,2}(?:st|nd|rd|th)?(?:\\s+of)?\\s+'
  + '(?:january|february|march|april|may|june|july|august'
  + '|september|october|november|december)'
  + '|\\d{4}-\\d{2}-\\d{2}'
  + ')',
  'i',
);

export function apbExtractDeadline(brief) {
  const match = APB_DEADLINE_RE.exec(String(brief == null ? '' : brief));
  return match ? match[1] : '';
}

export function apbExtractSignals(brief) {
  return {
    audience: apbExtractAudience(brief),
    tone: apbExtractTone(brief),
    length: apbExtractLength(brief),
    deadline: apbExtractDeadline(brief),
  };
}
