const $ = id => document.getElementById(id);
const ipc = window.api;

let data = { groups: [], snippets: [], settings: {} };
let groupId = 'all';   // 'all', 'suggested' or a group id
let suggestions = [];  // phrases typed often: { text, count }
let snippetId = null;
let query = '';
let renamingGroupId = null;
let saveTimer = null;

const CASE_MODES = [
  ['sensitive', 'Case sensitive (aB, Ab, ab differ)'],
  ['ignore', 'Ignore case'],
  ['adapt', 'Adapt to case of abbreviation'],
];

// ---------- lists ----------

function visibleSnippets() {
  if (query) return searchSnippets(data, query);
  const list = groupId === 'all' ? data.snippets : data.snippets.filter(s => s.groupId === groupId);
  return [...list].sort((a, b) => a.label.localeCompare(b.label));
}

let renderingGroups = false;
function renderGroups() {
  // Keep an in-progress rename (text and caret) across re-renders.
  const editing = document.querySelector('[data-rename]');
  const kept = editing && editing.dataset.rename === renamingGroupId
    ? { value: editing.value, start: editing.selectionStart, end: editing.selectionEnd, focused: document.activeElement === editing }
    : null;
  const counts = new Map();
  for (const s of data.snippets) counts.set(s.groupId, (counts.get(s.groupId) || 0) + 1);
  const groups = [...data.groups].sort((a, b) => a.name.localeCompare(b.name));
  const row = (id, name, count, removable) => {
    const active = !query && groupId === id ? 'active' : '';
    if (renamingGroupId === id) {
      return `<div class="row ${active}"><input data-rename="${id}" value="${esc(name)}" aria-label="Group name"></div>`;
    }
    return `<div class="row ${active}" data-group="${id}">
      <span class="name">${esc(name)}</span><span class="count">${count}</span>
      ${removable ? `<button class="x" data-rename-group="${id}" title="Rename group" aria-label="Rename group">✎</button><button class="x" data-delete-group="${id}" title="Delete group" aria-label="Delete group">×</button>` : ''}
    </div>`;
  };
  renderingGroups = true;
  $('groups').innerHTML =
    row('all', 'All Snippets', data.snippets.length, false) +
    '<div class="section-label">Groups</div>' +
    groups.map(g => row(g.id, g.name, counts.get(g.id) || 0, true)).join('') +
    (data.settings.suggestionsEnabled
      ? '<div class="section-label">Suggested</div>' + row('suggested', 'Suggested Snippets', suggestions.length, false)
      : '');
  renderingGroups = false;
  const input = document.querySelector('[data-rename]');
  if (!input) return;
  if (kept) {
    input.value = kept.value;
    if (kept.focused) { input.focus(); input.setSelectionRange(kept.start, kept.end); }
  } else {
    input.focus();
    input.select();
  }
}

function renderSuggestions() {
  $('list-title').textContent = 'Suggested Snippets';
  $('snippets').innerHTML = suggestions.map((s, i) => `
    <div class="suggestion">
      <div class="phrase">${esc(s.text)}</div>
      <div class="suggestion-foot">
        <span class="muted">Typed ${s.count} times</span>
        <span class="grow"></span>
        <button data-dismiss="${i}">Dismiss</button>
        <button class="primary" data-make="${i}">Make snippet</button>
      </div>
    </div>`).join('')
    || '<div class="empty"><p>Nothing yet.</p><p>Type the same phrase a few times in any app and it will show up here.</p></div>';
  $('list-foot').textContent = `${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'}`;
}

