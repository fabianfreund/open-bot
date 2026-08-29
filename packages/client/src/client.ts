import {
  authedFetch,
  HttpError,
  type AgentDefinition,
  type AgentView,
  type Attachment,
  type Conversation,
  type CreateAgentRequest,
  type HealthResponse,
  type Message,
  type ProjectInfo,
  type ProviderHealth,
  type ProviderInfo,
  type SkillInfo,
  type UpdateAgentRequest,
  type UpdateProjectRequest,
} from '@openbot/shared';
import { EventStream, type EventStreamHandlers } from './stream.js';

export interface OpenBotClientOptions {
  /** e.g. `http://100.x.y.z:7788` */
  baseUrl: string;
  token: string;
}

/**
 * The only way the UI talks to a project, local or across a tailnet. Uses
 * nothing but `fetch` and `WebSocket`, so it works in Electron, a browser, and
 * eventually a mobile app.
 */
export class OpenBotClient {
  readonly baseUrl: string;
  readonly token: string;

  constructor(options: OpenBotClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.token = options.token;
  }

  health(): Promise<HealthResponse> {
    return this.#get('/api/health');
  }
  project(): Promise<ProjectInfo> {
    return this.#get('/api/project');
  }
  updateProject(patch: UpdateProjectRequest): Promise<ProjectInfo> {
    return this.#send('PATCH', '/api/project', patch);
  }
  agents(): Promise<AgentView[]> {
    return this.#get('/api/agents');
  }
  skills(): Promise<SkillInfo[]> {
    return this.#get('/api/skills');
  }
  providers(): Promise<{ providers: ProviderInfo[]; health: ProviderHealth[] }> {
    return this.#get('/api/providers');
  }

  createAgent(
    request: CreateAgentRequest,
  ): Promise<{ agent: AgentDefinition; conversationId: string }> {
    return this.#send('POST', '/api/agents', request);
  }
  updateAgent(id: string, patch: UpdateAgentRequest): Promise<AgentDefinition> {
    return this.#send('PATCH', `/api/agents/${id}`, patch);
  }

  conversationFor(agentId: string): Promise<Conversation> {
    return this.#get(`/api/agents/${agentId}/conversation`);
  }
  messages(conversationId: string): Promise<Message[]> {
    return this.#get(`/api/conversations/${conversationId}/messages`);
  }
  send(conversationId: string, text: string, attachments: Attachment[] = []): Promise<Message> {
    return this.#send('POST', `/api/conversations/${conversationId}/messages`, {
      text,
      attachments: attachments.map((file) => file.path),
    });
  }

  /** Saves a dropped file into the team folder. */
  upload(file: Blob, name?: string): Promise<Attachment> {
    const body = new FormData();
    const filename = name || (file instanceof File ? file.name : 'file');
    body.append('file', file, filename);
    return this.#send('POST', '/api/files', body);
  }

  /** Bytes of a project file, for previews. */
  async download(relPath: string): Promise<Blob> {
    const res = await authedFetch({
      baseUrl: this.baseUrl,
      token: this.token,
      path: `/api/files?path=${encodeURIComponent(relPath)}`,
    });
    return res.blob();
  }
  /** Answers an inline card; the reply continues the conversation. */
  answerCard(
    conversationId: string,
    messageId: string,
    cardId: string,
    answer: string,
  ): Promise<void> {
    return this.#send('POST', `/api/conversations/${conversationId}/answer`, {
      messageId,
      cardId,
      answer,
    });
  }
  /** Clears the unread count once the person is looking at the chat. */
  markRead(conversationId: string): Promise<{ ok: boolean }> {
    return this.#send('POST', `/api/conversations/${conversationId}/read`, {});
  }

  abort(conversationId: string): Promise<{ stopped: boolean }> {
    return this.#send('POST', `/api/conversations/${conversationId}/abort`, {});
  }

  /** Opens the live event stream. Returns a handle you can `close()`. */
  stream(handlers: EventStreamHandlers): EventStream {
    const url = `${this.baseUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(this.token)}`;
    return new EventStream(url, handlers);
  }

  async #get<T>(path: string): Promise<T> {
    return this.#request<T>('GET', path);
  }

  async #send<T>(method: string, path: string, body: unknown): Promise<T> {
    return this.#request<T>(method, path, body);
  }

  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await authedFetch({ baseUrl: this.baseUrl, token: this.token, method, path, body });
    } catch (err) {
      if (err instanceof HttpError)
        throw new OpenBotHttpError(err.status, describe(err.status), err.detail);
      throw err;
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

/** Messages a person can act on. The status code stays on the error object. */
function describe(status: number): string {
  if (status === 401) return 'This app is no longer paired with that team.';
  if (status === 404) return 'That is not there any more.';
  if (status === 409) return 'That is no longer available.';
  if (status === 413) return 'That file is too large.';
  if (status >= 500) return 'The team\u2019s computer had a problem.';
  return 'That did not work.';
}

export class OpenBotHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail: string,
  ) {
    super(message);
    this.name = 'OpenBotHttpError';
  }
}
