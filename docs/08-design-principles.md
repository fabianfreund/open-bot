# Design principles

OpenBot is for people who are not developers. A marketer, a shop owner, a
writer. The tools this is descended from are built for engineers, and they read
like it. That is the thing to get away from.

## Talk about the work, not the machinery

Nowhere in the interface do the words _token_, _model_, _prompt_, _context
window_, _sandbox_, or _repository_ appear. A bot does not "execute a tool
call"; it messages a colleague. A bot is not "an agent instance"; it is someone
who works for you.

This runs deeper than labels. `humanize.ts` in the Codex provider translates
what the model actually did into what a person would say it did:

| What happened                       | What is shown      |
| ----------------------------------- | ------------------ |
| `bash -lc 'rg "schedule" .'`        | Searched the files |
| `apply_patch` on three files        | Updated 3 files    |
| `mcp_tool_call openbot/message_bot` | Messaged Social    |

The raw detail is one click away for anyone who wants it. It is never the
first thing you see.

## No explaining text

No helper paragraphs under headings, no tooltips restating the label, no empty
states with a friendly essay. If a screen needs a paragraph to explain it, the
screen is wrong.

The onboarding is two buttons. The hire form is three fields. Settings is a
list of values.

## Tapping beats typing

When a bot needs something from you, it should offer options you can tap. That
is what cards are for, and why `ask_user` takes an `options` array and the
brief tells bots to use it.

Someone who will not write a paragraph to a bot will happily tap "Email
newsletter".

## A new team is never empty

Creating a team immediately hires **Setty**, which introduces itself and asks
what this is about. The greeting and its first question are written in code,
not generated, so a brand-new project is useful the instant it opens and does
not depend on a model call succeeding.

Setty's job is to interview you (follow-ups in one card when they belong
together), set the project up, hire the rest of the team, and change it later
when the work changes. When the work needs more than one specialist she hires
a manager, pins them, and finishes by telling you the team is ready: bots are
on the left, who to open for what, or just talk to the manager. Come back to
her to change the team. New hires say hello in their own chat. At most four
bots to start, because a wall of new colleagues is not a good first impression.

## Bots are colleagues, not commands

They have faces (`react-nice-avatar`, derived from the bot's slug so it is
stable), names, and one line about what they own. They message each other and
they message you. When one asks another for something, you see it happen and
you see the answer arrive.

## Nothing is ever deleted

Removing a bot archives it. Its folder, its work, and its history stay. Someone
who is not sure what they are doing should not be able to lose work by
clicking the wrong thing.

## Small files, obvious seams

Every subsystem is a registry you add to: providers, skills, cards, file
kinds, storage paths. If adding a feature means editing more than two existing
files plus one new one, the seam is in the wrong place.
