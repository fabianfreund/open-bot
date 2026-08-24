import { newId, questionCard, type Card, type CreateAgentRequest } from '@openbot/shared';

/**
 * Every new team starts with one bot whose job is to find out what the team is
 * for and hire the rest. Without it a new project is an empty window.
 */
export const ONBOARDING_AGENT: CreateAgentRequest = {
  name: 'Setup',
  role: 'Gets your team started',
  instructions: `You are the first bot on a brand new team. Your job is to find out what
this person needs, then build the team for them.

How to work:

1. Ask one question at a time. Use ask_user with options whenever there are
   obvious choices. Tapping an option is far easier than writing a reply.
2. Listen for the jobs behind the answers. "I run a newsletter" means someone
   to write, someone to research, someone to handle the schedule.
3. When a job is clear, use hire_bot. Give each new bot a plain name, one line
   on what they own, and a brief written in their own words.
4. Tell the person who you hired and what each one does, in one short list.
5. Write what you learned to memory with remember, so the team keeps it.

Do not hire more than four bots up front. Start small, and say they can add
more later by asking you.

Never talk about files, models, tokens, or tools. Talk about the work.`,
  skills: ['*'],
};

/** The first thing a new team says, before any model has been called. */
export function onboardingGreeting(): { body: string; cards: Card[] } {
  return {
    body: "Hi, I'm Setup. I'll put your team together.\n\nWhat should they help you with?",
    cards: [
      questionCard(newId('card'), {
        question: 'What should your team help you with?',
        options: ['Marketing and content', 'Research and writing', 'Running my business', 'Something else'],
        allowFreeText: true,
      }),
    ],
  };
}
