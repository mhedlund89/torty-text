// Shared by the manager and the palette. Every word in the query must appear
// somewhere in the snippet; label and abbreviation hits rank above body hits.
function searchSnippets(data, query) {
  const groupName = new Map(data.groups.map(g => [g.id, g.name]));
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = [];
  for (const s of data.snippets) {
    const head = `${s.label} ${s.abbreviation} ${groupName.get(s.groupId) || ''}`.toLowerCase();
    const body = s.content.toLowerCase();
    let score = 0;
    let ok = true;
    for (const w of words) {
      if (head.includes(w)) score += 10;
      else if (body.includes(w)) score += 1;
      else { ok = false; break; }
    }
    if (ok) scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score || a.s.label.localeCompare(b.s.label));
  return scored.map(x => x.s);
}

function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Visible text of a rich text snippet, for previews.
function htmlText(html) {
  // DOMParser doesn't fetch images or run anything in the snippet.
  const doc = new DOMParser().parseFromString(html.replace(/<br\s*\/?>/gi, '\n'), 'text/html');
  return doc.body.textContent;
}

function snippetPreview(s) {
  return firstLine(s.contentType === 'rich' ? htmlText(s.content) : s.content);
}

function firstLine(content) {
  return (content.split('\n').find(l => l.trim()) || '').trim().slice(0, 120);
}
