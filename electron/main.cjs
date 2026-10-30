// Electron main process. Kept deliberately small: window, file dialogs, close confirmation.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

let allowClose = false;

function createWindow() {
  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#1e1e1e',
    title: 'Vector Studio',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.on('close', (e) => {
    if (allowClose) return;
    e.preventDefault();
    win.webContents.send('vs:close-request');
  });
  ipcMain.removeHandler('vs:close-answer');
  ipcMain.handle('vs:close-answer', (_e, ok) => {
    if (ok) { allowClose = true; win.close(); }
  });

  const devUrl = process.env.VS_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  return win;
}

ipcMain.handle('vs:open', async (_e, accept) => {
  const exts = accept.filter((a) => a.startsWith('.')).map((a) => a.slice(1));
  const res = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Supported files', extensions: exts }, { name: 'All files', extensions: ['*'] }] });
  if (res.canceled || res.filePaths.length === 0) return null;
  const p = res.filePaths[0];
  return { name: path.basename(p), path: p, text: fs.readFileSync(p, 'utf8') };
});

ipcMain.handle('vs:save', async (_e, req) => {
  let target = !req.forceDialog && req.path ? req.path : null;
  if (!target) {
    const res = await dialog.showSaveDialog({
      defaultPath: `${req.suggestedName}.${req.ext}`,
      filters: [{ name: req.ext.toUpperCase(), extensions: [req.ext] }],
    });
    if (res.canceled || !res.filePath) return null;
    target = res.filePath;
  }
  const data = typeof req.data === 'string' ? req.data : Buffer.from(req.data);
  fs.writeFileSync(target, data);
  return { name: path.basename(target), path: target };
});

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
