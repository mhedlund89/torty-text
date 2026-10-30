// Reads snippets from JSON or CSV into the shape Store.importData expects:
// { groups: [{ id, name }], snippets: [{ groupId, label, abbreviation, content }] }
const fs = require('fs');
const path = require('path');
const { fromTextExpanderSnippet } = require('./detect');

// Column/field names we recognise, in order of preference.
const FIELDS = {
  label: ['label', 'name', 'title', 'description'],
  abbreviation: ['abbreviation', 'abbr', 'shortcut', 'trigger', 'keyword'],
  content: ['content', 'snippet', 'text', 'body', 'plaintext', 'expansion', 'value'],
  group: ['group', 'groupname', 'folder', 'category'],
};

const keyOf = name => String(name).toLowerCase().replace(/[^a-z]/g, '');

function fieldFinder(names) {
  const keys = names.map(keyOf);
  return field => {
    for (const want of FIELDS[field]) {
      const i = keys.indexOf(want);
      if (i >= 0) return i;
    }
    return -1;
  };
}

// RFC 4180 CSV: quoted fields, "" escapes, newlines inside quotes.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v.trim()));
}

class Collector {
  constructor() { this.groups = new Map(); this.snippets = []; }

  add(groupName, { label, abbreviation, content, contentType, caseMode }, { fromTextExpander = false, certain = false } = {}) {
    content = content ?? '';
    if (!content && !label) return;
    const name = (groupName || 'Imported').trim() || 'Imported';
    if (!this.groups.has(name)) this.groups.set(name, { id: `import-${this.groups.size}`, name });
    this.snippets.push({
      groupId: this.groups.get(name).id,
      label: (label || content.split('\n').find(l => l.trim()) || 'Imported snippet').trim().slice(0, 80),
      abbreviation: (abbreviation || '').trim(),
      // Torty Text backups keep their fields; anything else may be a
      // TextExpander export and is converted to Torty Text's format.
      ...(fromTextExpander ? fromTextExpanderSnippet(content, certain) : { content, ...(contentType ? { contentType } : {}) }),
      ...(caseMode ? { caseMode } : {}),
    });
  }

  result() { return { groups: [...this.groups.values()], snippets: this.snippets }; }
}

function fromCsv(text, fallbackGroup, out) {
  const rows = parseCsv(text);
  if (!rows.length) return;
  const find = fieldFinder(rows[0]);
  const hasHeader = find('content') >= 0;
  // No header: TextExpander's CSV export order is abbreviation, content, label.
  const col = hasHeader
    ? { label: find('label'), abbreviation: find('abbreviation'), content: find('content'), group: find('group') }
    : { abbreviation: 0, content: 1, label: 2, group: -1 };
  for (const r of hasHeader ? rows.slice(1) : rows) {
    const get = i => (i >= 0 ? r[i] : undefined);
    out.add(get(col.group) || fallbackGroup, {
      label: get(col.label), abbreviation: get(col.abbreviation), content: get(col.content),
    }, { fromTextExpander: true, certain: !hasHeader });
  }
}

function fromJson(data, fallbackGroup, out) {
  // A Torty Text backup: { groups, snippets } with group ids.
  if (Array.isArray(data?.groups) && Array.isArray(data?.snippets)) {
    const names = new Map(data.groups.map(g => [g.id, g.name]));
    for (const s of data.snippets) out.add(names.get(s.groupId) || fallbackGroup, s);
    return;
  }
  const list = Array.isArray(data) ? data : data?.snippets || data?.items || [];
  for (const item of list) {
    if (typeof item !== 'object' || !item) continue;
    const names = Object.keys(item);
    const find = fieldFinder(names);
    const get = f => (find(f) >= 0 ? item[names[find(f)]] : undefined);
    const content = get('content');
    out.add(get('group') || fallbackGroup, {
      label: get('label'), abbreviation: get('abbreviation'),
      content: typeof content === 'string' ? content : content == null ? '' : JSON.stringify(content, null, 2),
    }, { fromTextExpander: true });
  }
}

function readSnippetFiles(files) {
  const out = new Collector();
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const fallbackGroup = path.basename(file, path.extname(file));
    if (/\.csv$/i.test(file)) fromCsv(text, fallbackGroup, out);
    else fromJson(JSON.parse(text), fallbackGroup, out);
  }
  return out.result();
}

module.exports = { readSnippetFiles, parseCsv };
