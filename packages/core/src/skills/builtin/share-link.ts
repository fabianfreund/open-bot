import path from 'node:path';
import { z } from 'zod';
import { linkCard, newId, type LinkItem } from '@openbot/shared';
import { fail, ok, type Skill } from '../skill.js';

const Item = z.object({
  label: z.string().min(1).describe('What the person sees on the button, e.g. "Open the draft".'),
  target: z
    .string()
    .min(1)
    .describe('A web address, or the path to a file or folder you made. Relative to your folder.'),
  note: z
    .string()
    .optional()
    .describe('One short line about what it is. Skip it if the label says enough.'),
});

const Input = z.object({
  title: z.string().optional().describe('One line above the buttons, e.g. "The draft is ready".'),
  items: z.array(Item).min(1).max(6).describe('One button per thing worth opening.'),
});

/** Anything that is not a URL is treated as a path in the agent's workspace. */
function resolve(target: string, workspace: string): string {
  if (/^(https?|mailto):/i.test(target)) return target;
  return path.isAbsolute(target) ? target : path.resolve(workspace, target);
}

export const shareLinkSkill: Skill<z.infer<typeof Input>> = {
  id: 'share_link',
  title: 'Give them something to open',
  description:
    'Put buttons in the chat that open what you made: a file, a folder, or a web page. Use this instead of pasting a path into your reply.',
  input: Input,
  sensitive: true,
  async run(input, ctx) {
    const workspace = ctx.host.workspaceFor(ctx.agent.id);
    const items: LinkItem[] = input.items.map((item) => ({
      label: item.label,
      target: resolve(item.target, workspace),
      ...(item.note ? { note: item.note } : {}),
    }));
    if (items.length === 0) return fail('Nothing to open.');

    await ctx.host.sendToUser({
      from: ctx.agent.id,
      text: input.title ?? '',
      cards: [linkCard(newId('card'), { items })],
    });
    return ok('The buttons are in their chat. Do not repeat the paths in your reply.');
  },
};
