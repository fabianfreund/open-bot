#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { OpenBotApi } from './api.js';
import { readConfig } from './config.js';

/**
 * Bridges OpenBot's skills into any provider that speaks MCP.
 *
 * The provider (Codex) spawns this over stdio for the duration of a turn. It
 * asks OpenBot which skills the calling agent may use, exposes each as a tool,
 * and forwards calls back over HTTP. Adding a skill in `@openbot/core` makes it
 * appear here with no change to this file.
 */
async function main(): Promise<void> {
  const config = readConfig();
  const api = new OpenBotApi(config);

  const server = new Server(
    { name: 'openbot', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const skills = await api.listSkills();
    return {
      tools: skills.map((skill) => ({
        name: skill.id,
        title: skill.title,
        description: skill.description,
        inputSchema: normaliseSchema(skill.inputSchema),
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const result = await api.invoke(request.params.name, request.params.arguments ?? {});
      return {
        content: [{ type: 'text' as const, text: result.content }],
        isError: !result.ok,
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: (err as Error).message }],
        isError: true,
      };
    }
  });

  await server.connect(new StdioServerTransport());
}

/** MCP requires a JSON Schema object with `type: "object"`. */
function normaliseSchema(schema: Record<string, unknown>): {
  type: 'object';
  properties?: Record<string, unknown>;
  required?: string[];
} {
  const properties = (schema.properties as Record<string, unknown> | undefined) ?? {};
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : undefined;
  return { type: 'object', properties, ...(required ? { required } : {}) };
}

main().catch((err: unknown) => {
  // stdout belongs to the protocol; diagnostics go to stderr.
  process.stderr.write(`openbot-skills-mcp: ${(err as Error).message}\n`);
  process.exit(1);
});
