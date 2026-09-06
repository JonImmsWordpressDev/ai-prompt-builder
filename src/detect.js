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
