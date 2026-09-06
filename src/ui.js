// Temporary boot stub. Task 6 replaces this file entirely.
// It exists only so the bundle has an entry point while the pure
// modules are built out.
function apbBoot() {
  const hint = document.getElementById('apb-empty');
  if (hint) hint.textContent = 'Type what you need above and your prompt appears here.';
}

document.addEventListener('DOMContentLoaded', apbBoot);
