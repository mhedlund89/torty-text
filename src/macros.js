// Snippet macros. In Torty Text a % is always just a %, which keeps AMPscript
// (%%[ ]%%), Liquid ({% %}) and CSS (100%) exactly as written. Macros are
// bracket tokens instead:
//
//   [[cursor]]                     leave the cursor here
//   [[clipboard]]                  clipboard text
//   [[date]] [[time]]              2026-10-30, 15:05
//   [[date:%B %e, %Y]]             any date/time format (codes below)
//   [[key:tab]]                    press a key (tab, return, esc, arrows...)
//   [[snippet:abbr]]               another snippet, by abbreviation
//   [[filltext:name=First name:default=Sam]]
//   [[fillarea:name=Notes]]
//   [[fillpopup:name=Tone:default=Friendly:Formal:Brief]]
//
// TextExpander's own % syntax is converted to these on import (fromTextExpander).

const pad = n => String(n).padStart(2, '0');
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const DATE_CODES = {
  Y: d => String(d.getFullYear()),
  y: d => pad(d.getFullYear() % 100),
  B: d => MONTHS[d.getMonth()],
  b: d => MONTHS[d.getMonth()].slice(0, 3),
  m: d => pad(d.getMonth() + 1),
  '1m': d => String(d.getMonth() + 1),
  d: d => pad(d.getDate()),
  e: d => String(d.getDate()),
  '1d': d => String(d.getDate()),
  A: d => DAYS[d.getDay()],
  a: d => DAYS[d.getDay()].slice(0, 3),
  H: d => pad(d.getHours()),
  '1H': d => String(d.getHours()),
  I: d => pad(d.getHours() % 12 || 12),
  '1I': d => String(d.getHours() % 12 || 12),
  M: d => pad(d.getMinutes()),
  S: d => pad(d.getSeconds()),
  p: d => (d.getHours() < 12 ? 'AM' : 'PM'),
};
const CODE = '%(?:1[mdHI]|[YyBbmdeAaHIMSp])';

function formatDate(format, now) {
  return format.replace(new RegExp(`%%|${CODE}`, 'g'), m => (m === '%%' ? '%' : DATE_CODES[m.slice(1)](now)));
}

const KEYS = new Set(['tab', 'return', 'enter', 'esc', 'escape', 'up', 'down', 'left', 'right',
  'delete', 'backspace', 'space', 'home', 'end', 'pageup', 'pagedown']);
const TOKEN_RE = /\[\[(cursor|clipboard|date|time)\]\]|\[\[date:([^\]]+)\]\]|\[\[key:([a-z]+)\]\]|\[\[(filltext|fillarea|fillpopup):([^\]]*)\]\]|\[\[snippet:([^\]]+)\]\]/g;
const CURSOR = '\u0000CURSOR\u0000';
const KEY_MARK = '\u0001';

function parseFill(kind, args) {
  const field = { type: kind.replace('fill', ''), name: '', default: '', options: [] };
  for (const part of args.split(':')) {
    const eq = part.indexOf('=');
    const key = eq > 0 ? part.slice(0, eq).toLowerCase() : '';
    const value = eq > 0 ? part.slice(eq + 1) : part;
    if (key === 'name') field.name = value;
    else if (key === 'default') { field.default = value; if (field.type === 'popup') field.options.push(value); }
    else if (key === 'width') field.width = Number(value) || undefined;
    else if (!key && field.type === 'popup' && value) field.options.push(value);
  }
  if (!field.name) field.name = field.type === 'popup' ? 'Choice' : 'Text';
  return field;
}

const asSnippet = x => (typeof x === 'string' ? { content: x } : x);

// One left-to-right pass, so inserted text (clipboard, fill-ins, nested
// snippets) is never scanned for tokens again. Leaves cursor/key markers in.
function expand(snippet, ctx, depth = 0) {
  return snippet.content.replace(TOKEN_RE, (m, word, dateFmt, key, fillKind, fillArgs, abbr) => {
    if (word === 'cursor') return CURSOR;
    if (word === 'clipboard') return ctx.clipboard;
    if (word === 'date') return formatDate('%Y-%m-%d', ctx.now);
    if (word === 'time') return formatDate('%H:%M', ctx.now);
    if (dateFmt) return formatDate(dateFmt, ctx.now);
    if (key) return KEYS.has(key) ? `${KEY_MARK}${key}${KEY_MARK}` : m;
    if (fillKind) {
      const f = parseFill(fillKind, fillArgs);
      ctx.onFill?.(f);
      return f.name in ctx.fills ? ctx.fills[f.name] : f.default;
    }
    const inner = depth < 5 && ctx.snippets.find(x => x.abbreviation === abbr.trim());
    return inner ? expand(inner, ctx, depth + 1) : m;
  });
}

// The fill-in fields a snippet will ask for, one per distinct name.
function fillFields(snippet, snippets = []) {
  const seen = new Map();
  expand(asSnippet(snippet), {
    clipboard: '', snippets, fills: {}, now: new Date(),
    onFill: f => { if (!seen.has(f.name)) seen.set(f.name, f); },
  });
  return [...seen.values()];
}

// Produce what to type: text segments to paste and keys to press between them,
// plus how far to move the cursor back after the last paste.
function render(snippet, { clipboard = '', snippets = [], fills = {}, now = new Date(), keepCursor = false } = {}) {
  const text = expand(asSnippet(snippet), { clipboard, snippets, fills, now });
  const segments = [];
  text.split(KEY_MARK).forEach((part, i) => {
    if (i % 2) segments.push({ type: 'key', key: part });
    else if (part) segments.push({ type: 'text', text: part });
  });

  // Cursor placement works when the cursor sits in the final pasted chunk.
  let cursorBack = 0;
  if (!keepCursor) segments.forEach((seg, i) => {
    if (seg.type !== 'text' || !seg.text.includes(CURSOR)) return;
    const at = seg.text.indexOf(CURSOR);
    seg.text = seg.text.split(CURSOR).join('');
    if (i === segments.length - 1) cursorBack = seg.text.length - at;
  });
  return { segments, cursorBack };
}

// Plain text version (for Copy and the clipboard fallback): keys are dropped.
function renderText(snippet, opts) {
  return render(snippet, opts).segments.filter(s => s.type === 'text').map(s => s.text).join('');
}

// Convert TextExpander's syntax, where a literal % is written %%, to ours.
// Runs of date codes like "%B %e, %Y" become a single [[date:...]] token.
const TE_RE = new RegExp(
  `%%|%\\||%clipboard|%key:([a-z]+)%|%(filltext|fillarea|fillpopup):([^%]*)%|%snippet:([^%]+)%|(${CODE}(?:[ ,/:.\\-]{1,3}${CODE})*)`,
  'g',
);
function fromTextExpander(content) {
  return content.replace(TE_RE, (m, key, fillKind, fillArgs, abbr, dates) => {
    if (m === '%%') return '%';
    if (m === '%|') return '[[cursor]]';
    if (m === '%clipboard') return '[[clipboard]]';
    if (key) return `[[key:${key.toLowerCase()}]]`;
    if (fillKind) return `[[${fillKind}:${fillArgs}]]`;
    if (abbr) return `[[snippet:${abbr}]]`;
    if (dates) return `[[date:${dates}]]`;
    return m;
  });
}

module.exports = { render, renderText, fillFields, fromTextExpander, CURSOR };
