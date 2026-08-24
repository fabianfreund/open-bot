import { z } from 'zod';
import { fail, ok, type Skill } from '../skill.js';

const Input = z.object({
  to: z.string().min(1).describe('The colleague’s name.'),
  message: z.string().min(1).describe('What you need from them. Be specific.'),
  wait: z
    .boolean()
    .default(false)
    .describe('Wait for their answer before you finish. Leave false for anything slow.'),
});

export const messageBotSkill: Skill<z.infer<typeof Input>> = {
  id: 'message_bot',
  title: 'Message a colleague',
  description:
    'Send work to another bot. By default you keep going and their reply shows up in this chat when it is ready.',
  input: Input,
  sensitive: true,
  async run(input, ctx) {
    const target = ctx.host.getAgent(input.to);
    if (!target) {
      const names = ctx.host.listAgents().map((a) => a.name).join(', ');
      return fail(`No bot called "${input.to}". On the team: ${names || 'nobody yet'}.`);
    }
    if (target.id === ctx.agent.id) return fail('You cannot message yourself.');

    const reply = await ctx.host.sendToAgent({
      from: ctx.agent.id,
      to: target.id,
      text: input.message,
      originConversationId: ctx.conversationId,
      wait: input.wait,
    });

    return input.wait && reply
      ? ok(`${target.name} replied:\n\n${reply}`)
      : ok(`Sent to ${target.name}. Their reply will appear in this chat.`);
  },
};
