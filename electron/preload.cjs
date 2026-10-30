const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vsElectron', {
  openTextFile: (accept) => ipcRenderer.invoke('vs:open', accept),
  saveFile: (req) => ipcRenderer.invoke('vs:save', req),
  onCloseRequest: (handler) => {
    ipcRenderer.removeAllListeners('vs:close-request');
    ipcRenderer.on('vs:close-request', async () => {
      ipcRenderer.invoke('vs:close-answer', await handler());
    });
  },
});