function renderSnippets() {
  if (groupId === 'suggested' && !query) { renderSuggestions(); return; }
  const list = visibleSnippets();
  const groupName = new Map(data.groups.map(g => [g.id, g.name]));
  $('list-title').textContent = query
    ? `Results for “${query}”`
    : groupId === 'all' ? 'All Snippets' : groupName.get(groupId) || '';
  $('snippets').innerHTML = list.map(s => `
    <div class="row snippet-row ${s.id === snippetId ? 'active' : ''}" data-snippet="${s.id}">
      <div class="title"><span class="name">${esc(s.label || 'Untitled')}</span><span class="abbr">${esc(s.abbreviation)}</span></div>
      <div class="sub">${groupId === 'all' || query ? esc(groupName.get(s.groupId) || '') + ' · ' : ''}${esc(snippetPreview(s))}</div>
    </div>`).join('') || '<div class="empty">No snippets here yet</div>';
  $('list-foot').textContent = `${list.length} snippet${list.length === 1 ? '' : 's'}`;
}

// ---------- editor ----------

function abbreviationConflict(s) {
  if (!s.abbreviation) return '';
  const other = data.snippets.find(x => x.id !== s.id && x.abbreviation &&
    (x.abbreviation.endsWith(s.abbreviation) || s.abbreviation.endsWith(x.abbreviation)));
  return other ? `Overlaps with “${other.label}” (${other.abbreviation})` : '';
}

