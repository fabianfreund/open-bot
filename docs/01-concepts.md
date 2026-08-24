# Concepts

The words this project uses, and what they mean. If a word here starts meaning
two things, split it into two words rather than overloading it.

## Team

Everything that lives in one project folder: the bots, their work, their chat
history, and the settings. One folder, one team. Move the folder and the whole
team moves with it.

## Project

The folder itself, and specifically `openbot.json` at its root. Documented in
[03-project-format.md](03-project-format.md).

## Bot (agent)

One worker with a name, a job, a brief, and its own folder. **Bot** is the word
the interface uses, because that is what a person calls it. **Agent** is the
word the code uses, because that is what the model literature calls it. They
are the same thing.

A bot has:

- a **name**, how everyone refers to it
- a **role**, one line on what it owns
- a **brief** (`instructions`), its standing orders
- a **workspace**, `agents/<slug>/workspace/`, its own folder
- a **provider**, which model backend runs its turns
- **skills**, which capabilities it may use

## Conversation

A chat log. Two kinds:

- **dm**, you and one bot
- **channel**, two bots talking to each other, which you can read

Conversation ids are derived, not random: `dm.<agentId>` and
`a2a.<agentA>.<agentB>` with the ids sorted. The same two bots always share one
channel.

## Turn

One round: something arrives, a bot thinks and acts, a reply comes back. A turn
is the unit of work the runtime schedules. One at a time per conversation, so
two messages to the same bot queue rather than collide.

## Provider

A model backend. Codex ships with OpenBot and runs on your ChatGPT
subscription. Providers are pluggable; see [04-providers.md](04-providers.md).

## Skill

Something a bot can do beyond talking: hire a colleague, pass work along, ask
you a question, write a team note. Skills are pluggable; see
[05-skills.md](05-skills.md).

Reading files, writing files, searching, and running commands are **not**
skills. Codex already provides those. OpenBot's skills are the ones that make
a collection of bots into a team.

## Card

An interactive block rendered inline in the chat. Today that means a question
with tappable answers. Cards exist so a bot can ask for something without making
you write a sentence. See [05-skills.md](05-skills.md#cards).

## Host and client

The computer running the team is the **host**. Any app connected to it is a
**client**. The desktop app can be either. The host holds all state; a client
holds none.
