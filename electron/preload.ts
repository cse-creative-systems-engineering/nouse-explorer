import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('nouse', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
});
