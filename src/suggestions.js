// Notices phrases you type again and again and offers them as snippets.
// Kept deliberately light and private: a phrase seen once lives only in
// memory; only phrases typed at least twice are written to disk, in a file
// readable by you alone. Short lines (under 3 words) are ignored, which also
// skips most passwords.
const fs = require('fs');
const path = require('path');

const SUGGEST_AT = 3;     // times typed before it is suggested
const PERSIST_AT = 2;     // times typed before it is saved to disk
const MAX_PHRASES = 500;

function normalize(text) {
  return text.trim().replace(/\s+/g, ' ');
}

function isCandidate(text) {
  return text.length >= 15 && text.length <= 300
    && text.split(' ').length >= 3
    && /[a-z]/i.test(text);
}

// The whole line, plus each sentence in it when there are several.
function candidates(line) {
  const text = normalize(line);
  const out = new Set();
  if (isCandidate(text)) out.add(text);
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length > 1) sentences.map(normalize).filter(isCandidate).forEach(s => out.add(s));
  return [...out];
}

class Suggestions {
  constructor(dir) {
    this.file = path.join(dir, 'suggestions.json');
    this.memory = new Map(); // key -> { text, count, last }
    this.dismissed = new Set();
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      for (const p of saved.phrases || []) this.memory.set(p.text.toLowerCase(), p);
      for (const d of saved.dismissed || []) this.dismissed.add(d);
    } catch { /* first run */ }
  }

  // Returns true when this line pushed a phrase over the suggestion threshold.
  record(line) {
    let crossed = false;
    for (const text of candidates(line)) {
      const key = text.toLowerCase();
      if (this.dismissed.has(key)) continue;
      const entry = this.memory.get(key) || { text, count: 0, last: 0 };
      entry.count++;
      entry.last = Date.now();
      this.memory.set(key, entry);
      if (entry.count === SUGGEST_AT) crossed = true;
    }
    this.prune();
    this.scheduleSave();
    return crossed;
  }

  prune() {
    if (this.memory.size <= MAX_PHRASES) return;
    const oldest = [...this.memory.entries()].sort((a, b) => a[1].last - b[1].last);
    for (const [key] of oldest.slice(0, this.memory.size - MAX_PHRASES)) this.memory.delete(key);
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save(), 2000);
  }

  save() {
    const phrases = [...this.memory.values()].filter(p => p.count >= PERSIST_AT);
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ phrases, dismissed: [...this.dismissed] }, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  // Suggestions that aren't already the body of an existing snippet.
  list(snippets) {
    const existing = new Set(snippets.map(s => normalize(s.content).toLowerCase()));
    return [...this.memory.values()]
      .filter(p => p.count >= SUGGEST_AT && !existing.has(p.text.toLowerCase()))
      .sort((a, b) => b.count - a.count || b.last - a.last)
      .slice(0, 30)
      .map(({ text, count }) => ({ text, count }));
  }

  dismiss(text) {
    const key = text.toLowerCase();
    this.dismissed.add(key);
    this.memory.delete(key);
    this.save();
  }

  clear() {
    this.memory.clear();
    this.dismissed.clear();
    this.save();
  }
}

module.exports = { Suggestions, candidates };
