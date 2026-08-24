import { promises as fs } from 'node:fs';
import {
  AgentDefinitionSchema,
  newId,
  slugify,
  type AgentDefinition,
  type CreateAgentRequest,
  type UpdateAgentRequest,
} from '@openbot/shared';
import type { ProjectStore } from '../project/project-store.js';
import { readJson, writeJson } from '../storage/json-file.js';
import { renderInstructions } from './instructions.js';

/**
 * Owns `agents/<slug>/agent.json`. The project manifest only holds refs, so
 * adding an agent touches one small file plus one line in the manifest.
 */
export class AgentStore {
  #agents = new Map<string, AgentDefinition>();

  constructor(private readonly project: ProjectStore) {}

  async load(): Promise<void> {
    this.#agents.clear();
    for (const ref of this.project.file.agents) {
      const raw = await readJson<unknown>(this.project.paths.agentFile(ref.slug), null);
      if (raw === null) continue;
      const parsed = AgentDefinitionSchema.safeParse(raw);
      if (parsed.success) this.#agents.set(parsed.data.id, parsed.data);
    }
    // The brief is generated, so a bot hired before a skill existed would go on
    // reading a brief that never mentions it. Rewrite them all on the way in.
    for (const agent of this.#agents.values()) {
      if (!agent.archived) await this.#writeInstructions(agent);
    }
  }

  list(): AgentDefinition[] {
    return [...this.#agents.values()]
      .filter((a) => !a.archived)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /** Everyone, including the ones who have left the team. */
  listAll(): AgentDefinition[] {
    return [...this.#agents.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  get(id: string): AgentDefinition | undefined {
    return this.#agents.get(id);
  }

  /** Case-insensitive lookup by name, which is how agents refer to each other. */
  findByName(name: string): AgentDefinition | undefined {
    const needle = name.trim().toLowerCase();
    return this.list().find(
      (a) => a.name.toLowerCase() === needle || a.slug === slugify(needle) || a.id === name,
    );
  }

  async create(request: CreateAgentRequest): Promise<AgentDefinition> {
    const defaults = this.project.file.defaults;
    const now = new Date().toISOString();
    const slug = this.#uniqueSlug(slugify(request.name));

    const definition = AgentDefinitionSchema.parse({
      id: newId('agt'),
      slug,
      name: request.name.trim(),
      role: request.role ?? '',
      instructions: request.instructions ?? '',
      avatar: {
        seed: slug,
        config: request.avatarConfig,
        color: request.color ?? pickColor(slug),
      },
      provider: request.provider ?? defaults.provider,
      providerOptions: { ...defaults.providerOptions, ...(request.providerOptions ?? {}) },
      workspace: { shared: request.sharedWorkspaces ?? [], sandbox: 'workspace-write' },
      skills: request.skills ?? defaults.skills,
      createdBy: request.createdBy ?? 'user',
      createdAt: now,
      updatedAt: now,
    });

    await fs.mkdir(this.project.paths.agentWorkspace(slug), { recursive: true });
    await this.#persist(definition);
    await this.project.update((file) => {
      file.agents.push({ id: definition.id, slug: definition.slug });
    });
    this.#agents.set(definition.id, definition);
    return definition;
  }

  async update(id: string, patch: UpdateAgentRequest): Promise<AgentDefinition> {
    const current = this.#agents.get(id);
    if (!current) throw new Error(`No agent ${id}`);

    const next = AgentDefinitionSchema.parse({
      ...current,
      name: patch.name ?? current.name,
      role: patch.role ?? current.role,
      instructions: patch.instructions ?? current.instructions,
      avatar: {
        ...current.avatar,
        config: patch.avatarConfig ?? current.avatar.config,
        color: patch.color ?? current.avatar.color,
      },
      provider: patch.provider ?? current.provider,
      providerOptions: { ...current.providerOptions, ...(patch.providerOptions ?? {}) },
      workspace: {
        ...current.workspace,
        shared: patch.sharedWorkspaces ?? current.workspace.shared,
      },
      skills: patch.skills ?? current.skills,
      archived: patch.archived ?? current.archived,
      updatedAt: new Date().toISOString(),
    });

    await this.#persist(next);
    this.#agents.set(id, next);
    return next;
  }

  /** Archives rather than deletes: an agent's folder and history are kept. */
  async archive(id: string): Promise<void> {
    await this.update(id, { archived: true });
  }

  async #persist(definition: AgentDefinition): Promise<void> {
    await writeJson(this.project.paths.agentFile(definition.slug), definition);
    await this.#writeInstructions(definition);
  }

  /** `agents/<slug>/workspace/AGENTS.md`, the brief the provider reads. */
  async #writeInstructions(definition: AgentDefinition): Promise<void> {
    await fs.writeFile(
      this.project.paths.agentInstructionsFile(definition.slug),
      renderInstructions(definition, this.project.file),
      'utf8',
    );
  }

  #uniqueSlug(base: string): string {
    const taken = new Set([...this.#agents.values()].map((a) => a.slug));
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }
}

const COLORS = ['#e05b8a', '#4f8ef7', '#7b5cf0', '#e0574a', '#2fb673', '#e08b3a', '#8a8f98'];

function pickColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  return COLORS[hash % COLORS.length] ?? '#8a8f98';
}
