import { contextBridge, ipcRenderer } from 'electron';
import type { OpenBotBridge } from '../shared-ipc.js';

/**
 * The renderer gets exactly these calls and nothing else, no Node, no
 * filesystem, no direct Electron surface.
 */
const bridge: OpenBotBridge = {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  chooseFolder: () => ipcRenderer.invoke('chooseFolder'),
  inspectFolder: (root) => ipcRenderer.invoke('inspectFolder', root),
  createProject: (input) => ipcRenderer.invoke('createProject', input),
  openProject: (root) => ipcRenderer.invoke('openProject', root),
  connectRemote: (input) => ipcRenderer.invoke('connectRemote', input),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  shareInvite: () => ipcRenderer.invoke('shareInvite'),
  revealProject: (target) => ipcRenderer.invoke('revealProject', target),
  onConnection: (listener) => {
    const handler = (_event: unknown, connection: Parameters<typeof listener>[0]) =>
      listener(connection);
    ipcRenderer.on('connection', handler);
    return () => ipcRenderer.removeListener('connection', handler);
  },
};

contextBridge.exposeInMainWorld('openbot', bridge);
