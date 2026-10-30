// Electron main process. Kept deliberately small: window, file dialogs, close confirmation.
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, protocol, net } = require('electron');
const { pathToFileURL } = require('node:url');
const fonts = require('./fonts.cjs');
const fs = require('node:fs');
const path = require('node:path');

let allowClose = false;
const DIST = path.join(__dirname, '..', 'dist');

// The renderer is served from app://vs/ (not file://) so fetch() — needed to load the HarfBuzz WebAssembly — works.
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

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
  else win.loadURL('app://vs/index.html');
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

ipcMain.handle('vs:saveMany', async (_e, files) => {
  const res = await dialog.showOpenDialog({ title: 'Choose a folder for the exported files', properties: ['openDirectory', 'createDirectory'] });
  if (res.canceled || res.filePaths.length === 0) return null;
  const dir = res.filePaths[0];
  const saved = [];
  for (const f of files) {
    // Only the base name is used so a crafted name cannot escape the chosen folder; never overwrite existing files.
    const base = path.basename(String(f.name)).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'export';
    const ext = path.extname(base);
    const stem = base.slice(0, base.length - ext.length);
    let target = path.join(dir, base);
    for (let i = 1; fs.existsSync(target); i++) target = path.join(dir, `${stem}-${i}${ext}`);
    fs.writeFileSync(target, typeof f.data === 'string' ? f.data : Buffer.from(f.data));
    saved.push(path.basename(target));
  }
  return saved;
});

ipcMain.handle('vs:fonts:list', () => fonts.listFonts());
ipcMain.handle('vs:fonts:read', (_e, key) => fonts.readFont(key));

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const rel = decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (!file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 }); // no path traversal out of dist/
    return net.fetch(pathToFileURL(file).toString());
  });
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
