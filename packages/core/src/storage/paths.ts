import path from 'node:path';
import { INBOX_DIR, PROJECT_FILE_NAME, RUNTIME_DIR } from '@openbot/shared';

/**
 * Every path in a project derives from here. Change the layout in one place.
 *
 *   <root>/openbot.json          project manifest (hand-editable)
 *   <root>/main/                 shared workspace
 *   <root>/inbox/                files the person dropped in
 *   <root>/memory/               team notes, plus handbook.md loaded into briefs
 *   <root>/tools/                team tools: TOOL.md plus optional scripts
 *   <root>/agents/<slug>/        one folder per agent
 *   <root>/.openbot/             runtime state (not hand-edited)
 */
export class ProjectPaths {
  constructor(public readonly root: string) {}

  get projectFile(): string {
    return path.join(this.root, PROJECT_FILE_NAME);
  }
  get runtimeDir(): string {
    return path.join(this.root, RUNTIME_DIR);
  }
  get tokenFile(): string {
    return path.join(this.runtimeDir, 'token');
  }
  get conversationsFile(): string {
    return path.join(this.runtimeDir, 'conversations.json');
  }
  get messagesDir(): string {
    return path.join(this.runtimeDir, 'messages');
  }
  messagesFile(conversationId: string): string {
    return path.join(this.messagesDir, `${safeName(conversationId)}.jsonl`);
  }
  get agentsDir(): string {
    return path.join(this.root, 'agents');
  }
  agentDir(slug: string): string {
    return path.join(this.agentsDir, slug);
  }
  agentFile(slug: string): string {
    return path.join(this.agentDir(slug), 'agent.json');
  }
  /**
   * Provider-readable brief, regenerated from `agent.json`. It sits *inside*
   * the workspace so Codex discovers it as the cwd's AGENTS.md.
   */
  agentInstructionsFile(slug: string): string {
    return path.join(this.agentWorkspace(slug), 'AGENTS.md');
  }
  agentWorkspace(slug: string): string {
    return path.join(this.agentDir(slug), 'workspace');
  }
  get inboxDir(): string {
    return path.join(this.root, INBOX_DIR);
  }
  get memoryDir(): string {
    return path.join(this.root, 'memory');
  }
  /**
   * Team tools: one folder per tool, shared with every bot. Not listed in
   * `workspaces`; the runtime always mounts it.
   */
  get toolsDir(): string {
    return path.join(this.root, 'tools');
  }
  /** The team's shared notes. The store, not the copy. */
  get notesDb(): string {
    return path.join(this.memoryDir, 'notes.db');
  }
  /** Readable copy of every note, regenerated on every write. */
  get notesFile(): string {
    return path.join(this.memoryDir, 'notes.md');
  }
  /**
   * The team's standing handbook. Written by setup_team, loaded into every
   * bot's AGENTS.md. Not the notes; this is how the team works.
   */
  get handbookFile(): string {
    return path.join(this.memoryDir, 'handbook.md');
  }
  /** Resolves a project-relative workspace name, refusing to escape the root. */
  workspace(name: string): string {
    const resolved = path.resolve(this.root, name);
    const rel = path.relative(this.root, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Workspace "${name}" is outside the project folder`);
    }
    return resolved;
  }
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}
