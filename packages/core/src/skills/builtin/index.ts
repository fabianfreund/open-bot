import type { Skill } from '../skill.js';
import { askUserSkill } from './ask-user.js';
import { changeBotSkill } from './change-bot.js';
import { createToolSkill } from './create-tool.js';
import { hireBotSkill } from './hire-bot.js';
import { listBotsSkill } from './list-bots.js';
import { lookBackSkill } from './look-back.js';
import { messageBotSkill } from './message-bot.js';
import { readNotesSkill } from './read-notes.js';
import { recallSkill } from './recall.js';
import { rememberSkill } from './remember.js';
import { retireBotSkill } from './retire-bot.js';
import { setupTeamSkill } from './setup-team.js';
import { shareLinkSkill } from './share-link.js';

/**
 * Tools that ship with OpenBot. File reading, writing, searching, and running
 * commands are not here, Codex already provides those. These are the ones
 * that make a team a team. A playbook that belongs to one team is a folder
 * under `tools/`, not an entry here.
 *
 * To add a builtin: create a file next to this one and add it to the array.
 * Briefs pick it up from the registry; nothing else to edit.
 */
export const builtinSkills: Skill<any>[] = [
  listBotsSkill,
  hireBotSkill,
  changeBotSkill,
  retireBotSkill,
  messageBotSkill,
  askUserSkill,
  shareLinkSkill,
  lookBackSkill,
  setupTeamSkill,
  createToolSkill,
  rememberSkill,
  recallSkill,
  readNotesSkill,
];

export {
  listBotsSkill,
  hireBotSkill,
  changeBotSkill,
  retireBotSkill,
  messageBotSkill,
  askUserSkill,
  shareLinkSkill,
  lookBackSkill,
  setupTeamSkill,
  createToolSkill,
  rememberSkill,
  recallSkill,
  readNotesSkill,
};
