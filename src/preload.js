const { contextBridge, ipcRenderer } = require('electron');

const call = channel => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  getStore: call('store:get'),
  getStatus: call('status:get'),
  saveSnippet: call('snippet:save'),
  deleteSnippet: call('snippet:delete'),
  copySnippet: call('snippet:copy'),
  saveGroup: call('group:save'),
  deleteGroup: call('group:delete'),
  saveSettings: call('settings:save'),
  getSuggestions: call('suggestions:get'),
  dismissSuggestion: call('suggestions:dismiss'),
  clearSuggestions: call('suggestions:clear'),
  onSuggestionsChanged: fn => ipcRenderer.on('suggestions:changed', (_e, list) => fn(list)),
  requestPermission: call('permission:request'),
  insert: call('palette:insert'),
  getFill: call('fill:get'),
  submitFill: call('fill:submit'),
  hidePalette: call('palette:hide'),
  paletteAction: call('palette:action'),
  onManagerCommand: fn => ipcRenderer.on('manager:command', (_e, name, arg) => fn(name, arg)),
  exportData: call('data:export'),
  importData: call('data:import'),
  revealData: call('data:reveal'),
  onStoreChanged: fn => ipcRenderer.on('store:changed', (_e, data) => fn(data)),
  onPaletteOpen: fn => ipcRenderer.on('palette:open', () => fn()),
});
