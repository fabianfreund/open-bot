import type { Provider } from './provider.js';
import { CodexProvider } from './codex/codex-provider.js';
import { EchoProvider } from './echo/echo-provider.js';

/**
 * Providers that ship with OpenBot. To add one: create a file next to these
 * and add it to the array. `OpenBotRuntime.open` registers the lot.
 */
export function builtinProviders(): Provider[] {
  return [new CodexProvider(), new EchoProvider()];
}
