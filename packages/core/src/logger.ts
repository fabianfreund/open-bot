export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, meta?: unknown): void;
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
  child(scope: string): Logger;
}

function emit(scope: string, level: LogLevel, min: LogLevel, msg: string, meta?: unknown) {
  if (ORDER[level] < ORDER[min]) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase().padEnd(5)} ${scope} ${msg}`;
  const stream = level === 'error' || level === 'warn' ? console.error : console.log;
  if (meta === undefined) stream(line);
  else stream(line, meta);
}

export function createLogger(scope = 'openbot', min: LogLevel = 'info'): Logger {
  return {
    debug: (m, x) => emit(scope, 'debug', min, m, x),
    info: (m, x) => emit(scope, 'info', min, m, x),
    warn: (m, x) => emit(scope, 'warn', min, m, x),
    error: (m, x) => emit(scope, 'error', min, m, x),
    child: (s) => createLogger(`${scope}:${s}`, min),
  };
}