function renderEditor() {
  const s = data.snippets.find(x => x.id === snippetId);
  if (!s) {
    $('editor').innerHTML = `<div class="empty editor-empty">
      <div class="editor-empty-text"><p>Select a snippet, or click <b>+ New Snippet</b> and paste one in from TextExpander.</p>
      <p>Press <kbd>${esc(data.settings.hotkey || '')}</kbd> anywhere to search and insert.</p></div>
      <div class="torty-stage">
        <div class="torty-bubble" id="torty-bubble" role="status" hidden></div>
        <button class="torty-btn" id="torty" title="Click me" aria-label="Torty: click for a joke, word or fact">${TORTY_SVG}</button>
      </div></div>`;
    return;
  }
  const rich = s.contentType === 'rich';
  const options = [...data.groups].sort((a, b) => a.name.localeCompare(b.name))
    .map(g => `<option value="${g.id}" ${g.id === s.groupId ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
  $('editor').innerHTML = `
    <div class="fields">
      <div class="field"><label for="f-label">Label</label><input id="f-label" value="${esc(s.label)}"></div>
      <div class="field"><label for="f-group">Group</label><select id="f-group">${options}</select></div>
      <div class="field"><label for="f-type">Content type</label>
        <select id="f-type"><option value="plain">Plain Text</option><option value="rich" ${rich ? 'selected' : ''}>Rich Text</option></select>
      </div>
    </div>
    <div class="fields fields-abbr">
      <div class="field">
        <label for="f-abbr">Abbreviation (optional)</label>
        <input id="f-abbr" class="abbr-input" value="${esc(s.abbreviation)}" placeholder=";example" spellcheck="false">
        <div class="hint" id="f-abbr-hint">${esc(abbreviationConflict(s))}</div>
      </div>
      <div class="field"><label for="f-case">Case</label>
        <select id="f-case">${CASE_MODES.map(([v, l]) => `<option value="${v}" ${(s.caseMode || 'sensitive') === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
    </div>
    <div class="editor-box">
      <div class="toolbar-wrap">
        ${toolbarHtml(rich)}
        <div class="tb-row tb-actions">
          <span class="muted" id="saved"></span>
          <button type="button" id="copy">Copy</button>
          <button type="button" class="danger" id="delete">Delete</button>
        </div>
      </div>
      ${rich
        ? '<div id="f-rich" class="content rich" contenteditable="true" spellcheck="false"></div>'
        : '<textarea id="f-content" class="content" spellcheck="false" placeholder="Paste or type the snippet text"></textarea>'}
    </div>`;
  if (rich) $('f-rich').innerHTML = s.content;
  else $('f-content').value = s.content;
}

function currentFromEditor() {
  const s = data.snippets.find(x => x.id === snippetId);
  return {
    ...s,
    label: $('f-label').value,
    abbreviation: $('f-abbr').value.trim(),
    caseMode: $('f-case').value,
    groupId: $('f-group').value,
    content: $('f-rich') ? $('f-rich').innerHTML : $('f-content').value,
  };
}

function scheduleSave() {
  $('saved').textContent = 'Editing…';
  const draft = currentFromEditor();
  $('f-abbr-hint').textContent = abbreviationConflict(draft);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
}

// Switching between plain and rich text converts the content.
async function changeContentType(type) {
  const s = currentFromEditor();
  if (type === 'plain') {
    if (!confirm('Switch to plain text? Formatting such as bold, links and images will be removed.')) {
      $('f-type').value = 'rich';
      return;
    }
    s.content = $('f-rich').innerText.replace(/\n$/, '');
  } else {
    s.content = esc(s.content).replace(/\n/g, '<br>');
  }
  s.contentType = type;
  clearTimeout(saveTimer);
  saveTimer = null;
  await ipc.saveSnippet(s);
  data = await ipc.getStore();
  renderEditor();
}

async function flushSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!$('f-label')) return;
  await ipc.saveSnippet(currentFromEditor());
  if ($('saved')) $('saved').textContent = 'Saved';
}

async function select(id) {
  await flushSave();
  snippetId = id;
  renderSnippets();
  renderEditor();
}

function renderAll() {
  renderGroups();
  renderSnippets();
  renderEditor();
}

// ---------- events ----------

$('search').addEventListener('input', e => { query = e.target.value.trim(); renderGroups(); renderSnippets(); });

$('groups').addEventListener('click', async e => {
  const ren = e.target.closest('[data-rename-group]');
  if (ren) {
    renamingGroupId = ren.dataset.renameGroup;
    renderGroups();
    return;
  }
  const del = e.target.closest('[data-delete-group]');
  if (del) {
    const g = data.groups.find(x => x.id === del.dataset.deleteGroup);
    const n = data.snippets.filter(s => s.groupId === g.id).length;
    if (confirm(`Delete the group “${g.name}”${n ? ` and its ${n} snippet${n === 1 ? '' : 's'}` : ''}?`)) {
      if (groupId === g.id) groupId = 'all';
      await ipc.deleteGroup(g.id);
    }
    return;
  }
  const row = e.target.closest('[data-group]');
  if (!row) return;
  // Re-rendering on a second click would swallow the double-click that renames.
  if (row.dataset.group === groupId && !query) return;
  groupId = row.dataset.group;
  query = '';
  $('search').value = '';
  renderGroups();
  renderSnippets();
});

$('groups').addEventListener('dblclick', e => {
  const row = e.target.closest('[data-group]');
  if (!row || row.dataset.group === 'all' || row.dataset.group === 'suggested') return;
  renamingGroupId = row.dataset.group;
  renderGroups();
});

async function finishRename(input, keep) {
  if (renamingGroupId !== input.dataset.rename) return;
  renamingGroupId = null;
  const name = input.value.trim();
  if (keep && name) await ipc.saveGroup({ id: input.dataset.rename, name });
  else renderGroups();
}
$('groups').addEventListener('keydown', e => {
  if (!e.target.dataset.rename) return;
  if (e.key === 'Enter') finishRename(e.target, true);
  if (e.key === 'Escape') finishRename(e.target, false);
});
// Leaving the field saves, but not when it was only removed by a re-render.
$('groups').addEventListener('focusout', e => {
  if (e.target.dataset.rename && !renderingGroups) finishRename(e.target, true);
});

$('new-group').addEventListener('click', async () => {
  const g = await ipc.saveGroup({ name: 'New Group' });
  groupId = g.id;
  renamingGroupId = g.id;
  renderAll();
});

$('snippets').addEventListener('click', e => {
  const make = e.target.closest('[data-make]');
  const dismiss = e.target.closest('[data-dismiss]');
  if (make) { newSnippet(suggestions[make.dataset.make].text); return; }
  if (dismiss) { ipc.dismissSuggestion(suggestions[dismiss.dataset.dismiss].text); return; }
  const row = e.target.closest('[data-snippet]');
  if (row) select(row.dataset.snippet);
});

async function newSnippet(content = '') {
  await flushSave();
  const target = groupId !== 'all' && groupId !== 'suggested' ? groupId
    : data.groups.find(g => g.name === 'My Snippets')?.id || data.groups[0]?.id;
  if (!target) { alert('Create a group first.'); return; }
  const label = firstLine(content).slice(0, 60) || 'New Snippet';
  const s = await ipc.saveSnippet({ groupId: target, label, abbreviation: '', content });
  query = '';
  $('search').value = '';
  snippetId = s.id;
  data = await ipc.getStore();
  renderAll();
  $('f-label').select();
}
$('new-snippet').addEventListener('click', () => newSnippet());

$('editor').addEventListener('input', e => {
  if (['f-label', 'f-abbr', 'f-content', 'f-rich'].includes(e.target.id)) scheduleSave();
});
$('editor').addEventListener('change', e => {
  if (e.target.id === 'f-group' || e.target.id === 'f-case') { scheduleSave(); flushSave(); }
  else if (e.target.id === 'f-type') changeContentType(e.target.value);
  else if (e.target.id === 'tb-font' || e.target.id === 'tb-size') {
    focusRich();
    document.execCommand(e.target.id === 'tb-font' ? 'fontName' : 'fontSize', false,
      e.target.value === 'System' ? '-apple-system, sans-serif' : e.target.value);
    scheduleSave();
  }
});

// Keep the rich editor's selection when a toolbar button is pressed.
$('editor').addEventListener('mousedown', e => {
  if (e.target.closest('.tb-btn')) e.preventDefault();
});

function insertMacro(item) {
  if (insertAtCaret(item)) scheduleSave();
}

$('editor').addEventListener('click', async e => {
  const tb = e.target.closest('[data-tb]');
  const cmd = e.target.closest('[data-cmd]');
  if (e.target.closest('#torty')) {
    tortyTalk();
  } else if (tb) {
    const s = data.snippets.find(x => x.id === snippetId);
    if (tb.dataset.tb === 'cursor') insertMacro({ insert: '[[cursor]]' });
    else if (tb.dataset.tb === 'clipboard') insertMacro({ insert: '[[clipboard]]' });
    else {
      const menus = toolbarMenus(data.snippets.filter(x => x.id !== s.id), s.contentType === 'rich');
      if ($('tb-menu')?.dataset.for === tb.dataset.tb) closeToolbarMenu();
      else openToolbarMenu(tb, menus[tb.dataset.tb], insertMacro);
    }
  } else if (cmd) {
    const c = cmd.dataset.cmd;
    if (c === 'link' || c === 'image') {
      const url = await askUrl(c === 'link' ? 'Link address' : 'Image address');
      if (!url) return;
      focusRich();
      document.execCommand(c === 'link' ? 'createLink' : 'insertImage', false, url);
    } else {
      focusRich();
      document.execCommand(c);
    }
    scheduleSave();
  } else if (e.target.id === 'copy') {
    await flushSave();
    await ipc.copySnippet(snippetId);
    $('saved').textContent = 'Copied';
  } else if (e.target.id === 'delete') {
    const s = data.snippets.find(x => x.id === snippetId);
    if (confirm(`Delete “${s.label}”?`)) {
      clearTimeout(saveTimer);
      saveTimer = null;
      snippetId = null;
      await ipc.deleteSnippet(s.id);
    }
  }
});

// Tab in the content box indents instead of leaving the field.
$('editor').addEventListener('keydown', e => {
  if (e.key !== 'Tab' || e.metaKey || e.ctrlKey) return;
  if (e.target.id === 'f-content') {
    e.preventDefault();
    e.target.setRangeText('\t', e.target.selectionStart, e.target.selectionEnd, 'end');
    scheduleSave();
  } else if (e.target.id === 'f-rich') {
    e.preventDefault();
    document.execCommand('insertText', false, '\t');
  }
});

// Torty blinks at random, now and then twice in a row. Skipped when the
// system asks for reduced motion.
function scheduleBlink() {
  setTimeout(() => {
    const lid = document.querySelector('.torty-lid');
    if (lid && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const blink = () => {
        lid.classList.remove('blink');
        void lid.getBoundingClientRect(); // restart the animation
        lid.classList.add('blink');
      };
      blink();
      if (Math.random() < 0.25) setTimeout(blink, 260);
    }
    scheduleBlink();
  }, 2000 + Math.random() * 5000);
}
scheduleBlink();

// Click Torty: he hops and says something (joke, word of the day, fact, tip).
function tortyTalk() {
  const say = tortySays(data.settings.hotkey);
  const bubble = $('torty-bubble');
  bubble.innerHTML = `<div class="torty-label">${say.label}</div><div>${say.html}</div>`;
  bubble.hidden = false;
  const btn = $('torty');
  btn.classList.remove('hop');
  void btn.offsetWidth;
  btn.classList.add('hop');
}

// ---------- settings ----------

async function renderSettings() {
  const st = await ipc.getStatus();
  $('hotkey').value = data.settings.hotkey;
  $('hotkey-error').textContent = st.hotkeyError;
  $('expansion').checked = data.settings.expansionEnabled;
  $('sound').checked = data.settings.soundEnabled;
  $('suggest').checked = data.settings.suggestionsEnabled;
  $('theme').value = data.settings.theme || 'system';
  renderIgnore();
  $('login').checked = st.openAtLogin;
  $('perm').innerHTML = st.expanderRunning
    ? '<span class="ok">Granted. Abbreviations and paste are active.</span>'
    : '<span class="bad">Not granted. Search copies to the clipboard only.</span>';
  $('grant').hidden = st.expanderRunning;
}

$('go-home').addEventListener('click', () => {
  const btn = $('go-home');
  btn.classList.remove('rock');
  void btn.offsetWidth; // restart the rock on repeat clicks
  btn.classList.add('rock');
  select(null);
});
$('go-home').addEventListener('animationend', () => $('go-home').classList.remove('rock'));
$('open-settings').addEventListener('click', async () => { await renderSettings(); $('settings').showModal(); });
$('close-settings').addEventListener('click', () => $('settings').close());
$('save-hotkey').addEventListener('click', async () => {
  await ipc.saveSettings({ hotkey: $('hotkey').value.trim() });
  await renderSettings();
});
$('expansion').addEventListener('change', e => ipc.saveSettings({ expansionEnabled: e.target.checked }));
$('sound').addEventListener('change', e => ipc.saveSettings({ soundEnabled: e.target.checked }));
$('suggest').addEventListener('change', e => ipc.saveSettings({ suggestionsEnabled: e.target.checked }));
$('clear-history').addEventListener('click', async () => {
  if (confirm('Forget every phrase Torty Text has noticed you typing?')) await ipc.clearSuggestions();
});
// ---------- ignore conditions ----------

const IGNORE_FIELDS = { title: 'Title', url: 'Website URL', app: 'App name' };
const IGNORE_OPS = { contains: 'contains', equals: 'equals', starts: 'starts with', ends: 'ends with' };

function renderIgnore() {
  const rules = data.settings.ignoreRules || [];
  $('ignore-list').innerHTML = rules.map((r, i) => `
    <div class="ignore-item">
      <span>${r.fields.map(f => IGNORE_FIELDS[f]).join(' or ')} ${IGNORE_OPS[r.op]} <b>"${esc(r.text)}"</b></span>
      <button type="button" class="x" data-ignore-delete="${i}" title="Remove" aria-label="Remove condition">${TRASH_ICON}</button>
    </div>`).join('') || '<div class="muted small">Nothing ignored yet.</div>';
}

const TRASH_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/></svg>';

function showIgnoreForm(show) {
  $('ignore-form').hidden = !show;
  $('ig-add').hidden = show;
  $('ig-error').textContent = '';
  if (!show) return;
  $('ig-fields').querySelectorAll('input').forEach(i => { i.checked = i.value === 'url'; });
  $('ig-op').value = 'contains';
  $('ig-text').value = '';
  $('ig-text').focus();
}

$('ig-add').addEventListener('click', () => showIgnoreForm(true));
$('ig-cancel').addEventListener('click', () => showIgnoreForm(false));
$('ig-save').addEventListener('click', async () => {
  const fields = [...$('ig-fields').querySelectorAll('input:checked')].map(i => i.value);
  const text = $('ig-text').value.trim();
  if (!fields.length) { $('ig-error').textContent = 'Pick at least one of Title, Website URL or App name.'; return; }
  if (!text || text.replace(/\*/g, '') === '') { $('ig-error').textContent = 'Enter some text to match.'; return; }
  const rules = [...(data.settings.ignoreRules || []), { fields, op: $('ig-op').value, text }];
  await ipc.saveSettings({ ignoreRules: rules });
  showIgnoreForm(false);
});
$('ig-text').addEventListener('keydown', e => { if (e.key === 'Enter') $('ig-save').click(); });
$('ignore-list').addEventListener('click', async e => {
  const del = e.target.closest('[data-ignore-delete]');
  if (!del) return;
  const rules = (data.settings.ignoreRules || []).filter((_, i) => i !== Number(del.dataset.ignoreDelete));
  await ipc.saveSettings({ ignoreRules: rules });
});

$('theme').addEventListener('change', e => ipc.saveSettings({ theme: e.target.value }));
$('login').addEventListener('change', e => ipc.saveSettings({ openAtLogin: e.target.checked }));
$('grant').addEventListener('click', () => ipc.requestPermission());
$('export').addEventListener('click', () => ipc.exportData());
$('import').addEventListener('click', async () => {
  const res = await ipc.importData();
  if (!res) return;
  if (res.error) alert(`Couldn't import that file: ${res.error}`);
  else alert(`Imported ${res.added} snippet${res.added === 1 ? '' : 's'}.`);
});
$('reveal').addEventListener('click', () => ipc.revealData());

// ---------- boot ----------

// Store updates re-render the lists, but leave the editor alone while the user
// is typing in it so the caret never jumps.
ipc.onStoreChanged(d => {
  data = d;
  if (!['all', 'suggested'].includes(groupId) && !data.groups.some(g => g.id === groupId)) groupId = 'all';
  if (groupId === 'suggested' && !data.settings.suggestionsEnabled) groupId = 'all';
  ipc.getSuggestions().then(list => { suggestions = list; renderGroups(); if (groupId === 'suggested') renderSnippets(); });
  renderGroups();
  renderSnippets();
  if (!data.snippets.some(s => s.id === snippetId)) { snippetId = null; renderEditor(); }
  else if (!$('f-label')) renderEditor();
  if ($('settings').open) renderSettings();
});

window.addEventListener('beforeunload', () => { flushSave(); });

// Commands from the menu bar popover.
ipc.onManagerCommand(async (name, arg) => {
  if (name === 'new') newSnippet(arg || '');
  else if (name === 'settings') { await renderSettings(); if (!$('settings').open) $('settings').showModal(); }
  else if (name === 'select' && data.snippets.some(s => s.id === arg)) {
    groupId = data.snippets.find(s => s.id === arg).groupId;
    query = '';
    $('search').value = '';
    renderGroups();
    await select(arg);
  }
});

ipc.onSuggestionsChanged(list => {
  suggestions = list;
  renderGroups();
  if (groupId === 'suggested') renderSnippets();
});

Promise.all([ipc.getStore(), ipc.getSuggestions()]).then(([d, list]) => {
  data = d;
  suggestions = list;
  renderAll();
});
