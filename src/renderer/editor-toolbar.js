// The snippet editor's toolbars, modeled on TextExpander's: an icon row of
// macro menus (date, time, fill-ins, keys, cursor, clipboard, snippet,
// special) and, for rich text snippets, a formatting row.

const icon = d => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICONS = {
  date: icon('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  time: icon('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  fill: icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h10M7 17h5"/>'),
  key: icon('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>'),
  cursor: icon('<path d="M9 4h1.5A1.5 1.5 0 0 1 12 5.5v13a1.5 1.5 0 0 1-1.5 1.5H9M15 4h-1.5A1.5 1.5 0 0 0 12 5.5v13a1.5 1.5 0 0 0 1.5 1.5H15"/>'),
  clipboard: icon('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>'),
  snippet: icon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>'),
  special: icon('<path d="m4 17 6-6-6-6M12 19h8"/>'),
  left: icon('<path d="M3 6h18M3 12h12M3 18h16"/>'),
  center: icon('<path d="M3 6h18M6 12h12M4 18h16"/>'),
  right: icon('<path d="M3 6h18M9 12h12M5 18h16"/>'),
  bold: icon('<path d="M7 4h7a4 4 0 0 1 0 8H7zM7 12h8a4 4 0 0 1 0 8H7z"/>'),
  italic: icon('<path d="M19 4h-9M14 20H5M15 4 9 20"/>'),
  underline: icon('<path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16"/>'),
  link: icon('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
  image: icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>'),
};

// Live examples for the date and time menus (same codes as src/macros.js).
// A % on its own is literal; date codes only work inside [[date:...]].
function dateExample(fmt) {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const M = d.toLocaleString('en-US', { month: 'long' }), D = d.toLocaleString('en-US', { weekday: 'long' });
  const codes = {
    Y: d.getFullYear(), y: p(d.getFullYear() % 100), B: M, b: M.slice(0, 3), m: p(d.getMonth() + 1),
    '1m': d.getMonth() + 1, d: p(d.getDate()), e: d.getDate(), A: D, a: D.slice(0, 3),
    H: p(d.getHours()), I: p(d.getHours() % 12 || 12), '1I': d.getHours() % 12 || 12,
    M: p(d.getMinutes()), S: p(d.getSeconds()), p: d.getHours() < 12 ? 'AM' : 'PM',
  };
  return fmt.replace(/%(1[mI]|[YyBbmdeAaHIMSp])/g, (w, c) => codes[c]);
}

const DATE_FORMATS = ['%B %e, %Y', '%m/%d/%Y', '%1m/%e/%y', '%Y-%m-%d', '%A, %B %e', '%b %e', '%A'];
const TIME_FORMATS = ['%1I:%M %p', '%H:%M', '%H:%M:%S'];

// Each menu item inserts text, or runs a rich text command.
function toolbarMenus(snippets, rich) {
  return {
    date: DATE_FORMATS.map(f => ({ label: dateExample(f), insert: `[[date:${f}]]` })),
    time: TIME_FORMATS.map(f => ({ label: dateExample(f), insert: `[[date:${f}]]` })),
    fill: [
      { label: 'Single-line field', insert: '[[filltext:name=Field:default=]]' },
      { label: 'Multi-line field', insert: '[[fillarea:name=Notes:default=]]' },
      { label: 'Popup menu', insert: '[[fillpopup:name=Choice:default=Option 1:Option 2:Option 3]]' },
    ],
    key: [
      ['Tab', 'tab'], ['Return', 'return'], ['Escape', 'esc'],
      ['Up arrow', 'up'], ['Down arrow', 'down'], ['Left arrow', 'left'], ['Right arrow', 'right'],
    ].map(([label, k]) => ({ label: `${label} key`, insert: `[[key:${k}]]` })),
    snippet: snippets.filter(s => s.abbreviation)
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(s => ({ label: `${s.label}  ·  ${s.abbreviation}`, insert: `[[snippet:${s.abbreviation}]]` })),
    special: [
      { label: 'Tab', insert: '\t' },
      { label: 'Non-breaking Space', insert: ' ' },
      { divider: true },
      rich ? { label: 'Numbered List', command: 'insertOrderedList' } : { label: 'Numbered List', insert: '1. \n2. \n3. ' },
      rich ? { label: 'Bulleted List', command: 'insertUnorderedList' } : { label: 'Bulleted List', insert: '• \n• \n• ' },
      { divider: true },
      rich
        ? { label: 'Table', html: '<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><td>&nbsp;</td><td>&nbsp;</td></tr><tr><td>&nbsp;</td><td>&nbsp;</td></tr></table><br>' }
        : { label: 'Table', insert: 'Column 1\tColumn 2\n\t' },
    ],
  };
}

function toolbarHtml(rich) {
  const btn = (id, title, menu = true) =>
    `<button type="button" class="tb-btn" data-tb="${id}" title="${title}" aria-label="${title}"${menu ? ' aria-haspopup="menu"' : ''}>${ICONS[id]}</button>`;
  const fmt = (cmd, title, ico) =>
    `<button type="button" class="tb-btn" data-cmd="${cmd}" title="${title}" aria-label="${title}">${ICONS[ico]}</button>`;
  const fonts = ['System', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Courier New'];
  return `
    <div class="tb-row">
      ${btn('date', 'Insert date')}${btn('time', 'Insert time')}${btn('fill', 'Insert fill-in field')}
      ${btn('key', 'Insert key press')}${btn('cursor', 'Position cursor here', false)}
      ${btn('clipboard', 'Insert clipboard', false)}${btn('snippet', 'Insert another snippet')}
      ${btn('special', 'Insert special')}
    </div>
    ${rich ? `<div class="tb-row tb-format">
      <select id="tb-font" title="Font">${fonts.map(f => `<option>${f}</option>`).join('')}</select>
      <select id="tb-size" title="Size">
        <option value="2">Small</option><option value="3" selected>Normal</option>
        <option value="5">Large</option><option value="6">Huge</option>
      </select>
      <span class="tb-sep"></span>
      ${fmt('justifyLeft', 'Align left', 'left')}${fmt('justifyCenter', 'Align center', 'center')}${fmt('justifyRight', 'Align right', 'right')}
      <span class="tb-sep"></span>
      ${fmt('bold', 'Bold', 'bold')}${fmt('italic', 'Italic', 'italic')}${fmt('underline', 'Underline', 'underline')}
      <span class="tb-sep"></span>
      ${fmt('link', 'Insert link', 'link')}${fmt('image', 'Insert image from URL', 'image')}
    </div>` : ''}`;
}

// ---------- inserting at the caret ----------

let savedRange = null;
document.addEventListener('selectionchange', () => {
  const rich = document.getElementById('f-rich');
  const sel = getSelection();
  if (rich && sel.rangeCount && rich.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
});

function focusRich() {
  const rich = document.getElementById('f-rich');
  rich.focus();
  if (savedRange && rich.contains(savedRange.startContainer)) {
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
  }
}

// Returns true if something was inserted (so the caller can save).
function insertAtCaret(item) {
  const rich = document.getElementById('f-rich');
  if (rich) {
    focusRich();
    if (item.command) document.execCommand(item.command);
    else if (item.html) document.execCommand('insertHTML', false, item.html);
    else document.execCommand('insertText', false, item.insert);
    return true;
  }
  const ta = document.getElementById('f-content');
  if (!ta || item.insert == null) return false;
  ta.focus();
  ta.setRangeText(item.insert, ta.selectionStart, ta.selectionEnd, 'end');
  return true;
}

// ---------- the dropdown menu ----------

function openToolbarMenu(button, items, onPick) {
  closeToolbarMenu();
  const menu = document.createElement('div');
  menu.className = 'tb-menu';
  menu.id = 'tb-menu';
  menu.dataset.for = button.dataset.tb;
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items.length
    ? items.map((it, i) => (it.divider ? '<div class="tb-divider"></div>'
      : `<button type="button" role="menuitem" data-i="${i}">${esc(it.label)}</button>`)).join('')
    : '<div class="tb-empty">Nothing to insert yet</div>';
  document.body.appendChild(menu);
  const r = button.getBoundingClientRect();
  menu.style.left = `${Math.min(r.left, innerWidth - menu.offsetWidth - 8)}px`;
  menu.style.top = `${r.bottom + 4}px`;
  menu.addEventListener('mousedown', e => e.preventDefault()); // keep the editor's selection
  menu.addEventListener('click', e => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    closeToolbarMenu();
    onPick(items[b.dataset.i]);
  });
  menu.querySelector('button')?.focus();
}

function closeToolbarMenu() {
  document.getElementById('tb-menu')?.remove();
}
document.addEventListener('mousedown', e => {
  if (!e.target.closest('#tb-menu') && !e.target.closest('[data-tb]')) closeToolbarMenu();
});
document.addEventListener('keydown', e => {
  const menu = document.getElementById('tb-menu');
  if (!menu) return;
  const items = [...menu.querySelectorAll('button')];
  const i = items.indexOf(document.activeElement);
  if (e.key === 'Escape') { closeToolbarMenu(); e.preventDefault(); }
  else if (e.key === 'ArrowDown') { items[(i + 1) % items.length]?.focus(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { items[(i - 1 + items.length) % items.length]?.focus(); e.preventDefault(); }
});

// ---------- link and image URLs ----------

function askUrl(title) {
  const dlg = document.getElementById('url-dialog');
  document.getElementById('url-title').textContent = title;
  const input = document.getElementById('url-input');
  input.value = 'https://';
  dlg.showModal();
  input.select();
  return new Promise(resolve => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok' ? input.value.trim() : ''), { once: true });
  });
}
