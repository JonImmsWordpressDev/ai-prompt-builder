// Recent prompts, newest first. Pure functions only: ui.js owns storage,
// so everything here can be tested without a browser.
export const APB_HISTORY_LIMIT = 8;

function apbHistoryKey(brief) {
  return String(brief == null ? '' : brief).trim().replace(/\s+/g, ' ').toLowerCase();
}

// Anything read back from storage is untrusted: another version of the
// tool, a hand edit or a half-written save can leave any shape behind.
// Bad entries are dropped one by one rather than discarding the list.
export function apbHistorySanitize(raw, kinds) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    if (typeof entry.brief !== 'string' || !entry.brief.trim()) continue;
    const key = apbHistoryKey(entry.brief);
    if (seen.has(key)) continue;
    seen.add(key);
    const nudges = {};
    if (entry.nudges && typeof entry.nudges === 'object' && !Array.isArray(entry.nudges)) {
      for (const [id, value] of Object.entries(entry.nudges)) {
        if (typeof value === 'string' && value.trim()) nudges[id] = value;
      }
    }
    out.push({
      brief: entry.brief,
      kindPin: kinds.includes(entry.kindPin) ? entry.kindPin : '',
      nudges,
      savedAt: typeof entry.savedAt === 'string' && !Number.isNaN(Date.parse(entry.savedAt))
        ? entry.savedAt : '',
    });
    if (out.length >= APB_HISTORY_LIMIT) break;
  }
  return out;
}

// Saving the same brief again moves it to the top with its latest chip
// answers, rather than leaving two near-identical rows.
export function apbHistoryAdd(list, entry) {
  if (!entry || !String(entry.brief == null ? '' : entry.brief).trim()) return list.slice();
  const key = apbHistoryKey(entry.brief);
  const rest = list.filter((item) => apbHistoryKey(item.brief) !== key);
  return [{ ...entry, nudges: { ...(entry.nudges || {}) } }, ...rest].slice(0, APB_HISTORY_LIMIT);
}

export function apbHistoryHas(list, brief) {
  const key = apbHistoryKey(brief);
  return Boolean(key) && list.some((item) => apbHistoryKey(item.brief) === key);
}

// One line, cut at a word, so a long brief cannot blow out the row.
export function apbHistoryTitle(brief, max = 80) {
  const flat = String(brief == null ? '' : brief).trim().replace(/\s+/g, ' ');
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max / 2 ? cut.slice(0, space) : cut).replace(/[\s,.;:]+$/, '')}…`;
}
