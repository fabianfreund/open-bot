import type { ProviderHealth, ProviderInfo } from '@openbot/shared';
import type { Provider, ProviderContext, ProviderRunInput, ProviderRunResult } from '../provider.js';

/**
 * A provider with no external dependencies. Useful for developing the UI, for
 * tests, and for proving that swapping providers is a one-line change.
 */
export class EchoProvider implements Provider {
  readonly info: ProviderInfo = {
    id: 'echo',
    label: 'Echo (offline)',
    description: 'Replies without calling a model. For testing the app.',
    supportsSkills: false,
    options: [],
  };

  async run(input: ProviderRunInput, context: ProviderContext): Promise<ProviderRunResult> {
    context.emit({ kind: 'status', status: 'thinking' });
    context.emit({
      kind: 'trace',
      id: 'echo-1',
      traceKind: 'reasoning',
      title: 'Read your message',
      status: 'completed',
    });
    const text = `${context.agent.name} here. You said: "${input.text}"`;
    context.emit({ kind: 'text-final', text });
    return { finalText: text };
  }

  async health(): Promise<ProviderHealth> {
    return { id: this.info.id, ok: true, detail: 'Always available.' };
  }
}
