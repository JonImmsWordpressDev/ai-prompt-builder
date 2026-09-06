import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const APB_ROOT = dirname(fileURLToPath(import.meta.url));

export const APB_MODULE_ORDER = [
  'profiles.js', 'assembler.js', 'gapcheck.js', 'storage.js', 'polish.js', 'ui.js',
];

export function apbStripModuleSyntax(source) {
  return source
    .replace(/^import\s[\s\S]*?from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^import\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^export\s+(?=(?:const|let|var|function|class|async)\b)/gm, '');
}

export function apbCollectTopLevelNames(source) {
  const names = [];
  const pattern = /^(?:export\s+)?(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm;
  let match = pattern.exec(source);
  while (match !== null) {
    names.push(match[1]);
    match = pattern.exec(source);
  }
  return names;
}

function apbReadSrc(name) {
  return readFileSync(join(APB_ROOT, 'src', name), 'utf8');
}

export function apbBuildHtml() {
  const pkg = JSON.parse(readFileSync(join(APB_ROOT, 'package.json'), 'utf8'));
  const styles = apbReadSrc('styles.css');

  const seen = new Map();
  const chunks = [];
  for (const name of APB_MODULE_ORDER) {
    const raw = apbReadSrc(name);
    for (const declared of apbCollectTopLevelNames(raw)) {
      if (seen.has(declared)) {
        throw new Error(
          `Duplicate top-level name "${declared}" in ${name}; already declared in ${seen.get(declared)}. `
          + 'Concatenated modules share one scope, so every top-level name must be unique.',
        );
      }
      seen.set(declared, name);
    }
    chunks.push(`/* ---- ${name} ---- */\n${apbStripModuleSyntax(raw).trim()}`);
  }

  const script = chunks.join('\n\n');
  return apbReadSrc('shell.html')
    .replace('<!--INJECT:STYLES-->', `<style>\n${styles.trim()}\n</style>`)
    .replace('<!--INJECT:VERSION-->', `v${pkg.version}`)
    .replace('<!--INJECT:SCRIPT-->', `<script>\n${script}\n</script>`);
}

const APB_IS_CLI = process.argv[1] && process.argv[1].endsWith('build.js');
if (APB_IS_CLI) {
  const html = apbBuildHtml();
  const outDir = join(APB_ROOT, 'dist');
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, 'prompt-builder.html');
  writeFileSync(outFile, html, 'utf8');
  console.log(`Built ${outFile} (${html.length.toLocaleString()} bytes)`);
}
