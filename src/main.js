const {
  app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, dialog, shell,
  screen, systemPreferences, nativeImage, clipboard, nativeTheme,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { Store } = require('./store');
const { Expander } = require('./expander');
const { render, renderText, fillFields, CURSOR } = require('./macros');
const { Suggestions } = require('./suggestions');
const { readSnippetFiles } = require('./importer');
const { isIgnoredNow } = require('./ignore');

let store, expander, suggestions, tray, managerWin, paletteWin;

const windowBackground = () => (nativeTheme.shouldUseDarkColors ? '#1e2430' : '#f5f6f8');
let hotkeyError = '';

if (!app.requestSingleInstanceLock()) app.quit();

const page = name => path.join(__dirname, 'renderer', name);
const asset = name => path.join(__dirname, '..', 'assets', name);

// Menu bar icon: assets/trayTemplate.png (the Torty turtle, black on
// transparent, 18px tall, with a @2x copy) recolors itself for light and dark menu bars. A colored
// assets/tray.png is used as-is. Neither present: fall back to a text glyph.
function setTrayIcon() {
  for (const file of ['trayTemplate.png', 'tray.png']) {
    if (fs.existsSync(asset(file))) {
      // createFromPath also loads the @2x file for Retina menu bars.
      const img = nativeImage.createFromPath(asset(file));
      img.setTemplateImage(file.includes('Template'));
      tray.setImage(img);
      tray.setTitle('');
      return;
    }
  }
  tray.setTitle('✂︎');
}
const isTrusted = () => systemPreferences.isTrustedAccessibilityClient(false);

function broadcast() {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('store:changed', store.data);
}

// ---------- windows ----------

function bringToFront(win) {
  win.show();
  win.moveTop();
  app.focus({ steal: true });
  win.focus();
}

// Run a command in the manager window (new snippet, select, settings), opening
// it first if needed and waiting for the page to load.
let managerLoaded = null;
async function managerCommand(name, arg) {
  await openManager();
  await managerLoaded;
  managerWin.webContents.send('manager:command', name, arg);
}

async function openManager() {
  if (managerWin) { bringToFront(managerWin); return; }
  await app.dock?.show(); // leave menu-bar-only mode before the window exists
  managerWin = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 560,
    title: 'Torty Text', show: false,
    backgroundColor: windowBackground(),
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  managerWin.once('ready-to-show', () => bringToFront(managerWin));
  if (process.env.SE_DEBUG) managerWin.webContents.on('console-message', (_e, _l, msg, line, src) => console.log('[renderer]', msg, src, line));
  managerLoaded = new Promise(r => managerWin.webContents.once('did-finish-load', r));
  managerWin.loadFile(page('manager.html'));
  managerWin.on('closed', () => { managerWin = null; app.dock?.hide(); });
}

// One popover serves both the menu bar icon and the global hotkey.
let paletteHiddenAt = 0;
function createPalette() {
  paletteWin = new BrowserWindow({
    width: 480, height: 470, show: false, frame: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, fullscreenable: false,
    transparent: true, hasShadow: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js') },
  });
  paletteWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  paletteWin.loadFile(page('palette.html'));
  paletteWin.on('blur', () => { paletteWin.hide(); paletteHiddenAt = Date.now(); });
}

function showPalette(anchor) {
  const [w] = paletteWin.getSize();
  let x, y;
  if (anchor) {
    // Drop down from the menu bar icon, kept on screen.
    const { workArea } = screen.getDisplayMatching(anchor);
    x = Math.min(Math.max(anchor.x + anchor.width / 2 - w / 2, workArea.x + 8), workArea.x + workArea.width - w - 8);
    y = anchor.y + anchor.height + 4;
  } else {
    const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    x = workArea.x + (workArea.width - w) / 2;
    y = workArea.y + workArea.height * 0.2;
  }
  paletteWin.setPosition(Math.round(x), Math.round(y));
  paletteWin.webContents.send('palette:open');
  paletteWin.show();
  app.focus({ steal: true });
  paletteWin.focus();
}

// Hiding the app hands focus back to whichever app was frontmost before the palette.
function returnFocus() {
  paletteWin.hide();
  if (!managerWin?.isFocused()) app.hide();
}

// ---------- hotkey, tray, permissions ----------

function registerHotkey() {
  globalShortcut.unregisterAll();
  hotkeyError = '';
  try {
    if (!globalShortcut.register(store.data.settings.hotkey, () => showPalette())) {
      hotkeyError = `"${store.data.settings.hotkey}" is taken by another app.`;
    }
  } catch {
    hotkeyError = `"${store.data.settings.hotkey}" is not a valid shortcut.`;
  }
}

function startExpander() {
  if (!isTrusted()) return false;
  try { expander.start(); } catch (err) { console.error('keyboard hook failed:', err); }
  return expander.started;
}

// Left click opens the popover; right click shows this menu.
let trayMenu;
function buildTray() {
  const { settings } = store.data;
  const items = [
    { label: 'Search Snippets…', accelerator: settings.hotkey, click: () => showPalette() },
    { label: 'Open Torty Text', click: openManager },
    { type: 'separator' },
    {
      label: 'Expand Abbreviations', type: 'checkbox', checked: settings.expansionEnabled,
      click: item => store.saveSettings({ expansionEnabled: item.checked }),
    },
  ];
  if (!expander.started) {
    items.push({
      label: 'Grant Accessibility Permission…',
      click: () => systemPreferences.isTrustedAccessibilityClient(true),
    });
  }
  items.push({ type: 'separator' }, { label: 'Quit', role: 'quit' });
  trayMenu = Menu.buildFromTemplate(items);
}

// ---------- expanding a snippet ----------

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Rich text snippets store HTML; this is its plain-text version.
function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<\/t[dh]>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, '\u00a0').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n+$/, '');
}
const plainOf = (s, text) => (s.contentType === 'rich' ? htmlToText(text) : text);
const escapeHtml = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 'adapt' case mode: ;SIG gives an all-caps snippet, ;Sig capitalizes the first letter.
function adaptCase(segments, snippet, typed) {
  if (snippet.caseMode !== 'adapt' || !/[a-z]/i.test(typed)) return;
  const first = segments.find(x => x.type === 'text' && x.text);
  if (typed === typed.toUpperCase() && typed !== typed.toLowerCase()) {
    for (const seg of segments) if (seg.type === 'text') { seg.text = seg.text.toUpperCase(); if (seg.html) seg.html = seg.html.replace(/(^|>)([^<]+)/g, (m, a, b) => a + b.toUpperCase()); }
  } else if (first && /[A-Z]/.test(typed[0]) && /[a-z]/.test(snippet.abbreviation[0])) {
    first.text = first.text.charAt(0).toUpperCase() + first.text.slice(1);
    if (first.html) first.html = first.html.replace(/(^|>)([^<\s])/, (m, a, b) => a + b.toUpperCase());
  }
}

