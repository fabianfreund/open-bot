import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const CANDIDATES = [
  'tailscale',
  '/usr/local/bin/tailscale',
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale',
];

/**
 * Best-effort lookup of this machine's tailnet addresses, so the host can show
 * an address another device can reach. Absence of Tailscale is not an error.
 */
export async function tailscaleAddresses(): Promise<string[]> {
  for (const bin of CANDIDATES) {
    try {
      const { stdout } = await run(bin, ['ip', '-4'], { timeout: 3000 });
      const addresses = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      if (addresses.length) return addresses;
    } catch {
      // try the next candidate
    }
  }
  return [];
}
