// Recognising and converting what TextExpander exported.
const { fromTextExpander } = require('./macros');

// Rich text snippets export as HTML with <br> line breaks and no real newlines.
function looksLikeRichExport(content) {
  return /<br\s*\/?>/i.test(content) && !content.includes('\n');
}

// TextExpander-only constructs: its macros, or its doubled % (100%% / %%%%[).
function looksLikeTextExpander(content) {
  return /%\||%clipboard|%key:|%fill(text|area|popup)|%snippet:|%%%%|\d%%/.test(content);
}

// A snippet from TextExpander in Torty Text's format. `certain` is set when the
// file itself is known to be a TextExpander export (headerless CSV).
function fromTextExpanderSnippet(content, certain = false) {
  const out = { content };
  if (certain || looksLikeTextExpander(content)) out.content = fromTextExpander(content);
  if (looksLikeRichExport(content)) out.contentType = 'rich';
  return out;
}

module.exports = { fromTextExpanderSnippet, looksLikeTextExpander, looksLikeRichExport };