// One path for abbreviations, the popover and the hotkey: ask for fill-ins
// if the snippet has any, render the macros, then type it.
async function expandSnippet(s, { backspaces = 0, typed = '' } = {}) {
  store.markUsed(s.id);
  const clip = clipboard.readText();
  const fields = fillFields(s, store.data.snippets);
  let fills = {};
  if (fields.length) {
    if (backspaces && expander.started) await expander.erase(backspaces);
    backspaces = 0;
    fills = await askFills(s.label, fields);
    if (!fills) return; // cancelled
    app.hide(); // hand focus back to the app you were typing in
    await sleep(250); // let focus settle back in the other app
  }
  const rich = s.contentType === 'rich';
  if (rich) for (const k of Object.keys(fills)) fills[k] = escapeHtml(fills[k]).replace(/\n/g, '<br>');
  const out = render(s, { clipboard: rich ? escapeHtml(clip) : clip, snippets: store.data.snippets, fills, keepCursor: rich });
  if (rich) {
    // Count the cursor offset in visible characters, not HTML.
    out.segments.forEach((seg, i) => {
      if (seg.type !== 'text') return;
      const text = htmlToText(seg.text);
      const at = text.indexOf(CURSOR);
      if (at >= 0 && i === out.segments.length - 1) out.cursorBack = text.length - at - CURSOR.length;
      seg.html = seg.text.split(CURSOR).join('');
      seg.text = text.split(CURSOR).join('');
    });
  }
  adaptCase(out.segments, s, typed);
  if (!expander.started) {
    // No keyboard permission: leave it on the clipboard instead.
    clipboard.writeText(out.segments.filter(x => x.type === 'text').map(x => x.text).join(''));
    return;
  }
  // Start the sound alongside the paste: afplay takes ~100ms to start, about
  // when the text lands. type() itself waits another ~400ms before resolving.
  playExpandSound();
  await expander.type(out, backspaces);
}

