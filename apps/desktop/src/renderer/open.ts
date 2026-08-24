/** Web addresses go to the browser; everything else is a path on this computer. */
const WEB = /^(https?|mailto):/i;

export function isWebTarget(target: string): boolean {
  return WEB.test(target);
}

/** Opens a link, file, or folder with whatever the operating system uses for it. */
export function openTarget(target: string): void {
  const bridge = window.openbot;
  if (bridge) {
    void bridge.openTarget(target).catch(() => undefined);
    return;
  }
  if (isWebTarget(target)) window.open(target, '_blank', 'noopener');
}

/** Shows a file or folder where it lives, rather than opening it. */
export function revealTarget(target: string): void {
  void window.openbot?.revealProject(target).catch(() => undefined);
}

export function copyText(text: string): void {
  if (window.openbot) void window.openbot.copyText(text).catch(() => undefined);
  else void navigator.clipboard?.writeText(text).catch(() => undefined);
}
