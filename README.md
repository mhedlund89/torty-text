# Torty Text

A small snippet expander for the Mac that lives in the menu bar. Type a short abbreviation in any app and Torty Text replaces it with the full snippet. Built as a local replacement for TextExpander.

Built by Marc Hedlund, 2026.

## Download

Grab `Torty-Text.zip` from the [Releases](../../releases) page. It contains the app, a README with install steps, and an info page with screenshots.

Requires a Mac with Apple silicon (M1 or newer) on macOS 11 or later. The app isn't notarized, so the first launch needs **System Settings > Privacy & Security > Open Anyway**, and expansion needs **Accessibility** permission.

## Features

- Abbreviations that expand in any app, with a soft pop sound (can be turned off)
- Search and insert from anywhere with `Control+Option+Space`
- Plain text, rich text and code snippets, organized into groups
- Fill-in fields, dates, clipboard, nested snippets and cursor placement
- Suggested snippets from phrases you type often (stored only on your Mac)
- Ignore rules by window title, website URL or app name
- Import from TextExpander (CSV) or JSON, export backups
- Light and dark themes, open at login
- Torty, who tells jokes when clicked

## Snippet codes

A plain `%` is always just a `%`, so AMPscript, Liquid and CSS come through as written.

| Code | Does |
|---|---|
| `[[cursor]]` | Leave the cursor here |
| `[[clipboard]]` | Clipboard text |
| `[[date]]` `[[time]]` | Today's date, current time |
| `[[date:%B %e, %Y]]` | Any date format |
| `[[key:tab]]` | Press a key (tab, return, esc, arrows) |
| `[[snippet:abbr]]` | Include another snippet |
| `[[filltext:name=First name]]` | Ask for a value |
| `[[fillarea:name=Notes]]` | Ask for a multi-line value |
| `[[fillpopup:name=Tone:default=Friendly:Formal]]` | Pick from choices |

## Development

```sh
npm install
npm start          # run from source
npm run dist:mac   # build dist/mac-arm64/Torty Text.app and a zip
```

Electron app. Keyboard watching and typing use `uiohook-napi`. Snippets are stored in `~/Library/Application Support/snippet-expander/snippets.json`.

| Path | What |
|---|---|
| `src/main.js` | App, tray, windows, IPC, expansion |
| `src/expander.js` | Watches typing for abbreviations, types snippets |
| `src/macros.js` | `[[...]]` codes and TextExpander conversion |
| `src/store.js` | Snippet storage |
| `src/renderer/` | Manager, search popover and fill-in windows |
| `assets/` | Torty artwork, app and menu bar icons |
