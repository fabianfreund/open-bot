import { Codex, type ThreadEvent, type ThreadItem, type ThreadOptions } from '@openai/codex-sdk';

/** `CodexConfigObject` is not exported by the SDK; this is the same shape. */
type CodexConfig = NonNullable<NonNullable<ConstructorParameters<typeof Codex>[0]>['config']>;
import type { ProviderHealth, ProviderInfo, ProviderStreamEvent } from '@openbot/shared';
import type {
  Provider,
  ProviderContext,
  ProviderRunInput,
  ProviderRunResult,
} from '../provider.js';
import {
  describeCommand,
  describeFileChanges,
  describeSkillCall,
  truncate,
  unwrapCommand,
} from './humanize.js';
import { locateCodex } from './locate.js';
import { buildBrief, buildRecap } from './prompt.js';

export interface CodexProviderOptions {
  /** Path to the `codex` binary, if it is not on PATH. */
  codexPath?: string;
  /** Default model when an agent does not pick one. */
  defaultModel?: string;
}

/**
 * Runs turns through the Codex CLI, which authenticates with the user's
 * ChatGPT subscription (`~/.codex/auth.json`), no API key required.
 *
 * OpenBot's own skills are exposed to Codex as an MCP server, so `hire_bot`
 * and `message_bot` are just tools the model can call. File reading, writing,
 * and search already ship with Codex; we do not re-implement them.
 */
/** Said to the person, so it names the fix rather than the failure. */
const CODEX_MISSING =
  'Codex is not installed on this computer. Install it, then run `codex login`.';

export class CodexProvider implements Provider {
  readonly info: ProviderInfo = {
    id: 'codex',
    label: 'Codex (ChatGPT subscription)',
    description: 'Runs on the Codex CLI signed in with your ChatGPT account.',
    supportsSkills: true,
    options: [
      {
        key: 'model',
        label: 'Model',
        type: 'string',
        description: 'Leave empty to use the model Codex is already set up with.',
      },
      {
        key: 'reasoningEffort',
        label: 'Effort',
        type: 'enum',
        options: ['minimal', 'low', 'medium', 'high', 'xhigh'],
        default: 'medium',
      },
      { key: 'webSearch', label: 'Web search', type: 'boolean', default: true },
    ],
  };

  constructor(private readonly options: CodexProviderOptions = {}) {}

  async run(input: ProviderRunInput, context: ProviderContext): Promise<ProviderRunResult> {
    const codexPath = await locateCodex(this.options.codexPath);
    if (!codexPath) throw new Error(CODEX_MISSING);

    const codex = new Codex({
      codexPathOverride: codexPath,
      config: this.#buildConfig(context),
    });

    const threadOptions = this.#buildThreadOptions(context);
    const isNewThread = !context.providerThreadId;
    const thread = isNewThread
      ? codex.startThread(threadOptions)
      : codex.resumeThread(context.providerThreadId!, threadOptions);

    const prompt = isNewThread
      ? [buildBrief(context.agent), buildRecap(context.history), input.text]
          .filter(Boolean)
          .join('\n\n')
      : input.text;

    const payload =
      input.images.length > 0
        ? [
            { type: 'text' as const, text: prompt },
            ...input.images.map((path) => ({ type: 'local_image' as const, path })),
          ]
        : prompt;

    const { events } = await thread.runStreamed(payload, { signal: context.signal });

    const messages = new Map<string, string>();
    let threadId = context.providerThreadId;
    let usage: ProviderRunResult['usage'];

    for await (const event of events) {
      for (const mapped of mapEvent(event, messages)) context.emit(mapped);
      if (event.type === 'thread.started') threadId = event.thread_id;
      if (event.type === 'turn.completed') {
        usage = {
          inputTokens: event.usage.input_tokens,
          outputTokens: event.usage.output_tokens,
        };
      }
      if (event.type === 'turn.failed') throw new Error(event.error.message);
    }

    return {
      finalText: [...messages.values()].join('\n\n').trim(),
      ...(threadId ? { providerThreadId: threadId } : {}),
      ...(usage ? { usage } : {}),
    };
  }

  async health(): Promise<ProviderHealth> {
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');

    if (!(await locateCodex(this.options.codexPath))) {
      return { id: this.info.id, ok: false, detail: CODEX_MISSING };
    }
    const authFile = path.join(
      process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'),
      'auth.json',
    );
    try {
      const raw = JSON.parse(await fs.readFile(authFile, 'utf8')) as {
        tokens?: { access_token?: string };
        OPENAI_API_KEY?: string;
      };
      if (raw.tokens?.access_token) {
        return { id: this.info.id, ok: true, detail: 'Signed in with your ChatGPT account.' };
      }
      if (raw.OPENAI_API_KEY) {
        return { id: this.info.id, ok: true, detail: 'Using an OpenAI API key.' };
      }
      return {
        id: this.info.id,
        ok: false,
        detail: 'Codex is installed but not signed in. Run `codex login`.',
      };
    } catch {
      return {
        id: this.info.id,
        ok: false,
        detail: 'Codex is not set up. Install it, then run `codex login`.',
      };
    }
  }

