// The fill-in form shown before a snippet with %filltext%, %fillarea% or
// %fillpopup% fields is typed.
const form = document.getElementById('form');
let fields = [];

window.api.getFill().then(req => {
  if (!req) return;
  fields = req.fields;
  document.getElementById('title').textContent = req.label || 'Fill in';
  document.getElementById('fields').innerHTML = fields.map((f, i) => {
    const id = `f${i}`;
    const label = `<label for="${id}">${esc(f.name)}</label>`;
    if (f.type === 'area') return `<div class="field">${label}<textarea id="${id}" rows="4">${esc(f.default)}</textarea></div>`;
    if (f.type === 'popup') {
      const opts = f.options.map(o => `<option ${o === f.default ? 'selected' : ''}>${esc(o)}</option>`).join('');
      return `<div class="field">${label}<select id="${id}">${opts}</select></div>`;
    }
    return `<div class="field">${label}<input id="${id}" value="${esc(f.default)}"></div>`;
  }).join('');
  const first = document.getElementById('f0');
  first?.focus();
  first?.select?.();
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const values = {};
  fields.forEach((f, i) => { values[f.name] = document.getElementById(`f${i}`).value; });
  window.api.submitFill(values);
});
document.getElementById('cancel').addEventListener('click', () => window.api.submitFill(null));
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') window.api.submitFill(null);
  // Cmd+Enter inserts even from a multi-line field.
  if (e.key === 'Enter' && e.metaKey) form.requestSubmit();
});
