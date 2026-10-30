const q = document.getElementById('q');
const results = document.getElementById('results');
const count = document.getElementById('count');
let data = { groups: [], snippets: [], recent: [] };
let matches = [];
let active = 0;

// Empty search shows Recents (falling back to everything when nothing has been used yet).
function currentList() {
  if (q.value.trim()) return { list: searchSnippets(data, q.value), label: 'matching' };
  const byId = new Map(data.snippets.map(s => [s.id, s]));
  const recent = (data.recent || []).map(id => byId.get(id)).filter(Boolean);
  if (recent.length) return { list: recent, label: 'in Recents' };
  return { list: [...data.snippets].sort((a, b) => a.label.localeCompare(b.label)), label: '' };
}

function render() {
  const { list, label } = currentList();
  matches = list.slice(0, 50);
  active = Math.min(active, Math.max(matches.length - 1, 0));
  results.innerHTML = matches.length
    ? matches.map((s, i) => `
      <div class="pop-row ${i === active ? 'active' : ''}" data-i="${i}">
        <span class="name">${esc(s.label || 'Untitled')}</span>
        ${s.abbreviation ? `<span class="pill">${esc(s.abbreviation)}</span>` : ''}
        <span class="key">${i < 9 ? `⌘${i + 1}` : ''}</span>
      </div>`).join('')
    : '<div class="pop-empty">No matching snippets</div>';
  count.textContent = label
    ? `${list.length} item${list.length === 1 ? '' : 's'} ${label}`
    : `${list.length} snippet${list.length === 1 ? '' : 's'}`;
  document.getElementById('edit-last').disabled = !(data.recent || []).length;
  results.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
}

function choose(i) {
  const s = matches[i];
  if (s) window.api.insert(s.id);
}

q.addEventListener('input', () => { active = 0; render(); });
document.addEventListener('keydown', e => {
  if (e.metaKey && /^[1-9]$/.test(e.key)) { choose(Number(e.key) - 1); e.preventDefault(); }
  else if (e.key === 'ArrowDown') { active = Math.min(active + 1, matches.length - 1); render(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); render(); e.preventDefault(); }
  else if (e.key === 'Enter') { choose(active); e.preventDefault(); }
  else if (e.key === 'Escape') { window.api.hidePalette(); }
});
results.addEventListener('mousemove', e => {
  const row = e.target.closest('[data-i]');
  if (row && Number(row.dataset.i) !== active) { active = Number(row.dataset.i); render(); }
});
results.addEventListener('click', e => {
  const row = e.target.closest('[data-i]');
  if (row) choose(Number(row.dataset.i));
});
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (btn && !btn.disabled) window.api.paletteAction(btn.dataset.action);
});

window.api.onStoreChanged(d => { data = d; render(); });
window.api.onPaletteOpen(async () => {
  data = await window.api.getStore();
  q.value = '';
  active = 0;
  render();
  q.focus();
});
window.api.getStore().then(d => { data = d; render(); });
