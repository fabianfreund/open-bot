import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BrowserWindow, clipboard, dialog, ipcMain, shell } from 'electron';
import { OpenBotClient } from '@openbot/client';
import type { Bootstrap, Connection, FolderInfo } from '../shared-ipc.js';
import { ConfigStore } from './config.js';
import { Host } from './host.js';
import { tailscaleAddresses } from './tailscale.js';

/** Tells every open window which project is being hosted now. */
function broadcast(host: Host): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('connection', host.connection);
  }
}

export function registerIpc(config: ConfigStore, host: Host): void {
  ipcMain.handle('bootstrap', async (): Promise<Bootstrap> => {
    const stored = await config.load();
    return {
      connection: host.connection,
      recentProjects: stored.recentProjects,
      remotes: stored.remotes,
      tailscaleAddresses: await tailscaleAddresses(),
      platform: process.platform,
    };
  });

  ipcMain.handle('chooseFolder', async (): Promise<string | null> => {
    const window = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(window ?? BrowserWindow.getAllWindows()[0]!, {
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: 'Use this folder',
    });
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle('inspectFolder', async (_event, root: string): Promise<FolderInfo> => {
    try {
      const entries = (await fs.readdir(root)).filter((e: string) => e !== '.DS_Store');
      if (!entries.includes('openbot.json')) {
        return { root, hasProject: false, empty: entries.length === 0 };
      }
      const raw = JSON.parse(await fs.readFile(path.join(root, 'openbot.json'), 'utf8')) as {
        name?: string;
      };
      return { root, hasProject: true, projectName: raw.name ?? path.basename(root), empty: false };
    } catch {
      // A folder that does not exist yet is a fine place for a new team.
      return { root, hasProject: false, empty: true };
    }
  });

  ipcMain.handle(
    'createProject',
    async (_event, input: { root: string; name: string }): Promise<Connection> => {
      const connection = await host.create(input.root, input.name);
      broadcast(host);
      await config.rememberProject({
        root: input.root,
        name: connection.projectName,
        openedAt: new Date().toISOString(),
      });
      return connection;
    },
  );

  ipcMain.handle('openProject', async (_event, root: string): Promise<Connection> => {
    const connection = await host.open(root);
    broadcast(host);
    await config.rememberProject({
      root,
      name: connection.projectName,
      openedAt: new Date().toISOString(),
    });
    return connection;
  });

  ipcMain.handle(
    'connectRemote',
    async (_event, input: { url: string; token: string }): Promise<Connection> => {
      const client = new OpenBotClient({ baseUrl: input.url, token: input.token });
      // Fail here rather than showing an empty chat window.
      const health = await client.health();
      const projects = await client.project().catch(() => null);
      if (!projects) throw new Error('That token was not accepted.');
      const connection: Connection = {
        mode: 'remote',
        baseUrl: input.url,
        token: input.token,
        projectName: health.projectName,
      };
      await config.rememberRemote({
        url: input.url,
        token: input.token,
        name: health.projectName,
        openedAt: new Date().toISOString(),
      });
      return connection;
    },
  );

  ipcMain.handle('disconnect', async (): Promise<void> => {
    await host.stop();
    broadcast(host);
    await config.forgetLast();
  });

  ipcMain.handle('shareInvite', async () => {
    const [address] = await tailscaleAddresses();
    return host.invite(address);
  });

  ipcMain.handle('revealProject', async (_event, target: string): Promise<void> => {
    shell.showItemInFolder(target);
  });

  // Only http(s) and mailto reach the browser; everything else is a local path.
  ipcMain.handle('openTarget', async (_event, target: string): Promise<void> => {
    if (/^(https?|mailto):/i.test(target)) {
      await shell.openExternal(target);
      return;
    }
    if (!path.isAbsolute(target)) return;
    await shell.openPath(target);
  });

  ipcMain.handle('copyText', async (_event, text: string): Promise<void> => {
    clipboard.writeText(text);
  });
}
