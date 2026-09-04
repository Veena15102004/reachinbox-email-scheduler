type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || "info";

function formatMessage(level: LogLevel, component: string, message: string): string {
  const ts = new Date().toISOString();
  return `${ts} [${level.toUpperCase()}] [${component}] ${message}`;
}

export const logger = {
  debug(component: string, message: string) {
    if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.debug) {
      console.debug(formatMessage("debug", component, message));
    }
  },
  info(component: string, message: string) {
    if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.info) {
      console.info(formatMessage("info", component, message));
    }
  },
  warn(component: string, message: string) {
    if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.warn) {
      console.warn(formatMessage("warn", component, message));
    }
  },
  error(component: string, message: string) {
    if (LEVEL_ORDER[currentLevel] <= LEVEL_ORDER.error) {
      console.error(formatMessage("error", component, message));
    }
  },
};
