import { promises as fs } from 'node:fs';
import path from 'node:path';

export const HANDBOOK_FOLDER = 'create-a-tool';
export const HANDBOOK_ID = 'how_to_create_a_tool';

/**
 * The team's own guide to writing tools. Seeded into every project; left
 * alone if someone has edited it.
 */
export const HANDBOOK_MARKDOWN = `---
name: how_to_create_a_tool
title: How to create a tool
description: How this team adds a tool. Read this before writing one, or when a tool should include a script.
---

A tool is a named capability the whole team can use. Builtins (hire_bot, remember, and the rest) are OpenBot's. Everything under \`tools/\` is this team's, and travels with the folder.

## When to add one

Add a tool when the same job will happen again: a playbook, a check, a script that talks to something outside the chat. Do not add one for a one-off, and do not recreate a builtin.

## How to add one

Call \`create_tool\` with a name, a title, a description, and the playbook. Name is lowercase with underscores (\`send_invoice\`). Description is when to use it, in one or two sentences; that is what decides whether a colleague reaches for it.

Leave the playbook in TOOL.md short. Steps, what to avoid, what a script expects. Long reference material goes in \`references/\` next to it.

## Folder

\`tools/<name>/\`

- \`TOOL.md\` (required). Front matter, then the playbook.
- \`scripts/run.js\` (optional). Node reads JSON on stdin, writes the result to stdout, exits 0 on success.
- \`scripts/run.sh\` or \`scripts/run.py\` also work. \`scripts/run\` if you want a binary.
- \`references/\` (optional). Extra markdown the playbook can point at.

Front matter:

\`\`\`
---
name: send_invoice
title: Send an invoice
description: Send an invoice to a client. Use when someone should be billed.
input:
  client: Who to bill.
  amount: How much, including currency.
---
\`\`\`

\`input\` is optional. Without it the tool takes a single optional \`input\` string. \`timeout\` is optional, in seconds, capped at 120.

## Scripts

The working directory is the tool folder. Environment:

- \`OPENBOT_PROJECT\` the team folder
- \`OPENBOT_AGENT_ID\` and \`OPENBOT_AGENT_NAME\` who called it
- \`OPENBOT_TOOL\` this tool's id

Stdin is the JSON arguments. Stdout is what the caller reads. Stderr on a non-zero exit is the error.

After \`create_tool\` (or after you write a folder yourself) the tool is live on the next turn. Everyone with all tools may use it; otherwise it has to be on their list.

To change a tool, call \`create_tool\` again with the same name, or edit the files under \`tools/\`.
`;

export async function ensureTeamTools(toolsDir: string): Promise<void> {
  await fs.mkdir(toolsDir, { recursive: true });
  const dest = path.join(toolsDir, HANDBOOK_FOLDER, 'TOOL.md');
  try {
    await fs.access(dest);
  } catch {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, HANDBOOK_MARKDOWN, 'utf8');
  }
}