  /**
   * Registers OpenBot's skill bridge as an MCP server for this run. Codex
   * spawns it over stdio and it calls straight back into the running server.
   */
  #buildConfig(context: ProviderContext): CodexConfig {
    if (context.skills.length === 0) return {};
    return {
      mcp_servers: {
        openbot: {
          command: process.execPath,
          args: [context.skillBridge.bridgePath],
          startup_timeout_sec: 30,
          // Nobody is watching a terminal to approve tool calls; OpenBot
          // decides what an agent may use through its own skill allow-list.
          default_tools_approval_mode: 'approve',
          env: {
            OPENBOT_SERVER_URL: context.skillBridge.serverUrl,
            OPENBOT_TOKEN: context.skillBridge.token,
            OPENBOT_AGENT_ID: context.skillBridge.agentId,
            OPENBOT_CONVERSATION_ID: context.skillBridge.conversationId,
          },
        },
      },
    };
  }

  #buildThreadOptions(context: ProviderContext): ThreadOptions {
    const opts = context.agent.providerOptions as Record<string, unknown>;
    const model = typeof opts.model === 'string' ? opts.model : this.options.defaultModel;
    const effort = opts.reasoningEffort;
    const webSearch = opts.webSearch !== false;

    return {
      ...(model ? { model } : {}),
      workingDirectory: context.workspaceDir,
      additionalDirectories: context.additionalDirs,
      sandboxMode: context.agent.workspace.sandbox,
      // Nobody is standing by to approve each command; the sandbox is the guard.
      approvalPolicy: 'never',
      skipGitRepoCheck: true,
      webSearchEnabled: webSearch,
      ...(typeof effort === 'string'
        ? { modelReasoningEffort: effort as ThreadOptions['modelReasoningEffort'] }
        : {}),
    };
  }
}

/** Translates one Codex event into zero or more normalised stream events. */
function mapEvent(event: ThreadEvent, messages: Map<string, string>): ProviderStreamEvent[] {
  switch (event.type) {
    case 'thread.started':
      return [{ kind: 'thread', threadId: event.thread_id }];
    case 'turn.started':
      return [{ kind: 'status', status: 'thinking' }];
    case 'turn.completed':
      return [
        {
          kind: 'usage',
          inputTokens: event.usage.input_tokens,
          outputTokens: event.usage.output_tokens,
        },
      ];
    case 'error':
      return [{ kind: 'error', message: event.message }];
    case 'turn.failed':
      return [{ kind: 'error', message: event.error.message }];
    case 'item.started':
    case 'item.updated':
    case 'item.completed':
      return mapItem(event.item, event.type === 'item.completed', messages);
    default:
      return [];
  }
}

function mapItem(
  item: ThreadItem,
  completed: boolean,
  messages: Map<string, string>,
): ProviderStreamEvent[] {
  const status = completed ? ('completed' as const) : ('in-progress' as const);

  switch (item.type) {
    case 'agent_message': {
      messages.set(item.id, item.text);
      return [{ kind: 'text-final', text: [...messages.values()].join('\n\n') }];
    }
    case 'reasoning':
      return [
        {
          kind: 'trace',
          id: item.id,
          traceKind: 'reasoning',
          title: firstLine(item.text),
          detail: item.text,
          status,
        },
      ];
    case 'command_execution': {
      const failed = item.status === 'failed';
      return [
        { kind: 'status', status: 'working' },
        {
          kind: 'trace',
          id: item.id,
          traceKind: 'command',
          title: describeCommand(item.command, failed ? 'failed' : status),
          detail:
            `${unwrapCommand(item.command)}\n\n${truncate(item.aggregated_output ?? '')}`.trim(),
          status: failed ? 'failed' : item.status === 'in_progress' ? 'in-progress' : 'completed',
        },
      ];
    }
    case 'file_change':
      return [
        {
          kind: 'trace',
          id: item.id,
          traceKind: 'file-change',
          title: describeFileChanges(item.changes),
          detail: item.changes.map((c) => `${c.kind}: ${c.path}`).join('\n'),
          status: item.status === 'failed' ? 'failed' : 'completed',
        },
      ];
    case 'mcp_tool_call':
      return [
        {
          kind: 'trace',
          id: item.id,
          traceKind: 'tool',
          title:
            item.server === 'openbot'
              ? describeSkillCall(item.tool, item.arguments)
              : `Used ${item.tool.replace(/_/g, ' ')}`,
          detail: item.error?.message,
          status:
            item.status === 'failed'
              ? 'failed'
              : item.status === 'in_progress'
                ? 'in-progress'
                : 'completed',
        },
      ];
    case 'web_search':
      return [
        {
          kind: 'trace',
          id: item.id,
          traceKind: 'web-search',
          title: `Searched the web for "${item.query}"`,
          status,
        },
      ];
    case 'todo_list':
      return [
        {
          kind: 'trace',
          id: item.id,
          traceKind: 'todo',
          title: 'Made a plan',
          detail: item.items.map((t) => `${t.completed ? '✓' : '•'} ${t.text}`).join('\n'),
          status,
        },
      ];
    case 'error':
      return [{ kind: 'error', message: item.message }];
    default:
      return [];
  }
}

function firstLine(text: string): string {
  const line = text.split('\n').find((l) => l.trim().length > 0) ?? 'Thinking';
  return line.replace(/^[#*\s]+/, '').slice(0, 120);
}
