/** Contract between the Electron main process and the renderer. */

export interface RecentProject {
  root: string;
  name: string;
  openedAt: string;
}

export interface RemoteConnection {
  url: string;
  token: string;
  name: string;
  openedAt: string;
}

/** What the renderer needs to talk to a project, however it is hosted. */
export interface Connection {
  mode: 'host' | 'remote';
  baseUrl: string;
  token: string;
  projectName: string;
  /** Set when this app is the one running the team. */
  root?: string;
}

export interface Bootstrap {
  connection: Connection | null;
  recentProjects: RecentProject[];
  remotes: RemoteConnection[];
  /** Tailnet addresses this machine can be reached on, if Tailscale is up. */
  tailscaleAddresses: string[];
  platform: string;
}

/** What is already in a folder the person picked. */
export interface FolderInfo {
  root: string;
  /** True when the folder already holds an OpenBot project. */
  hasProject: boolean;
  projectName?: string;
  /** True when the folder is missing or has nothing in it. */
  empty: boolean;
}

export interface OpenBotBridge {
  bootstrap(): Promise<Bootstrap>;
  chooseFolder(): Promise<string | null>;
  inspectFolder(root: string): Promise<FolderInfo>;
  createProject(input: { root: string; name: string }): Promise<Connection>;
  openProject(root: string): Promise<Connection>;
  connectRemote(input: { url: string; token: string }): Promise<Connection>;
  disconnect(): Promise<void>;
  /** Lets the host share its address so another device can pair. */
  shareInvite(): Promise<{ url: string; token: string } | null>;
  revealProject(path: string): Promise<void>;
  /**
   * Fires whenever the hosted project changes, including when it stops. The
   * window follows the host rather than holding a connection that has moved.
   */
  onConnection(listener: (connection: Connection | null) => void): () => void;
}

declare global {
  interface Window {
    openbot: OpenBotBridge;
  }
}
