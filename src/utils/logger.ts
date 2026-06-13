export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

function getLogLevel(): LogLevel {
  const env = process.env.WALLET_PASS_LOG_LEVEL?.toUpperCase();
  if (env === 'DEBUG' || process.env.WALLET_PASS_DEBUG === 'true' || process.env.WALLET_PASS_DEBUG === '1') {
    return LogLevel.DEBUG;
  }
  if (env === 'INFO') return LogLevel.INFO;
  if (env === 'WARN') return LogLevel.WARN;
  if (env === 'ERROR') return LogLevel.ERROR;
  return LogLevel.INFO;
}

function formatMessage(level: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [wallet-pass-gen] [${level}]`;
  if (data !== undefined) {
    const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
    return `${prefix} ${message} ${dataStr}`;
  }
  return `${prefix} ${message}`;
}

export const logger = {
  debug(message: string, data?: unknown): void {
    if (getLogLevel() <= LogLevel.DEBUG) {
      console.debug(formatMessage('DEBUG', message, data));
    }
  },

  info(message: string, data?: unknown): void {
    if (getLogLevel() <= LogLevel.INFO) {
      console.info(formatMessage('INFO', message, data));
    }
  },

  warn(message: string, data?: unknown): void {
    if (getLogLevel() <= LogLevel.WARN) {
      console.warn(formatMessage('WARN', message, data));
    }
  },

  error(message: string, data?: unknown): void {
    if (getLogLevel() <= LogLevel.ERROR) {
      console.error(formatMessage('ERROR', message, data));
    }
  },
};

export default logger;
