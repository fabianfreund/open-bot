import type { Skill } from '../skill.js';
import { askUserSkill } from './ask-user.js';
import { hireBotSkill } from './hire-bot.js';
import { listBotsSkill } from './list-bots.js';
import { messageBotSkill } from './message-bot.js';
import { rememberSkill } from './remember.js';

/**
 * Skills that ship with OpenBot. File reading, writing, searching, and running
 * commands are not here, Codex already provides those. These are the ones
 * that make a team a team.
 *
 * To add a skill: create a file next to this one and add it to the array.
 */
export const builtinSkills: Skill<any>[] = [
  listBotsSkill,
  hireBotSkill,
  messageBotSkill,
  askUserSkill,
  rememberSkill,
];

export { listBotsSkill, hireBotSkill, messageBotSkill, askUserSkill, rememberSkill };
