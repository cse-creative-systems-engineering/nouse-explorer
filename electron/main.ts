import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !!process.env.VITE_DEV_SERVER_URL;
const DIST = path.join(__dirname, '../../dist');

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    frame: false, // custom glass titlebar in the renderer
    backgroundColor: '#0a0a0f',
    show: false,
    title: 'Nouse Explorer',
    icon: path.join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win?.show());

  // Open external links in the default browser, never in-app
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL!);
  } else {
    void win.loadFile(path.join(DIST, 'index.html'));
  }

  win.on('closed', () => {
    win = null;
  });
}

// --- window controls IPC (custom titlebar buttons) ---
ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:maximize', () => {
  if (win?.isMaximized()) win.unmaximize();
  else win?.maximize();
});
ipcMain.on('window:close', () => win?.close());
ipcMain.on('window:drag', () => {
  /* region is -webkit-app-region: drag; this channel reserved for future use */
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