// A soft pop after each expansion: the macOS built-in Pop sound, played quietly.
function playExpandSound() {
  if (!store.data.settings.soundEnabled) return;
  execFile('afplay', ['-v', '0.4', '/System/Library/Sounds/Pop.aiff'], () => {});
}

// The fill-in form: a small window that resolves with the values, or null.
let fillRequest = null;
function askFills(label, fields) {
  return new Promise(resolve => {
    const height = 140 + fields.reduce((h, f) => h + (f.type === 'area' ? 120 : 66), 0);
    const win = new BrowserWindow({
      width: 460, height: Math.min(height, 720), title: `Fill in: ${label}`, show: false,
      alwaysOnTop: true, minimizable: false, maximizable: false, fullscreenable: false,
      backgroundColor: windowBackground(),
      webPreferences: { preload: path.join(__dirname, 'preload.js') },
    });
    fillRequest = { label, fields, resolve, win };
    win.loadFile(page('fill.html'));
    win.once('ready-to-show', () => bringToFront(win));
    win.on('closed', () => finishFill(null));
  });
}
function finishFill(values) {
  if (!fillRequest) return;
  const { resolve, win } = fillRequest;
  fillRequest = null;
  if (!win.isDestroyed()) win.destroy();
  resolve(values);
}

function broadcastSuggestions() {
  managerWin?.webContents.send('suggestions:changed', suggestions.list(store.data.snippets));
}

function status() {
  return {
    trusted: isTrusted(),
    expanderRunning: expander.started,
    hotkeyError,
    dataFile: store.file,
    openAtLogin: app.getLoginItemSettings().openAtLogin,
  };
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('store:get', () => store.data);
  ipcMain.handle('status:get', status);
  ipcMain.handle('snippet:save', (_e, s) => store.saveSnippet(s));
  ipcMain.handle('snippet:delete', (_e, id) => store.deleteSnippet(id));
  ipcMain.handle('group:save', (_e, g) => store.saveGroup(g));
  ipcMain.handle('group:delete', (_e, id) => store.deleteGroup(id));
  ipcMain.handle('snippet:copy', (_e, id) => {
    const s = store.data.snippets.find(x => x.id === id);
    if (s) clipboard.writeText(plainOf(s, renderText(s, { clipboard: clipboard.readText(), snippets: store.data.snippets })));
  });

  ipcMain.handle('suggestions:get', () => suggestions.list(store.data.snippets));
  ipcMain.handle('suggestions:dismiss', (_e, text) => { suggestions.dismiss(text); broadcastSuggestions(); });
  ipcMain.handle('suggestions:clear', () => { suggestions.clear(); broadcastSuggestions(); });

  ipcMain.handle('settings:save', (_e, patch) => {
    if ('openAtLogin' in patch) app.setLoginItemSettings({ openAtLogin: patch.openAtLogin });
    const { openAtLogin, ...rest } = patch;
    store.saveSettings(rest);
    if ('hotkey' in rest) registerHotkey();
    if ('theme' in rest) nativeTheme.themeSource = rest.theme;
    return status();
  });

  ipcMain.handle('permission:request', () => {
    systemPreferences.isTrustedAccessibilityClient(true);
    shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility');
  });

  ipcMain.handle('palette:insert', async (_e, id) => {
    const s = store.data.snippets.find(x => x.id === id);
    returnFocus();
    if (!s) return;
    await new Promise(r => setTimeout(r, 150));
    await expandSnippet(s);
  });

  ipcMain.handle('fill:get', () => fillRequest && { label: fillRequest.label, fields: fillRequest.fields });
  ipcMain.handle('fill:submit', (_e, values) => finishFill(values));
  ipcMain.handle('palette:hide', returnFocus);

  // The popover's bottom buttons and gear.
  ipcMain.handle('palette:action', (_e, action) => {
    paletteWin.hide();
    const text = action === 'newFromClipboard' ? clipboard.readText() : '';
    if (action === 'new' || action === 'newFromClipboard') managerCommand('new', text);
    else if (action === 'editLast') managerCommand('select', store.data.recent?.[0]);
    else if (action === 'settings') managerCommand('settings');
    else openManager();
  });

  ipcMain.handle('data:export', async () => {
    const { filePath, canceled } = await dialog.showSaveDialog(managerWin, {
      defaultPath: path.join(app.getPath('documents'), 'snippets-backup.json'),
    });
    if (!canceled) fs.writeFileSync(filePath, JSON.stringify(store.data, null, 2));
  });
  ipcMain.handle('data:import', async () => {
    const { filePaths, canceled } = await dialog.showOpenDialog(managerWin, {
      title: 'Import snippets (JSON or CSV)',
      filters: [{ name: 'Snippets', extensions: ['json', 'csv'] }],
      properties: ['openFile', 'multiSelections'],
    });
    if (canceled) return null;
    try {
      return { added: store.importData(readSnippetFiles(filePaths)) };
    } catch (err) {
      return { error: err.message };
    }
  });
  ipcMain.handle('data:reveal', () => shell.showItemInFolder(store.file));
}

