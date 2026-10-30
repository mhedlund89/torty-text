// Watches typing system-wide and swaps a typed abbreviation for its snippet.
// What gets typed is worked out by macros.js; this file only listens and types.
const { clipboard } = require('electron');
const { uIOhook, UiohookKey: K } = require('uiohook-napi');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Keys a snippet can press with %key:name%.
const KEY_CODES = {
  tab: K.Tab, return: K.Enter, enter: K.Enter, esc: K.Escape, escape: K.Escape,
  up: K.ArrowUp, down: K.ArrowDown, left: K.ArrowLeft, right: K.ArrowRight,
  delete: K.Delete, backspace: K.Backspace, space: K.Space,
  home: K.Home, end: K.End, pageup: K.PageUp, pagedown: K.PageDown,
};

// US keyboard layout: keycode -> [plain, shifted]
const KEYMAP = new Map([
  [K.Space, [' ', ' ']],
  [K[1], ['1', '!']], [K[2], ['2', '@']], [K[3], ['3', '#']], [K[4], ['4', '$']], [K[5], ['5', '%']],
  [K[6], ['6', '^']], [K[7], ['7', '&']], [K[8], ['8', '*']], [K[9], ['9', '(']], [K[0], ['0', ')']],
  [K.Semicolon, [';', ':']], [K.Equal, ['=', '+']], [K.Comma, [',', '<']], [K.Minus, ['-', '_']],
  [K.Period, ['.', '>']], [K.Slash, ['/', '?']], [K.Backquote, ['`', '~']], [K.BracketLeft, ['[', '{']],
  [K.Backslash, ['\\', '|']], [K.BracketRight, [']', '}']], [K.Quote, ["'", '"']],
]);
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') KEYMAP.set(K[ch], [ch.toLowerCase(), ch]);

const RESET_KEYS = new Set([
  K.Enter, K.Tab, K.Escape, K.ArrowLeft, K.ArrowRight, K.ArrowUp, K.ArrowDown,
  K.Home, K.End, K.PageUp, K.PageDown, K.Delete,
]);

class Expander {
  constructor({ getSnippets, isEnabled, isOwnWindowFocused, onMatch, onLine }) {
    this.getSnippets = getSnippets;
    this.onMatch = onMatch;
    this.onLine = onLine;
    this.line = ''; // everything typed since the last Enter/Tab/click, for suggestions
    this.isEnabled = isEnabled;
    this.isOwnWindowFocused = isOwnWindowFocused;
    this.buffer = '';
    this.capsLock = false;
    this.injecting = false;
    this.started = false;
  }

  start() {
    if (this.started) return;
    uIOhook.on('keydown', e => this.onKey(e));
    uIOhook.on('mousedown', () => { this.buffer = ''; this.commitLine(); });
    uIOhook.start();
    this.started = true;
  }

  stop() {
    if (this.started) uIOhook.stop();
    this.started = false;
  }

  onKey(e) {
    if (this.injecting) return;
    if (e.keycode === K.CapsLock) { this.capsLock = !this.capsLock; return; }
    if (e.metaKey || e.ctrlKey || RESET_KEYS.has(e.keycode)) { this.buffer = ''; this.commitLine(); return; }
    if (e.keycode === K.Backspace) {
      this.buffer = this.buffer.slice(0, -1);
      this.line = this.line.slice(0, -1);
      return;
    }

    const pair = KEYMAP.get(e.keycode);
    if (!pair) return;
    const isLetter = /[a-z]/.test(pair[0]);
    const shifted = isLetter ? e.shiftKey !== this.capsLock : e.shiftKey;
    const ch = pair[shifted ? 1 : 0];
    this.buffer = (this.buffer + ch).slice(-64);
    this.line = (this.line + ch).slice(-500);

    if (!this.isEnabled() || this.isOwnWindowFocused()) return;
    const match = this.findMatch();
    if (match) {
      this.buffer = '';
      this.line = '';
      this.onMatch?.(match.snippet, match.typed);
    }
  }

  // Longest abbreviation the typed text ends with. Each snippet chooses case
  // handling: 'sensitive' (default) or 'ignore'/'adapt' (any case matches).
  findMatch() {
    let best = null;
    for (const s of this.getSnippets()) {
      const abbr = s.abbreviation;
      if (!abbr || this.buffer.length < abbr.length) continue;
      const typed = this.buffer.slice(-abbr.length);
      const ok = s.caseMode === 'ignore' || s.caseMode === 'adapt'
        ? typed.toLowerCase() === abbr.toLowerCase()
        : typed === abbr;
      if (ok && (!best || abbr.length > best.snippet.abbreviation.length)) best = { snippet: s, typed };
    }
    return best;
  }

  // Hand the finished line to the suggestion tracker, unless it was typed
  // into one of our own windows.
  commitLine() {
    const line = this.line;
    this.line = '';
    if (line.trim() && !this.isOwnWindowFocused()) this.onLine?.(line);
  }

  // Delete the typed abbreviation (used before showing a fill-in form).
  async erase(count) {
    this.injecting = true;
    try {
      await sleep(60); // let the trigger key's keyup land first
      for (let i = 0; i < count; i++) uIOhook.keyTap(K.Backspace);
    } finally {
      this.injecting = false;
    }
  }

  // Type a rendered snippet: text is pasted through the clipboard (fast and
  // exact for long code blocks), keys are pressed, then the user's clipboard
  // is put back.
  async type({ segments, cursorBack }, backspaces = 0) {
    this.injecting = true;
    const saved = clipboard.readText();
    try {
      await sleep(60);
      for (let i = 0; i < backspaces; i++) uIOhook.keyTap(K.Backspace);
      for (const seg of segments) {
        if (seg.type === 'key') {
          uIOhook.keyTap(KEY_CODES[seg.key]);
          await sleep(60);
        } else if (seg.text) {
          if (seg.html) clipboard.write({ text: seg.text, html: seg.html });
          else clipboard.writeText(seg.text);
          await sleep(40);
          uIOhook.keyTap(K.V, [K.Meta]);
          await sleep(200);
        }
      }
      for (let i = 0; i < Math.min(cursorBack, 2000); i++) uIOhook.keyTap(K.ArrowLeft);
      await sleep(200);
    } finally {
      clipboard.writeText(saved);
      this.injecting = false;
    }
  }
}

module.exports = { Expander };
