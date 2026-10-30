const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { looksLikeTextExpander, looksLikeRichExport } = require('./detect');
const { fromTextExpander } = require('./macros');

const DEFAULT_GROUPS = ['ampscript', 'klaviyo', 'My Snippets', 'responsys'];

function newId() {
  return crypto.randomUUID();
}

function seed() {
  const groups = DEFAULT_GROUPS.map(name => ({ id: newId(), name }));
  const mine = groups.find(g => g.name === 'My Snippets');
  return {
    version: 3,
    settings: { hotkey: 'Control+Alt+Space', expansionEnabled: true, soundEnabled: true, suggestionsEnabled: true, theme: 'system', ignoreRules: [] },
    groups,
    snippets: [{
      id: newId(),
      groupId: mine.id,
      label: "Today's date",
      abbreviation: ';date',
      content: '[[date]]',
      updatedAt: Date.now(),
    }],
  };
}

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'snippets.json');
    fs.mkdirSync(dir, { recursive: true });
    this.data = fs.existsSync(this.file) ? JSON.parse(fs.readFileSync(this.file, 'utf8')) : seed();
    this.data.settings = { ...seed().settings, ...this.data.settings };
    this.migrate();
    this.listeners = [];
    this.write();
  }

  onChange(fn) { this.listeners.push(fn); }

  // Snippets imported from TextExpander before it was recognised:
  // v2 marked them (and turned its rich text exports into rich text);
  // v3 converts their % syntax to [[...]] tokens so % is always literal.
  migrate() {
    const version = this.data.version || 1;
    if (version >= 3) return;
    fs.copyFileSync(this.file, this.file.replace(/\.json$/, `.v${version}-backup.json`));
    for (const s of this.data.snippets) {
      if (version < 2 && !s.contentType && looksLikeRichExport(s.content)) s.contentType = 'rich';
      if (s.syntax === 'textexpander' || (version < 2 && looksLikeTextExpander(s.content))) {
        s.content = fromTextExpander(s.content);
      }
      delete s.syntax;
    }
    this.data.version = 3;
  }

  // Write to a temp file then rename, so a crash mid-write never truncates the library.
  write() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
    this.listeners.forEach(fn => fn(this.data));
  }

  saveSnippet(s) {
    const i = this.data.snippets.findIndex(x => x.id === s.id);
    const next = { ...s, id: s.id || newId(), updatedAt: Date.now() };
    if (i >= 0) this.data.snippets[i] = next; else this.data.snippets.push(next);
    this.write();
    return next;
  }

  deleteSnippet(id) {
    this.data.snippets = this.data.snippets.filter(s => s.id !== id);
    this.write();
  }

  // Most recently inserted first, like TextExpander's Recents.
  markUsed(id) {
    this.data.recent = [id, ...(this.data.recent || []).filter(x => x !== id)].slice(0, 20);
    this.write();
  }

  saveGroup(g) {
    const i = this.data.groups.findIndex(x => x.id === g.id);
    const next = { id: g.id || newId(), name: g.name };
    if (i >= 0) this.data.groups[i] = next; else this.data.groups.push(next);
    this.write();
    return next;
  }

  deleteGroup(id) {
    this.data.groups = this.data.groups.filter(g => g.id !== id);
    this.data.snippets = this.data.snippets.filter(s => s.groupId !== id);
    this.write();
  }

  saveSettings(patch) {
    this.data.settings = { ...this.data.settings, ...patch };
    this.write();
  }

  // Merge an exported file: groups match by name, snippets are always added.
  importData(incoming) {
    const byName = new Map(this.data.groups.map(g => [g.name, g]));
    const idMap = new Map();
    for (const g of incoming.groups || []) {
      let target = byName.get(g.name);
      if (!target) {
        target = { id: newId(), name: g.name };
        this.data.groups.push(target);
        byName.set(g.name, target);
      }
      idMap.set(g.id, target.id);
    }
    let added = 0;
    for (const s of incoming.snippets || []) {
      const groupId = idMap.get(s.groupId);
      if (!groupId) continue;
      this.data.snippets.push({ ...s, id: newId(), groupId, updatedAt: Date.now() });
      added++;
    }
    this.write();
    return added;
  }
}

module.exports = { Store };