// ---------- boot ----------

app.on('second-instance', openManager);
app.on('activate', openManager);
app.on('window-all-closed', () => {}); // keep running in the menu bar
app.on('will-quit', () => { globalShortcut.unregisterAll(); expander?.stop(); });

app.whenReady().then(() => {
  app.dock?.hide();
  // Pinned to the original folder so renaming the app never loses the library.
  const dataDir = path.join(app.getPath('appData'), 'snippet-expander');
  store = new Store(dataDir);
  suggestions = new Suggestions(dataDir);
  // 'system' follows the Mac's light/dark setting; the CSS reads it via prefers-color-scheme.
  nativeTheme.themeSource = store.data.settings.theme;
  nativeTheme.on('updated', () => managerWin?.setBackgroundColor(windowBackground()));
  expander = new Expander({
    getSnippets: () => store.data.snippets,
    isEnabled: () => store.data.settings.expansionEnabled,
    isOwnWindowFocused: () => !!BrowserWindow.getFocusedWindow(),
    // Ignore conditions (Settings) switch both off for matching apps and pages.
    onMatch: async (s, typed) => {
      if (await isIgnoredNow(store.data.settings.ignoreRules)) return;
      expandSnippet(s, { backspaces: typed.length, typed });
    },
    onLine: async line => {
      if (!store.data.settings.suggestionsEnabled) return;
      if (await isIgnoredNow(store.data.settings.ignoreRules)) return;
      if (suggestions.record(line)) broadcastSuggestions();
    },
  });

  // Standard Edit menu so Cmd+C / Cmd+V / Cmd+Z work in the manager's fields.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' },
  ]));

  if (fs.existsSync(asset('icon.png'))) app.dock?.setIcon(asset('icon.png'));
  tray = new Tray(nativeImage.createEmpty());
  setTrayIcon();
  tray.setToolTip('Torty Text');
  tray.on('click', () => {
    // A click on the icon while open blurs (and hides) the popover first; don't reopen it.
    if (paletteWin.isVisible() || Date.now() - paletteHiddenAt < 300) { paletteWin.hide(); return; }
    showPalette(tray.getBounds());
  });
  tray.on('right-click', () => tray.popUpContextMenu(trayMenu));

  registerIpc();
  createPalette();
  registerHotkey();
  startExpander();
  buildTray();

  store.onChange(() => { broadcast(); buildTray(); });

  // Pick up the Accessibility grant without needing a restart. Asking with
  // `true` adds this app to the Accessibility list and shows the system prompt.
  if (!expander.started) {
    systemPreferences.isTrustedAccessibilityClient(true);
    const poll = setInterval(() => {
      if (startExpander()) { clearInterval(poll); buildTray(); broadcast(); }
    }, 3000);
  }

  if (process.env.SE_DEBUG === 'popover') {
    setTimeout(async () => {
      showPalette(tray.getBounds());
      await new Promise(r => setTimeout(r, 600));
      const img = await paletteWin.webContents.capturePage();
      fs.writeFileSync(process.env.SE_SHOT, img.toPNG());
      console.log('[debug] tray', tray.getBounds(), 'popover', paletteWin.getBounds());
    }, 1500);
  }
  else openManager();
  if (process.env.SE_DEBUG) {
    paletteWin.webContents.on('console-message', (_e, _l, msg, line, src) => console.log('[popover]', msg, src, line));
    setTimeout(() => console.log('[debug]', managerWin?.getBounds(), managerWin?.isVisible(), 'trusted:', isTrusted(), 'hook:', expander.started, hotkeyError), 3000);
  }
});
