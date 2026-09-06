import { apbNonEmptyBlocks } from './profiles.js';
import { apbToList } from './assembler.js';

export const APB_HEDGE_PHRASES = [
  'etc.', 'and so on', 'something like', 'make it better', 'as needed',
];

export const APB_SEVERITY_WEIGHT = { high: 20, medium: 10, low: 5 };

const APB_SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

function apbGoalWords(task) {
  return String((task && task.goal) || '').trim().split(/\s+/).filter(Boolean);
}

function apbBlockMatches(profile, pattern) {
  return apbNonEmptyBlocks(profile).some(
    (b) => pattern.test(String(b.label || '')) || pattern.test(String(b.value || '')),
  );
}

export const APB_GAP_RULES = [
  {
    id: 'no-profile',
    severity: 'high',
    requiresProfile: false,
    test: (p) => !p,
    message: 'No project profile selected. Claude will ask about your stack and conventions.',
  },
  {
    id: 'thin-profile',
    severity: 'high',
    requiresProfile: true,
    test: (p) => apbNonEmptyBlocks(p).length < 3,
    message: 'Profile has fewer than three filled blocks. Claude will ask for the rest.',
  },
  {
    id: 'no-goal',
    severity: 'high',
    requiresProfile: false,
    test: (p, t) => apbGoalWords(t).length === 0,
    message: 'No goal. Without one sentence saying what you want, Claude has nothing to act on.',
  },
  {
    id: 'no-done-when',
    severity: 'high',
    requiresProfile: false,
    test: (p, t) => apbToList(t && t.doneWhen).length === 0 && !apbBlockMatches(p, /\bdone/i),
    message: 'No definition of done. Claude will ask what finished means.',
  },
  {
    // requiresProfile: true means this rule is skipped entirely when there
    // is no profile (see apbAnalyzeGaps below), rather than firing against
    // a null profile. no-profile already covers that case at high severity,
    // so this only ever needs to describe a profile that exists but is
    // lacking.
    //
    // The `>= 3` guard exists so this doesn't double-charge the same
    // underlying fact as thin-profile: a profile with fewer than three
    // filled blocks has nothing in it yet, and thin-profile already says
    // so. Without the guard, selecting a nearly-empty starter profile costs
    // 20 for thin-profile AND 20 for no-verification while only removing
    // the 20 for no-profile, so the score goes DOWN when a user follows the
    // tool's own advice and picks a profile. Once a profile has enough
    // content to plausibly hold a verification command (three-plus filled
    // blocks), it's fair to charge separately for actually missing one.
    id: 'no-verification',
    severity: 'high',
    requiresProfile: true,
    test: (p) => apbNonEmptyBlocks(p).length >= 3 && !apbBlockMatches(p, /\b(test|verif|lint)/i),
    message: 'Profile names no test, lint or verification command. Claude will ask how to check its work.',
  },
  {
    id: 'thin-goal',
    severity: 'medium',
    requiresProfile: false,
    test: (p, t) => {
      const n = apbGoalWords(t).length;
      return n > 0 && n < 8;
    },
    message: 'Goal is under eight words. Short goals draw clarifying questions.',
  },
  {
    id: 'no-detail',
    severity: 'medium',
    requiresProfile: false,
    test: (p, t) => !String((t && t.detail) || '').trim(),
    message: 'No detail. A goal without background leaves the approach up for guessing.',
  },
  {
    id: 'no-output-format',
    severity: 'medium',
    requiresProfile: false,
    test: (p, t) => !String((t && t.outputFormat) || '').trim()
      && !String((p && p.defaultOutputFormat) || '').trim(),
    message: 'No output format. Say whether you want a plan, a diff, or finished code.',
  },
  {
    id: 'no-constraints',
    severity: 'low',
    requiresProfile: false,
    test: (p, t) => apbToList(t && t.constraints).length === 0,
    message: 'No constraints. Naming the limits up front prevents rework.',
  },
  {
    id: 'vague-language',
    severity: 'low',
    requiresProfile: false,
    test: (p, t) => {
      const text = `${(t && t.goal) || ''} ${(t && t.detail) || ''}`.toLowerCase();
      return APB_HEDGE_PHRASES.some((phrase) => text.includes(phrase));
    },
    message: 'Hedging language found. Phrases like "etc." hide requirements Claude cannot guess.',
  },
];

export function apbAnalyzeGaps(profile, task) {
  const p = profile || null;
  const t = task || {};
  const gaps = [];
  for (const rule of APB_GAP_RULES) {
    if (rule.requiresProfile && !p) continue;
    if (rule.test(p, t)) {
      gaps.push({ id: rule.id, severity: rule.severity, message: rule.message });
    }
  }
  gaps.sort((a, b) => APB_SEVERITY_RANK[a.severity] - APB_SEVERITY_RANK[b.severity]);
  const penalty = gaps.reduce((sum, g) => sum + APB_SEVERITY_WEIGHT[g.severity], 0);
  // thin-profile/no-verification and no-goal/thin-goal are each mutually
  // exclusive by construction, so the worst reachable penalty today is 85,
  // not the 100+ needed to actually hit this clamp (see
  // "the worst reachable score is 15 given current weights" in
  // test/gapcheck.test.js). The clamp is kept anyway as a guard against a
  // future rule or weight change making triple digits reachable again.
  return { score: Math.max(0, 100 - penalty), gaps };
}
