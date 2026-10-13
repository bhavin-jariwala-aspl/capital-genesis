'use strict';

/**
 * Simple logging service to centralize application logging.
 * Provides different log levels and can be extended to integrate with external logging services.
 */
class LoggingService {
  constructor(options = {}) {
    this.level = options.level || 'info'; // debug, info, warn, error
    this.service = options.service || 'genesis';
    this.enableConsole = process.env.NODE_ENV !== 'production';
  }

  /**
   * Log levels in order of severity
   */
  static LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  /**
   * Check if a message should be logged based on current level
   */
  #shouldLog(level) {
    return LoggingService.LEVELS[level] >= LoggingService.LEVELS[this.level];
  }

  /**
   * Format log message with timestamp and context
   */
  #formatMessage(level, message, context = {}) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${this.service}] [${level.toUpperCase()}]`;
    
    if (typeof message === 'object') {
      return { timestamp, service: this.service, level, ...message, ...context };
    }
    
    return { timestamp, service: this.service, level, message, ...context };
  }

  /**
   * Output log message (console in development, can be extended for production)
   */
  #output(level, formattedMessage) {
    if (this.enableConsole) {
      const method = level === 'debug' ? 'log' : level;
      console[method](formattedMessage);
    }
    
    // TODO: Integrate with external logging service (e.g., Winston, Pino)
    // TODO: Send logs to monitoring service in production
  }

  debug(message, context = {}) {
    if (this.#shouldLog('debug')) {
      this.#output('debug', this.#formatMessage('debug', message, context));
    }
  }

  info(message, context = {}) {
    if (this.#shouldLog('info')) {
      this.#output('info', this.#formatMessage('info', message, context));
    }
  }

  warn(message, context = {}) {
    if (this.#shouldLog('warn')) {
      this.#output('warn', this.#formatMessage('warn', message, context));
    }
  }

  error(message, context = {}) {
    if (this.#shouldLog('error')) {
      this.#output('error', this.#formatMessage('error', message, context));
    }
  }

  /**
   * Log service-specific events
   */
  service(serviceName, event, details = {}) {
    this.info(`${serviceName}: ${event}`, details);
  }

  /**
   * Log workflow events
   */
  workflow(workflowId, event, details = {}) {
    this.info(`Workflow ${workflowId}: ${event}`, { workflow_id: workflowId, ...details });
  }

  /**
   * Log template creation events
   */
  template(templateName, event, details = {}) {
    this.info(`Template "${templateName}": ${event}`, { template_name: templateName, ...details });
  }
}

// Create default instance
const logger = new LoggingService({
  level: process.env.LOG_LEVEL || 'info',
  service: 'genesis-crm',
});

module.exports = { LoggingService, logger };