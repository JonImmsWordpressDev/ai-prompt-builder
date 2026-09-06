export const APB_SECTION_ORDER = [
  'role', 'context', 'task', 'constraints', 'done_when', 'output_format',
];

export function apbToList(value) {
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split('\n').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function apbNeutraliseOwnClosingTag(body, tag) {
  return body.split(`</${tag}>`).join(`<\u200B/${tag}>`);
}

function apbRenderBlock(block) {
  if (!block) return '';
  const label = String(block.label == null ? '' : block.label).trim();
  const value = String(block.value == null ? '' : block.value).trim();
  if (!value) return '';
  if (!label) return value;
  if (!value.includes('\n')) return `${label}: ${value}`;
  const indented = value.split('\n').map((line) => `  ${line}`).join('\n');
  return `${label}:\n${indented}`;
}

export function apbAssemblePrompt(profile, task) {
  const p = profile || null;
  const t = task || {};
  const sections = [];

  const role = String(t.roleOverride || '').trim() || String((p && p.role) || '').trim();
  if (role) sections.push(['role', role]);

  const contextLines = [];
  const projectName = String((p && p.name) || '').trim();
  if (projectName) contextLines.push(`Project: ${projectName}`);
  if (p && Array.isArray(p.blocks)) {
    for (const block of p.blocks) {
      const rendered = apbRenderBlock(block);
      if (rendered) contextLines.push(rendered);
    }
  }
  if (contextLines.length) sections.push(['context', contextLines.join('\n')]);

  const goal = String(t.goal || '').trim();
  const detail = String(t.detail || '').trim();
  const body = goal && detail ? `${goal}\n\n${detail}` : goal || detail;
  if (body) sections.push(['task', body]);

  const constraints = apbToList(t.constraints);
  if (constraints.length) {
    sections.push(['constraints', constraints.map((c) => `- ${c}`).join('\n')]);
  }

  const doneWhen = apbToList(t.doneWhen);
  if (doneWhen.length) {
    sections.push(['done_when', doneWhen.map((d) => `- ${d}`).join('\n')]);
  }

  const outputFormat = String(t.outputFormat || '').trim()
    || String((p && p.defaultOutputFormat) || '').trim();
  if (outputFormat) sections.push(['output_format', outputFormat]);

  return sections
    .map(([tag, sectionBody]) => `<${tag}>\n${apbNeutraliseOwnClosingTag(sectionBody, tag)}\n</${tag}>`)
    .join('\n\n');
}
