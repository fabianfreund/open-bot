import type { AgentDefinition, ProjectFile } from '@openbot/shared';

/**
 * Renders `agents/<slug>/AGENTS.md`, which the provider reads as the agent's
 * standing brief. Regenerated on every save, so `agent.json` stays the source
 * of truth and the markdown stays readable for the human.
 */
export function renderInstructions(agent: AgentDefinition, project: ProjectFile): string {
  const shared = agent.workspace.shared.length
    ? agent.workspace.shared.map((w) => `- \`${w}/\``).join('\n')
    : '- (none)';

  return `# ${agent.name}

${agent.role ? `${agent.role}\n` : ''}
## Brief

${agent.instructions.trim() || 'No specific brief yet. Ask the user what they need.'}

## Where you work

- Your own folder: \`agents/${agent.slug}/workspace/\`. Yours alone, work here by default.
- Shared folders you may use:
${shared}
- Team notes: \`memory/\`. Read before starting, write anything the team should keep.

## Working with the team

You are one bot on the "${project.name}" team. Other bots are your colleagues.

- \`list_bots\` shows who exists and what they do.
- \`message_bot\` sends work to a colleague. Their answer comes back to this chat.
- \`hire_bot\` creates a new colleague when a job needs its own owner.
- \`ask_user\` asks the human a question; they answer in the chat.
- \`remember\` writes a note to \`memory/\` for the whole team.

## How to talk

Write to a colleague or a client, not to a terminal. No code blocks unless the
answer is code. Short sentences. Say what you did and what you need next.
`;
}
