import type { AgentDefinition, AgentStatus, AgentView } from './models/agent.js';
import type { Conversation } from './models/conversation.js';
import type { Message } from './models/message.js';
import type { ProjectInfo } from './models/project.js';

/**
 * Everything the server pushes to connected clients. One union, one socket.
 * Adding a feature means adding a member here, not a new transport.
 */
export type ServerEvent =
  | { type: 'hello'; protocol: number; project: ProjectInfo; agents: AgentView[] }
  | { type: 'project.updated'; project: ProjectInfo }
  | { type: 'agent.created'; agent: AgentView }
  | { type: 'agent.updated'; agent: AgentView }
  | { type: 'agent.removed'; agentId: string }
  | { type: 'agent.status'; agentId: string; status: AgentStatus; detail?: string }
  | { type: 'conversation.updated'; conversation: Conversation }
  | { type: 'message.created'; message: Message }
  | { type: 'message.updated'; message: Message }
  | { type: 'notice'; level: 'info' | 'warn' | 'error'; text: string };

/** Anything a client sends up the socket. Most writes go over REST instead. */
export type ClientEvent =
  | { type: 'ping' }
  | { type: 'read'; conversationId: string };

/**
 * Normalised stream events every provider emits. Providers translate their
 * native output into this shape so the UI never learns provider specifics.
 */
export type ProviderStreamEvent =
  | { kind: 'thread'; threadId: string }
  | { kind: 'text-delta'; text: string }
  | { kind: 'text-final'; text: string }
  | {
      kind: 'trace';
      id: string;
      traceKind: 'reasoning' | 'command' | 'file-change' | 'tool' | 'web-search' | 'todo' | 'error';
      title: string;
      detail?: string;
      status: 'in-progress' | 'completed' | 'failed';
    }
  | { kind: 'status'; status: AgentStatus; detail?: string }
  | { kind: 'usage'; inputTokens: number; outputTokens: number }
  | { kind: 'error'; message: string };

export type { AgentDefinition, AgentView, AgentStatus, Conversation, Message, ProjectInfo };
