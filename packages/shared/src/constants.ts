/** Bumped whenever the on-disk project layout changes in a non-additive way. */
export const PROJECT_FILE_VERSION = 1;

/** Filename of the project manifest at the root of a project folder. */
export const PROJECT_FILE_NAME = 'openbot.json';

/** Directory (inside a project) holding runtime state that is not hand-edited. */
export const RUNTIME_DIR = '.openbot';

/** Wire-protocol version. Client and server must agree on the major. */
export const PROTOCOL_VERSION = 1;

export const DEFAULT_SERVER_PORT = 7788;
